from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from config.config import Config
from pathlib import Path
from datetime import datetime
import os
import json
import signal
import subprocess
import threading
import time
import yaml
from typing import List, Optional


alignment_bp = Blueprint('alignment', __name__, url_prefix='/api/alignment')

PROJECT_ROOT = Path(Config.PROJECT_ROOT)
MAP_BASE_PATH = Path(Config.MAP_BASE_PATH)
ENV_SCRIPT = PROJECT_ROOT / 'nav' / 'scripts' / 'env.sh'
LOG_DIR = PROJECT_ROOT / 'data' / 'logs' / 'alignment'

process_lock = threading.Lock()
processes = {
    'calibration': None,
    'runtime': None,
}
process_maps = {
    'calibration': None,
    'runtime': None,
}


class AlignmentPrerequisiteError(RuntimeError):
    pass


def _alignment_file(map_name: str) -> Path:
    return MAP_BASE_PATH / map_name / 'calibration' / 'rtk_lidar.yaml'


def _map_config_file(map_name: str) -> Path:
    return MAP_BASE_PATH / map_name / 'map_config.json'


def _validate_map_name(map_name: str) -> Path:
    if not map_name:
        raise ValueError('地图名称不能为空')
    map_path = MAP_BASE_PATH / map_name
    if not map_path.exists() or not map_path.is_dir():
        raise FileNotFoundError(f'地图不存在：{map_name}')
    return map_path


def _read_map_config(map_name: str) -> dict:
    config_file = _map_config_file(map_name)
    if not config_file.exists():
        return {}
    with config_file.open('r', encoding='utf-8') as handle:
        return json.load(handle) or {}


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


def _has_lidar_map(map_path: Path) -> bool:
    lidar_dir = map_path / 'lidar'
    if lidar_dir.exists() and any(lidar_dir.rglob('*.pcd')):
        return True
    return any(map_path.rglob('*.pcd'))


def _map_requirements(map_name: str) -> dict:
    map_path = _validate_map_name(map_name)
    config = _read_map_config(map_name)
    gps_origin = _gps_origin_from_config(config)
    has_lidar_map = _has_lidar_map(map_path)
    return {
        'has_gps_config': gps_origin is not None,
        'gps_origin': gps_origin,
        'has_lidar_map': has_lidar_map,
        'target_frame': 'map',
        'target_odometry_topic': '/odometry/rtk',
        'target_coordinate_system': 'UTM',
        'output_odometry_topic': '/odometry/lidar_in_rtk',
    }


def _validate_alignment_ready(map_name: str) -> dict:
    requirements = _map_requirements(map_name)
    if not requirements['has_gps_config']:
        raise AlignmentPrerequisiteError('坐标对齐只支持已有 GPS 地图，请先在 GPS 地图中建图')
    if not requirements['has_lidar_map']:
        raise AlignmentPrerequisiteError('该 GPS 地图尚未保存雷达点云，请先在这张地图中完成建图并保存')
    return requirements


def _read_alignment_result(map_name: str):
    path = _alignment_file(map_name)
    if not path.exists():
        return None
    with path.open('r', encoding='utf-8') as handle:
        data = yaml.safe_load(handle) or {}
    calibration = data.get('calibration') or {}
    return {
        'file': str(path),
        'parent_frame': data.get('parent_frame'),
        'child_frame': data.get('child_frame'),
        'translation': data.get('translation') or {},
        'rotation': data.get('rotation') or {},
        'coordinate_system': data.get('coordinate_system') or {},
        'calibration': calibration,
        'rmse_m': calibration.get('rmse_m'),
        'max_error_m': calibration.get('max_error_m'),
        'yaw_check_error_deg': calibration.get('yaw_check_error_deg'),
        'spatial_spread_m': calibration.get('spatial_spread_m'),
        'num_pairs': calibration.get('num_pairs'),
        'created_at': calibration.get('created_at'),
    }


def _log_file(kind: str) -> Path:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    return LOG_DIR / f'{kind}.log'


def _read_log_tail(kind: str, max_chars: int = 4000) -> str:
    path = _log_file(kind)
    if not path.exists():
        return ''
    data = path.read_text(encoding='utf-8', errors='replace')
    return data[-max_chars:]


def _is_running(process: Optional[subprocess.Popen]) -> bool:
    return process is not None and process.poll() is None


def _cleanup_finished() -> None:
    for key, process in list(processes.items()):
        if process is not None and process.poll() is not None:
            processes[key] = None


def _start_roslaunch(kind: str, command: List[str], map_name: str) -> subprocess.Popen:
    if not ENV_SCRIPT.exists():
        raise RuntimeError(f'ROS 环境脚本不存在：{ENV_SCRIPT}')

    LOG_DIR.mkdir(parents=True, exist_ok=True)
    log_path = _log_file(kind)
    script = 'source "{}"\n{}'.format(ENV_SCRIPT, ' '.join(command))
    log_handle = open(log_path, 'w', encoding='utf-8')
    log_handle.write(f'[{datetime.now().isoformat()}] start {" ".join(command)}\n')
    log_handle.flush()

    process = subprocess.Popen(
        ['bash', '-c', script],
        stdout=log_handle,
        stderr=subprocess.STDOUT,
        cwd=str(PROJECT_ROOT),
        start_new_session=True,
    )
    log_handle.close()
    processes[kind] = process
    process_maps[kind] = map_name
    return process


def _stop_process(kind: str, timeout: float = 12.0) -> bool:
    process = processes.get(kind)
    if not process:
        processes[kind] = None
        process_maps[kind] = None
        return False

    pid = process.pid
    try:
        os.killpg(os.getpgid(pid), signal.SIGINT)
        process.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(os.getpgid(pid), signal.SIGTERM)
            process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(os.getpgid(pid), signal.SIGKILL)
                process.wait(timeout=3)
            except ProcessLookupError:
                pass
        except ProcessLookupError:
            pass
    except ProcessLookupError:
        pass
    finally:
        processes[kind] = None
        process_maps[kind] = None
    return True


def _status_payload(map_name: Optional[str] = None) -> dict:
    with process_lock:
        _cleanup_finished()
        calibration_running = _is_running(processes.get('calibration'))
        runtime_running = _is_running(processes.get('runtime'))
        active_calibration_map = process_maps.get('calibration')
        active_runtime_map = process_maps.get('runtime')

    target_map = map_name or active_calibration_map or active_runtime_map
    result = _read_alignment_result(target_map) if target_map else None
    requirements = _map_requirements(target_map) if target_map else None

    if calibration_running:
        status = 'calibrating'
    elif runtime_running:
        status = 'runtime'
    elif result:
        status = 'aligned'
    else:
        status = 'idle'

    return {
        'status': status,
        'map_name': target_map,
        'calibration_running': calibration_running,
        'runtime_running': runtime_running,
        'active_calibration_map': active_calibration_map,
        'active_runtime_map': active_runtime_map,
        'has_alignment': result is not None,
        'result': result,
        'requirements': requirements,
        'calibration_log': _read_log_tail('calibration'),
        'runtime_log': _read_log_tail('runtime'),
    }


@alignment_bp.route('/status', methods=['GET'])
@jwt_required()
def get_alignment_status():
    try:
        map_name = request.args.get('map_name', '').strip() or None
        if map_name:
            _validate_map_name(map_name)
        return jsonify({
            'success': True,
            'status': _status_payload(map_name),
        })
    except FileNotFoundError as exc:
        return jsonify({'success': False, 'error': str(exc)}), 404
    except Exception as exc:
        return jsonify({'success': False, 'error': str(exc)}), 500


@alignment_bp.route('/result/<map_name>', methods=['GET'])
@jwt_required()
def get_alignment_result(map_name: str):
    try:
        _validate_map_name(map_name)
        result = _read_alignment_result(map_name)
        if not result:
            return jsonify({'success': False, 'error': '该地图尚未完成 RTK-LiDAR 对齐'}), 404
        return jsonify({'success': True, 'result': result})
    except FileNotFoundError as exc:
        return jsonify({'success': False, 'error': str(exc)}), 404
    except Exception as exc:
        return jsonify({'success': False, 'error': str(exc)}), 500


@alignment_bp.route('/start', methods=['POST'])
@jwt_required()
def start_alignment_calibration():
    try:
        data = request.get_json() or {}
        map_name = str(data.get('map_name', '')).strip()
        _validate_alignment_ready(map_name)

        with process_lock:
            _cleanup_finished()
            if _is_running(processes.get('calibration')):
                return jsonify({
                    'success': False,
                    'error': f'坐标对齐采集已在运行：{process_maps.get("calibration")}',
                }), 409
            _start_roslaunch('calibration', [
                'roslaunch',
                'nav_fusion',
                'calibrate.launch',
                f'map_name:={map_name}',
            ], map_name)

        time.sleep(0.2)
        return jsonify({
            'success': True,
            'message': f'已开始坐标对齐采集：{map_name}',
            'status': _status_payload(map_name),
        })
    except FileNotFoundError as exc:
        return jsonify({'success': False, 'error': str(exc)}), 404
    except AlignmentPrerequisiteError as exc:
        return jsonify({'success': False, 'error': str(exc)}), 409
    except ValueError as exc:
        return jsonify({'success': False, 'error': str(exc)}), 400
    except Exception as exc:
        return jsonify({'success': False, 'error': str(exc)}), 500


@alignment_bp.route('/stop', methods=['POST'])
@jwt_required()
def stop_alignment_calibration():
    try:
        data = request.get_json(silent=True) or {}
        map_name = str(data.get('map_name', '')).strip() or process_maps.get('calibration')
        with process_lock:
            stopped = _stop_process('calibration')
        return jsonify({
            'success': True,
            'message': '坐标对齐采集已停止' if stopped else '没有正在运行的坐标对齐采集',
            'status': _status_payload(map_name),
        })
    except Exception as exc:
        return jsonify({'success': False, 'error': str(exc)}), 500


@alignment_bp.route('/runtime/start', methods=['POST'])
@jwt_required()
def start_alignment_runtime():
    try:
        data = request.get_json() or {}
        map_name = str(data.get('map_name', '')).strip()
        _validate_alignment_ready(map_name)
        if not _read_alignment_result(map_name):
            return jsonify({'success': False, 'error': '该地图尚未完成 RTK-LiDAR 对齐'}), 409

        with process_lock:
            _cleanup_finished()
            if _is_running(processes.get('runtime')):
                return jsonify({
                    'success': False,
                    'error': f'坐标对齐运行验证已在运行：{process_maps.get("runtime")}',
                }), 409
            _start_roslaunch('runtime', [
                'roslaunch',
                'nav_fusion',
                'frame_alignment.launch',
                f'map_name:={map_name}',
            ], map_name)

        time.sleep(0.2)
        return jsonify({
            'success': True,
            'message': f'已启动坐标对齐运行验证：{map_name}',
            'status': _status_payload(map_name),
        })
    except FileNotFoundError as exc:
        return jsonify({'success': False, 'error': str(exc)}), 404
    except AlignmentPrerequisiteError as exc:
        return jsonify({'success': False, 'error': str(exc)}), 409
    except ValueError as exc:
        return jsonify({'success': False, 'error': str(exc)}), 400
    except Exception as exc:
        return jsonify({'success': False, 'error': str(exc)}), 500


@alignment_bp.route('/runtime/stop', methods=['POST'])
@jwt_required()
def stop_alignment_runtime():
    try:
        data = request.get_json(silent=True) or {}
        map_name = str(data.get('map_name', '')).strip() or process_maps.get('runtime')
        with process_lock:
            stopped = _stop_process('runtime')
        return jsonify({
            'success': True,
            'message': '坐标对齐运行验证已停止' if stopped else '没有正在运行的坐标对齐运行验证',
            'status': _status_payload(map_name),
        })
    except Exception as exc:
        return jsonify({'success': False, 'error': str(exc)}), 500
