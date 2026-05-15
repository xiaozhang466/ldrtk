import os
import json
import time
import fcntl
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any
from enum import Enum
from config.config import Config


class NavigationStatus(Enum):
    """导航状态枚举"""
    IDLE = 'idle'             # 空闲
    STARTING = 'starting'     # 启动中
    RUNNING = 'running'       # 运行中
    STOPPING = 'stopping'     # 停止中
    ERROR = 'error'           # 错误


class NavigationStateManager:
    """导航状态管理器 — WAL 日志 + 定期快照"""

    def __init__(self, base_path: str = None):
        self.base_path = Path(base_path or Config.MAP_BASE_PATH)
        self.state_file = self.base_path / '.navigation_state.json'
        self.state_backup = self.base_path / '.navigation_state.json.bak'
        self.wal_file = self.base_path / '.navigation_wal.log'
        self.lock_file = self.base_path / '.navigation_state.lock'

        self._ensure_base_path()
        self._lock_fd = None

        # 当前状态
        self.current_state = {
            'version': '1.0',
            'status': NavigationStatus.IDLE.value,
            'map_name': None,
            'start_time': None,
            'localization_status': 'unknown',   # unknown / initializing / ok / error
            'cmd_vel_active': False,
            'last_update': None
        }

    def _ensure_base_path(self):
        self.base_path.mkdir(parents=True, exist_ok=True)

    def acquire_lock(self, timeout: float = 5.0) -> bool:
        try:
            self._lock_fd = open(self.lock_file, 'w')
            start_time = time.time()
            while True:
                try:
                    fcntl.flock(self._lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    return True
                except BlockingIOError:
                    if time.time() - start_time > timeout:
                        self._lock_fd.close()
                        self._lock_fd = None
                        return False
                    time.sleep(0.1)
        except Exception as e:
            print(f"获取锁失败：{e}")
            if self._lock_fd:
                self._lock_fd.close()
                self._lock_fd = None
            return False

    def release_lock(self):
        if self._lock_fd:
            try:
                fcntl.flock(self._lock_fd, fcntl.LOCK_UN)
                self._lock_fd.close()
            except:
                pass
            finally:
                self._lock_fd = None

    def _write_wal(self, action: str, data: Dict[str, Any]):
        entry = {
            'timestamp': time.time(),
            'action': action,
            'data': data
        }
        with open(self.wal_file, 'a') as f:
            f.write(json.dumps(entry) + '\n')
            f.flush()
            os.fsync(f.fileno())

    def _save_snapshot(self):
        try:
            with open(self.state_file, 'w') as f:
                json.dump(self.current_state, f, indent=2)
                f.flush()
                os.fsync(f.fileno())
            if self.state_file.exists():
                import shutil
                shutil.copy2(self.state_file, self.state_backup)
        except Exception as e:
            print(f"保存快照失败：{e}")

    def update_state(self, **kwargs):
        if not self.acquire_lock():
            raise RuntimeError("无法获取状态锁")
        try:
            for key, value in kwargs.items():
                if key in self.current_state:
                    self.current_state[key] = value
            self.current_state['last_update'] = datetime.now().isoformat()
            self._write_wal('update', kwargs)
            wal_lines = 0
            if self.wal_file.exists():
                with open(self.wal_file, 'r') as f:
                    wal_lines = sum(1 for _ in f)
            if wal_lines >= 10:
                self._save_snapshot()
                self.wal_file.unlink()
        finally:
            self.release_lock()

    def set_status(self, status: NavigationStatus):
        self.update_state(status=status.value)

    def start_navigation(self, map_name: str):
        self.update_state(
            status=NavigationStatus.STARTING.value,
            map_name=map_name,
            start_time=datetime.now().isoformat(),
            localization_status='initializing',
            cmd_vel_active=False
        )

    def running(self):
        self.update_state(
            status=NavigationStatus.RUNNING.value,
            localization_status='ok',
            cmd_vel_active=True
        )

    def stop_navigation(self):
        self.update_state(
            status=NavigationStatus.IDLE.value,
            cmd_vel_active=False,
            localization_status='unknown'
        )

    def error_navigation(self, error_message: str):
        self.update_state(
            status=NavigationStatus.ERROR.value,
            error_message=error_message
        )

    def get_state(self) -> Dict[str, Any]:
        if not self.acquire_lock():
            return self.current_state.copy()
        try:
            if self.state_file.exists():
                with open(self.state_file, 'r') as f:
                    snapshot = json.load(f)
                    self.current_state.update(snapshot)
            if self.wal_file.exists():
                with open(self.wal_file, 'r') as f:
                    for line in f:
                        entry = json.loads(line.strip())
                        if entry['action'] == 'update':
                            self.current_state.update(entry['data'])
            return self.current_state.copy()
        finally:
            self.release_lock()

    def recover_state(self) -> Dict[str, Any]:
        state = self.get_state()
        if state['status'] in [NavigationStatus.RUNNING.value,
                               NavigationStatus.STARTING.value,
                               NavigationStatus.STOPPING.value]:
            last_update = state.get('last_update')
            if last_update:
                update_time = datetime.fromisoformat(last_update)
                delta = datetime.now() - update_time
                if delta.total_seconds() > 86400:
                    state['status'] = NavigationStatus.ERROR.value
                    state['error_message'] = f'导航异常退出 ({delta.total_seconds()/3600:.1f}小时前)'
                    self.update_state(
                        status=NavigationStatus.ERROR.value,
                        error_message=state['error_message']
                    )
        return state
