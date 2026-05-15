import os
import json
import time
import fcntl
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any
from enum import Enum
from config.config import Config

class MappingStatus(Enum):
    """建图状态枚举"""
    IDLE = 'idle'           # 空闲
    STARTING = 'starting'   # 启动中
    RUNNING = 'running'     # 建图中
    STOPPING = 'stopping'   # 停止中
    COMPLETED = 'completed' # 已完成
    ERROR = 'error'         # 错误

class MappingStateManager:
    """建图状态管理器 - WAL 日志 + 定期快照"""
    
    def __init__(self, base_path: str = None):
        self.base_path = Path(base_path or Config.MAP_BASE_PATH)
        self.state_file = self.base_path / '.mapping_state.json'
        self.state_backup = self.base_path / '.mapping_state.json.bak'
        self.wal_file = self.base_path / '.mapping_wal.log'
        self.lock_file = self.base_path / '.mapping_state.lock'
        
        self._ensure_base_path()
        self._lock_fd = None
        
        # 当前状态
        self.current_state = {
            'version': '1.0',
            'status': MappingStatus.IDLE.value,
            'map_name': None,
            'start_time': None,
            'frame_count': 0,
            'trajectory': [],
            'checkpoint_file': None,
            'last_update': None
        }
    
    def _ensure_base_path(self):
        """确保基础路径存在"""
        self.base_path.mkdir(parents=True, exist_ok=True)
    
    def acquire_lock(self, timeout: float = 5.0) -> bool:
        """获取文件锁"""
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
        """释放文件锁"""
        if self._lock_fd:
            try:
                fcntl.flock(self._lock_fd, fcntl.LOCK_UN)
                self._lock_fd.close()
            except:
                pass
            finally:
                self._lock_fd = None
    
    def _write_wal(self, action: str, data: Dict[str, Any]):
        """追加写入 WAL 日志"""
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
        """原子保存快照"""
        try:
            # 1. 直接写入文件（简化逻辑，避免原子替换问题）
            with open(self.state_file, 'w') as f:
                json.dump(self.current_state, f, indent=2)
                f.flush()
                os.fsync(f.fileno())
            
            # 2. 备份旧文件
            if self.state_file.exists():
                import shutil
                shutil.copy2(self.state_file, self.state_backup)
        except Exception as e:
            print(f"保存快照失败：{e}")
    
    def update_state(self, **kwargs):
        """更新状态"""
        if not self.acquire_lock():
            raise RuntimeError("无法获取状态锁")
        
        try:
            # 更新状态
            for key, value in kwargs.items():
                if key in self.current_state:
                    self.current_state[key] = value
            
            self.current_state['last_update'] = datetime.now().isoformat()
            
            # 写 WAL
            self._write_wal('update', kwargs)
            
            # 定期保存快照 (每 10 次 WAL 条目)
            wal_lines = 0
            if self.wal_file.exists():
                with open(self.wal_file, 'r') as f:
                    wal_lines = sum(1 for _ in f)
            
            if wal_lines >= 10:
                self._save_snapshot()
                # 清理 WAL
                self.wal_file.unlink()
                Path(f"{self.wal_file}.old").touch()
                
        finally:
            self.release_lock()
    
    def set_status(self, status: MappingStatus, map_name: Optional[str] = None):
        """设置建图状态"""
        self.update_state(
            status=status.value,
            map_name=map_name or self.current_state.get('map_name')
        )
    
    def start_mapping(self, map_name: str):
        """开始建图"""
        self.update_state(
            status=MappingStatus.STARTING.value,
            map_name=map_name,
            start_time=datetime.now().isoformat(),
            frame_count=0,
            trajectory=[],
            checkpoint_file=None
        )
    
    def update_frame(self, frame_count: int, trajectory_point: Optional[list] = None):
        """更新帧计数和轨迹"""
        update_data = {
            'frame_count': frame_count,
            'last_update': datetime.now().isoformat()
        }
        
        if trajectory_point:
            trajectory = self.current_state.get('trajectory', [])
            trajectory.append(trajectory_point)
            update_data['trajectory'] = trajectory
        
        self.update_state(**update_data)
    
    def complete_mapping(self):
        """完成建图"""
        self.update_state(
            status=MappingStatus.COMPLETED.value,
            last_update=datetime.now().isoformat()
        )
    
    def error_mapping(self, error_message: str):
        """建图出错"""
        self.update_state(
            status=MappingStatus.ERROR.value,
            error_message=error_message,
            last_update=datetime.now().isoformat()
        )
    
    def get_state(self) -> Dict[str, Any]:
        """获取当前状态"""
        # 只读操作，使用共享锁（不阻塞其他读）
        if not self.acquire_lock():
            # 如果无法获取锁，返回内存中的状态
            return self.current_state.copy()
        
        try:
            # 加载快照
            if self.state_file.exists():
                with open(self.state_file, 'r') as f:
                    snapshot = json.load(f)
                    self.current_state.update(snapshot)
            
            # 回放 WAL
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
        """异常恢复状态"""
        state = self.get_state()
        
        # 检查状态是否过期 (>24 小时视为异常)
        if state['status'] in [MappingStatus.RUNNING.value, MappingStatus.STARTING.value]:
            last_update = state.get('last_update')
            if last_update:
                update_time = datetime.fromisoformat(last_update)
                delta = datetime.now() - update_time
                
                if delta.total_seconds() > 86400:  # 24 小时
                    # 标记为错误
                    state['status'] = MappingStatus.ERROR.value
                    state['error_message'] = f'建图超时 ({delta.total_seconds()/3600:.1f}小时)'
                    self.update_state(
                        status=MappingStatus.ERROR.value,
                        error_message=state['error_message']
                    )
        
        # 如果状态是 completed 且没有地图名，重置为 idle
        if state['status'] == MappingStatus.COMPLETED.value and not state.get('map_name'):
            self.update_state(status=MappingStatus.IDLE.value)
            return self.get_state()
        
        return state
    
    def get_history(self, limit: int = 10) -> list:
        """获取建图历史"""
        history_file = self.base_path / '.mapping_history.json'
        
        if not history_file.exists():
            return []
        
        with open(history_file, 'r') as f:
            history = json.load(f)
        
        return history[-limit:]
    
    def add_history_entry(self, entry: Dict[str, Any]):
        """添加历史记录"""
        history_file = self.base_path / '.mapping_history.json'
        
        history = []
        if history_file.exists():
            with open(history_file, 'r') as f:
                history = json.load(f)
        
        history.append({
            **entry,
            'created_at': datetime.now().isoformat()
        })
        
        # 只保留最近 100 条
        history = history[-100:]
        
        with open(history_file, 'w') as f:
            json.dump(history, f, indent=2)
