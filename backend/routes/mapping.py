from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from datetime import datetime
from pathlib import Path
from typing import Dict, Optional
import json
import os
import shlex
import shutil
import signal
import subprocess
import threading
import time

from config.config import Config
from models.mapping_state import MappingStateManager, MappingStatus

mapping_bp = Blueprint('mapping', __name__, url_prefix='/api/mapping')

PROJECT_ROOT = Path(Config.PROJECT_ROOT)
ENV_SCRIPT = PROJECT_ROOT / 'nav' / 'scripts' / 'env.sh'
LOG_DIR = PROJECT_ROOT / 'data' / 'logs' / 'mapping'
FAST_LIVO_LOG_DIR = PROJECT_ROOT / 'nav' / 'src' / 'fastlivo2' / 'src' / 'FAST-LIVO2' / 'Log'
FAST_LIVO_CONVERT_SCRIPT = PROJECT_ROOT / 'nav' / 'src' / 'fastlivo2' / 'src' / 'FAST-LIVO2' / 'scripts' / 'convert_to_fast_localization.py'
FAST_LIVO_C16_CONFIG = PROJECT_ROOT / 'nav' / 'src' / 'fastlivo2' / 'src' / 'FAST-LIVO2' / 'config' / 'lslidar_C16.yaml'

LIDAR_TOPIC = '/lslidar_point_cloud'
IMU_TOPIC = '/IMU_data'

SENSOR_TIMEOUT_SECONDS = int(os.environ.get('MAPPING_SENSOR_TIMEOUT_SECONDS', '30'))
CONVERT_TIMEOUT_SECONDS = int(os.environ.get('MAPPING_CONVERT_TIMEOUT_SECONDS', '600'))

state_manager = MappingStateManager()
process_lock = threading.Lock()
processes: Dict[str, subprocess.Popen] = {}


class MappingPrerequisiteError(RuntimeError):
    pass


def _float_or_none(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _gps_origin_from_config(config: dict) -> Optional[dict]:
    origin = config.get('gpsOrigin')
    if not origin:
        gps_fusion = config.get('gps_fusion') or {}
        origin = gps_fusion.get('origin') if gps_fusion.get('enabled') else None
    if not isinstance(origin, dict):
        return None

    lat = _float_or_none(origin.get('lat', origin.get('latitude')))
    lng = _float_or_none(origin.get('lng', origin.get('lon', origin.get('longitude'))))
    alt = _float_or_none(origin.get('alt', origin.get('altitude', 0.0)))
    if lat is None or lng is None or (lat == 0.0 and lng == 0.0):
        return None
    return {'lat': lat, 'lng': lng, 'alt': alt or 0.0}


def _validate_gps_mapping_target(map_name: str) -> Path:
    map_root = Path(Config.MAP_BASE_PATH) / map_name
    if not map_root.exists() or not map_root.is_dir():
        raise FileNotFoundError(f'地图不存在：{map_name}，请先创建 GPS 地图')

    config_file = map_root / 'map_config.json'
    if not config_file.exists():
        raise MappingPrerequisiteError('请先创建带 GPS 原点的地图，再从该 GPS 地图入口建图')

    with config_file.open('r', encoding='utf-8') as handle:
        config = json.load(handle) or {}

    if not _gps_origin_from_config(config):
        raise MappingPrerequisiteError('当前只支持在已有 GPS 地图中建图，请先为该地图设置 GPS 原点')
    return map_root


def _status_response(state: Optional[dict] = None) -> dict:
    state = state or state_manager.get_state()
    duration_seconds = 0
    if state.get('start_time'):
        try:
            start_time = datetime.fromisoformat(state['start_time'])
            duration_seconds = int((datetime.now() - start_time).total_seconds())
        except Exception:
            pass

    state['duration_seconds'] = duration_seconds
    state['trajectory_points'] = state.get('trajectory_points') or len(state.get('trajectory') or [])
    return state


def _ros_command(command: str, timeout: float = 10.0) -> subprocess.CompletedProcess:
    script = f'source {shlex.quote(str(ENV_SCRIPT))} && {command}'
    return subprocess.run(
        ['bash', '-c', script],
        cwd=str(PROJECT_ROOT),
        capture_output=True,
        text=True,
        timeout=timeout,
    )


def _start_process(name: str, args: list) -> subprocess.Popen:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    with process_lock:
        existing = processes.get(name)
        if existing and existing.poll() is None:
            return existing

        log_file = LOG_DIR / f'{name}.log'
        cmd = ' '.join(shlex.quote(str(part)) for part in args)
        script = f'source {shlex.quote(str(ENV_SCRIPT))} && exec {cmd}'
        log_handle = open(log_file, 'a')
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


def _stop_process(name: str, timeout: float = 8.0):
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
        try:
            pid_file.unlink()
        except FileNotFoundError:
            pass


def _stop_all_processes():
    for name in ['mapping', 'imu', 'lidar']:
        _stop_process(name)


def _wait_for_topic(topic: str, timeout_seconds: int) -> bool:
    try:
        result = _ros_command(
            f'rostopic echo -n 1 {shlex.quote(topic)}',
            timeout=float(timeout_seconds),
        )
        return result.returncode == 0
    except subprocess.TimeoutExpired:
        return False


def _mark_error(message: str):
    state_manager.error_mapping(message)
    state_manager.update_state(phase='error')


def _start_mapping_sequence(map_name: str):
    try:
        state_manager.start_mapping(map_name)
        state_manager.update_state(
            phase='starting_lidar',
            lidar_ready=False,
            imu_ready=False,
            mapping_ready=False,
            error_message=None,
        )

        _start_process('lidar', [
            'roslaunch',
            'lslidar_c16_decoder',
            'lslidar_c16.launch',
            'rviz:=false',
        ])
        if not _wait_for_topic(LIDAR_TOPIC, SENSOR_TIMEOUT_SECONDS):
            raise RuntimeError(f'雷达话题超时：{LIDAR_TOPIC}')

        state_manager.update_state(phase='starting_imu', lidar_ready=True)
        _start_process('imu', [
            'roslaunch',
            'imu_launch',
            'imu_msg1.launch',
            'enable_debug_echo:=false',
        ])
        if not _wait_for_topic(IMU_TOPIC, SENSOR_TIMEOUT_SECONDS):
            raise RuntimeError(f'IMU 话题超时：{IMU_TOPIC}')

        state_manager.update_state(phase='starting_mapping', imu_ready=True)
        mapping_process = _start_process('mapping', [
            'roslaunch',
            'fast_livo',
            'run_lslidar_C16.launch',
            'rviz:=false',
        ])

        time.sleep(2.0)
        if mapping_process.poll() is not None:
            raise RuntimeError(f'FAST-LIVO2 建图进程已退出，返回码：{mapping_process.returncode}')

        state_manager.update_state(
            status=MappingStatus.RUNNING.value,
            phase='running',
            mapping_ready=True,
        )
    except Exception as exc:
        _stop_all_processes()
        _mark_error(str(exc))


def _refresh_process_state():
    state = state_manager.get_state()
    if state.get('status') == MappingStatus.RUNNING.value:
        with process_lock:
            mapping_process = processes.get('mapping')
        if mapping_process and mapping_process.poll() is not None:
            _mark_error(f'FAST-LIVO2 建图进程退出，返回码：{mapping_process.returncode}')
            state = state_manager.get_state()
    return state


@mapping_bp.route('/status', methods=['GET'])
@jwt_required()
def get_mapping_status():
    state = _refresh_process_state()
    return jsonify({
        'success': True,
        'status': _status_response(state),
    })


@mapping_bp.route('/start', methods=['POST'])
@jwt_required()
def start_mapping():
    data = request.get_json(silent=True) or {}
    map_name = str(data.get('map_name', '')).strip()
    if not map_name:
        return jsonify({
            'success': False,
            'error': '地图名称不能为空',
        }), 400
    try:
        _validate_gps_mapping_target(map_name)
    except FileNotFoundError as exc:
        return jsonify({'success': False, 'error': str(exc)}), 404
    except MappingPrerequisiteError as exc:
        return jsonify({'success': False, 'error': str(exc)}), 409
    except ValueError as exc:
        return jsonify({'success': False, 'error': str(exc)}), 400

    current_state = state_manager.get_state()
    if current_state.get('status') in [MappingStatus.STARTING.value, MappingStatus.RUNNING.value]:
        return jsonify({
            'success': False,
            'error': '建图任务已在运行',
            'status': _status_response(current_state),
        }), 409

    thread = threading.Thread(target=_start_mapping_sequence, args=(map_name,), daemon=True)
    thread.start()

    return jsonify({
        'success': True,
        'message': '建图启动请求已接收，正在启动雷达和 IMU',
        'status': _status_response(state_manager.get_state()),
    })


@mapping_bp.route('/stop', methods=['POST'])
@jwt_required()
def stop_mapping():
    state_manager.update_state(status=MappingStatus.STOPPING.value, phase='stopping')
    _stop_all_processes()
    state_manager.update_state(
        status=MappingStatus.IDLE.value,
        phase='idle',
        lidar_ready=False,
        imu_ready=False,
        mapping_ready=False,
    )

    return jsonify({
        'success': True,
        'message': '雷达、IMU 和建图进程已停止',
        'status': _status_response(state_manager.get_state()),
    })


@mapping_bp.route('/save', methods=['POST'])
@jwt_required()
def save_map():
    state = state_manager.get_state()
    if state.get('status') in [MappingStatus.STARTING.value, MappingStatus.RUNNING.value, MappingStatus.STOPPING.value]:
        return jsonify({
            'success': False,
            'error': '请先停止建图再保存',
            'status': _status_response(state),
        }), 409

    map_name = state.get('map_name')
    if not map_name:
        return jsonify({
            'success': False,
            'error': '没有正在建图的地图',
        }), 400

    source_pcd_dir = FAST_LIVO_LOG_DIR / 'pcd'
    source_pose_file = source_pcd_dir / 'lidar_poses.txt'
    if not source_pcd_dir.exists():
        return jsonify({
            'success': False,
            'error': f'FAST-LIVO2 PCD 目录不存在：{source_pcd_dir}',
        }), 500
    if not source_pose_file.exists():
        return jsonify({
            'success': False,
            'error': f'FAST-LIVO2 位姿文件不存在：{source_pose_file}',
        }), 500
    if not FAST_LIVO_CONVERT_SCRIPT.exists():
        return jsonify({
            'success': False,
            'error': f'转换脚本不存在：{FAST_LIVO_CONVERT_SCRIPT}',
        }), 500

    map_root = Path(Config.MAP_BASE_PATH) / map_name
    map_root.mkdir(parents=True, exist_ok=True)
    map_dir = map_root / 'lidar'
    temp_dir = map_root / '.lidar_convert_tmp'
    if temp_dir.exists():
        shutil.rmtree(temp_dir)

    convert_cmd = [
        'python3',
        str(FAST_LIVO_CONVERT_SCRIPT),
        '--input',
        str(source_pcd_dir),
        '--output',
        str(temp_dir),
        '--config',
        str(FAST_LIVO_C16_CONFIG),
        '--pose-frame',
        'lidar',
    ]

    try:
        result = subprocess.run(
            convert_cmd,
            cwd=str(PROJECT_ROOT),
            capture_output=True,
            text=True,
            timeout=CONVERT_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired:
        shutil.rmtree(temp_dir, ignore_errors=True)
        return jsonify({
            'success': False,
            'error': f'FAST-LIVO2 地图转换超时（{CONVERT_TIMEOUT_SECONDS}s）',
        }), 500

    if result.returncode != 0:
        shutil.rmtree(temp_dir, ignore_errors=True)
        return jsonify({
            'success': False,
            'error': 'FAST-LIVO2 地图转换失败',
            'stdout': result.stdout[-4000:],
            'stderr': result.stderr[-4000:],
        }), 500

    converted_pcd_dir = temp_dir / 'pcd'
    converted_pose_file = temp_dir / 'pose.json'
    if not converted_pcd_dir.exists() or not converted_pose_file.exists():
        shutil.rmtree(temp_dir, ignore_errors=True)
        return jsonify({
            'success': False,
            'error': 'FAST-LIVO2 转换输出不完整，缺少 pcd/ 或 pose.json',
            'stdout': result.stdout[-4000:],
        }), 500

    if map_dir.exists():
        shutil.rmtree(map_dir)
    shutil.move(str(temp_dir), str(map_dir))

    saved_files = [
        str(map_dir / 'pcd'),
        str(map_dir / 'pose.json'),
    ]

    state_manager.complete_mapping()
    state_manager.add_history_entry({
        'map_name': map_name,
        'status': MappingStatus.COMPLETED.value,
        'saved_files': saved_files,
    })

    return jsonify({
        'success': True,
        'message': 'FAST-LIVO2 建图数据已转换并保存',
        'saved_files': saved_files,
        'conversion_log': result.stdout[-4000:],
        'status': _status_response(state_manager.get_state()),
    })


@mapping_bp.route('/update', methods=['POST'])
@jwt_required()
def update_mapping():
    data = request.get_json(silent=True) or {}
    frame_count = int(data.get('frame_count', 0))
    trajectory_point = data.get('trajectory_point')
    state_manager.update_frame(frame_count, trajectory_point)
    return jsonify({
        'success': True,
        'status': _status_response(state_manager.get_state()),
    })


@mapping_bp.route('/recover', methods=['POST'])
@jwt_required()
def recover_mapping():
    state = state_manager.recover_state()
    return jsonify({
        'success': True,
        'status': _status_response(state),
    })


@mapping_bp.route('/history', methods=['GET'])
@jwt_required()
def get_mapping_history():
    return jsonify({
        'success': True,
        'history': [],
    })
