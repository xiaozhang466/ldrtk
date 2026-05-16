from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from datetime import datetime
from pathlib import Path
from typing import Dict, Optional
import os
import shlex
import signal
import subprocess
import threading
import time

from config.config import Config
from models.mapping_state import MappingStateManager, MappingStatus


lidar_localization_bp = Blueprint('lidar_localization', __name__, url_prefix='/api/lidar-localization')

PROJECT_ROOT = Path(Config.PROJECT_ROOT)
MAP_BASE_PATH = Path(Config.MAP_BASE_PATH)
ENV_SCRIPT = PROJECT_ROOT / 'nav' / 'scripts' / 'env.sh'
LOG_DIR = PROJECT_ROOT / 'data' / 'logs' / 'lidar_localization'

LIDAR_TOPIC = '/lslidar_point_cloud'
IMU_TOPIC = '/IMU_data'
ODOM_TOPIC = '/Odometry'

SENSOR_TIMEOUT_SECONDS = int(os.environ.get('LIDAR_LOCALIZATION_SENSOR_TIMEOUT_SECONDS', '30'))
ODOM_TIMEOUT_SECONDS = int(os.environ.get('LIDAR_LOCALIZATION_ODOM_TIMEOUT_SECONDS', '30'))

mapping_state_manager = MappingStateManager()
process_lock = threading.Lock()
state_lock = threading.Lock()
processes: Dict[str, subprocess.Popen] = {}
state = {
    'status': 'idle',
    'phase': 'idle',
    'map_name': None,
    'start_time': None,
    'lidar_ready': False,
    'imu_ready': False,
    'localization_ready': False,
    'error_message': None,
}


def _lidar_map_dir(map_name: str) -> Path:
    return MAP_BASE_PATH / map_name / 'lidar'


def _has_lidar_map(map_name: Optional[str]) -> bool:
    if not map_name:
        return False
    lidar_dir = _lidar_map_dir(map_name)
    return (
        lidar_dir.exists()
        and (lidar_dir / 'pose.json').exists()
        and (lidar_dir / 'pcd').is_dir()
        and any((lidar_dir / 'pcd').glob('*.pcd'))
    )


def _validate_map_name(map_name: str) -> Path:
    if not map_name:
        raise ValueError('地图名称不能为空')

    map_path = MAP_BASE_PATH / map_name
    if not map_path.exists() or not map_path.is_dir():
        raise FileNotFoundError(f'地图不存在：{map_name}')

    lidar_dir = _lidar_map_dir(map_name)
    pose_file = lidar_dir / 'pose.json'
    pcd_dir = lidar_dir / 'pcd'
    if not lidar_dir.exists():
        raise FileNotFoundError(f'雷达定位地图目录不存在：{lidar_dir}')
    if not pose_file.exists():
        raise FileNotFoundError(f'雷达定位位姿文件不存在：{pose_file}')
    if not pcd_dir.is_dir() or not any(pcd_dir.glob('*.pcd')):
        raise FileNotFoundError(f'雷达定位 PCD 目录为空或不存在：{pcd_dir}')

    return lidar_dir


def _set_state(**updates) -> None:
    with state_lock:
        state.update(updates)


def _log_file(name: str) -> Path:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    return LOG_DIR / f'{name}.log'


def _read_log_tail(max_chars: int = 5000) -> str:
    chunks = []
    for name in ['lidar', 'imu', 'localization']:
        path = _log_file(name)
        if path.exists():
            chunks.append(f'===== {name} =====\n{path.read_text(encoding="utf-8", errors="replace")[-max_chars:]}')
    return '\n'.join(chunks)[-max_chars:]


def _ros_command(command: str, timeout: float = 10.0) -> subprocess.CompletedProcess:
    if not ENV_SCRIPT.exists():
        raise RuntimeError(f'ROS 环境脚本不存在：{ENV_SCRIPT}')
    script = f'source {shlex.quote(str(ENV_SCRIPT))} && {command}'
    return subprocess.run(
        ['bash', '-c', script],
        cwd=str(PROJECT_ROOT),
        capture_output=True,
        text=True,
        timeout=timeout,
    )


def _wait_for_topic(topic: str, timeout_seconds: int) -> bool:
    try:
        result = _ros_command(
            f'rostopic echo -n 1 {shlex.quote(topic)}',
            timeout=float(timeout_seconds),
        )
        return result.returncode == 0
    except subprocess.TimeoutExpired:
        return False


def _start_process(name: str, args) -> subprocess.Popen:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    with process_lock:
        existing = processes.get(name)
        if existing and existing.poll() is None:
            return existing

        log_path = _log_file(name)
        cmd = ' '.join(shlex.quote(str(part)) for part in args)
        script = f'source {shlex.quote(str(ENV_SCRIPT))} && exec {cmd}'
        log_handle = open(log_path, 'a', encoding='utf-8')
        log_handle.write(f'\n\n===== {datetime.now().isoformat()} start {name}: {cmd} =====\n')
        log_handle.flush()

        process = subprocess.Popen(
            ['bash', '-c', script],
            cwd=str(PROJECT_ROOT),
            stdout=log_handle,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
        log_handle.close()
        (LOG_DIR / f'{name}.pid').write_text(str(process.pid))
        processes[name] = process
        return process


def _stop_process(name: str, timeout: float = 8.0) -> None:
    with process_lock:
        process = processes.get(name)

    pid = process.pid if process and process.poll() is None else None
    pid_file = LOG_DIR / f'{name}.pid'
    if pid is None and pid_file.exists():
        try:
            pid = int(pid_file.read_text().strip())
        except ValueError:
            pid = None

    if pid is None:
        return

    try:
        os.killpg(os.getpgid(pid), signal.SIGTERM)
        if process:
            process.wait(timeout=timeout)
        else:
            time.sleep(0.5)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(os.getpgid(pid), signal.SIGKILL)
            if process:
                process.wait(timeout=3)
        except ProcessLookupError:
            pass
    except ProcessLookupError:
        pass
    finally:
        with process_lock:
            processes.pop(name, None)
        try:
            pid_file.unlink()
        except FileNotFoundError:
            pass


def _stop_all_processes() -> None:
    for name in ['localization', 'imu', 'lidar']:
        _stop_process(name)


def _is_running(name: str) -> bool:
    with process_lock:
        process = processes.get(name)
    return process is not None and process.poll() is None


def _refresh_state() -> dict:
    with state_lock:
        current = dict(state)

    if current.get('status') in ['starting', 'running'] and _is_running('localization') is False:
        with process_lock:
            process = processes.get('localization')
        if process is not None and process.poll() is not None:
            _set_state(
                status='error',
                phase='error',
                localization_ready=False,
                error_message=f'FAST-LOCALIZATION 定位进程退出，返回码：{process.returncode}',
            )

    with state_lock:
        current = dict(state)

    duration_seconds = 0
    if current.get('start_time'):
        try:
            start_time = datetime.fromisoformat(current['start_time'])
            duration_seconds = int((datetime.now() - start_time).total_seconds())
        except Exception:
            pass

    map_name = current.get('map_name')
    current.update({
        'duration_seconds': duration_seconds,
        'has_lidar_map': _has_lidar_map(map_name),
        'map_file_path': str(_lidar_map_dir(map_name)) if map_name else None,
        'lidar_running': _is_running('lidar'),
        'imu_running': _is_running('imu'),
        'localization_running': _is_running('localization'),
        'log': _read_log_tail(),
    })
    return current


def _start_localization_sequence(map_name: str) -> None:
    try:
        lidar_dir = _validate_map_name(map_name)

        _set_state(
            status='starting',
            phase='starting_lidar',
            map_name=map_name,
            start_time=datetime.now().isoformat(),
            lidar_ready=False,
            imu_ready=False,
            localization_ready=False,
            error_message=None,
        )

        if not _wait_for_topic(LIDAR_TOPIC, 3):
            _start_process('lidar', [
                'roslaunch',
                'lslidar_c16_decoder',
                'lslidar_c16.launch',
                'rviz:=false',
            ])
            if not _wait_for_topic(LIDAR_TOPIC, SENSOR_TIMEOUT_SECONDS):
                raise RuntimeError(f'雷达话题超时：{LIDAR_TOPIC}')

        _set_state(phase='starting_imu', lidar_ready=True)
        if not _wait_for_topic(IMU_TOPIC, 3):
            _start_process('imu', [
                'roslaunch',
                'imu_launch',
                'imu_msg1.launch',
                'enable_debug_echo:=false',
            ])
            if not _wait_for_topic(IMU_TOPIC, SENSOR_TIMEOUT_SECONDS):
                raise RuntimeError(f'IMU 话题超时：{IMU_TOPIC}')

        _set_state(phase='starting_localization', imu_ready=True)
        localization_process = _start_process('localization', [
            'roslaunch',
            'fast_localization',
            'localization_lslidar_C16.launch',
            'rviz:=false',
            'publish_tf:=true',
            f'map_file_path:={lidar_dir}',
        ])

        time.sleep(2.0)
        if localization_process.poll() is not None:
            raise RuntimeError(f'FAST-LOCALIZATION 定位进程已退出，返回码：{localization_process.returncode}')

        if not _wait_for_topic(ODOM_TOPIC, ODOM_TIMEOUT_SECONDS):
            raise RuntimeError(f'雷达定位输出超时：{ODOM_TOPIC}')

        _set_state(
            status='running',
            phase='running',
            localization_ready=True,
            error_message=None,
        )
    except Exception as exc:
        _stop_all_processes()
        _set_state(
            status='error',
            phase='error',
            lidar_ready=False,
            imu_ready=False,
            localization_ready=False,
            error_message=str(exc),
        )


@lidar_localization_bp.route('/status', methods=['GET'])
@jwt_required()
def get_lidar_localization_status():
    map_name = request.args.get('map_name', '').strip()
    status = _refresh_state()
    if map_name and status.get('status') in ['idle', 'error']:
        status['map_name'] = map_name
        status['has_lidar_map'] = _has_lidar_map(map_name)
        status['map_file_path'] = str(_lidar_map_dir(map_name))
    return jsonify({
        'success': True,
        'status': status,
    })


@lidar_localization_bp.route('/start', methods=['POST'])
@jwt_required()
def start_lidar_localization():
    try:
        data = request.get_json(silent=True) or {}
        map_name = str(data.get('map_name', '')).strip()
        _validate_map_name(map_name)

        mapping_state = mapping_state_manager.get_state()
        if mapping_state.get('status') in [MappingStatus.STARTING.value, MappingStatus.RUNNING.value, MappingStatus.STOPPING.value]:
            return jsonify({
                'success': False,
                'error': '建图任务正在运行，请先停止建图再启动雷达定位',
            }), 409

        current = _refresh_state()
        if current.get('status') in ['starting', 'running']:
            return jsonify({
                'success': False,
                'error': f'雷达定位已在运行：{current.get("map_name")}',
                'status': current,
            }), 409

        _set_state(
            status='starting',
            phase='queued',
            map_name=map_name,
            start_time=datetime.now().isoformat(),
            lidar_ready=False,
            imu_ready=False,
            localization_ready=False,
            error_message=None,
        )
        thread = threading.Thread(target=_start_localization_sequence, args=(map_name,), daemon=True)
        thread.start()

        return jsonify({
            'success': True,
            'message': '雷达定位启动请求已接收',
            'status': _refresh_state(),
        })
    except (FileNotFoundError, ValueError) as exc:
        return jsonify({'success': False, 'error': str(exc)}), 400
    except Exception as exc:
        return jsonify({'success': False, 'error': str(exc)}), 500


@lidar_localization_bp.route('/stop', methods=['POST'])
@jwt_required()
def stop_lidar_localization():
    _set_state(status='stopping', phase='stopping')
    _stop_all_processes()
    _set_state(
        status='idle',
        phase='idle',
        lidar_ready=False,
        imu_ready=False,
        localization_ready=False,
        error_message=None,
        start_time=None,
    )
    return jsonify({
        'success': True,
        'message': '雷达定位已停止',
        'status': _refresh_state(),
    })
