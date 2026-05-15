from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required
from pathlib import Path
import math
import shlex
import subprocess
from typing import Optional, Tuple
import yaml

from config.config import Config


rtk_bp = Blueprint('rtk', __name__, url_prefix='/api/rtk')


def _run_ros_command(command: str, timeout: float = 10.0) -> str:
    """Run a ROS CLI command after loading this project's ROS environment."""
    env_script = Path(Config.PROJECT_ROOT) / 'nav' / 'scripts' / 'env.sh'
    if not env_script.exists():
        raise RuntimeError(f'ROS 环境脚本不存在：{env_script}')

    script = f'source {shlex.quote(str(env_script))}\n{command}'
    try:
        result = subprocess.run(
            # env.sh sources ROS/catkin setup explicitly, so a login shell is unnecessary.
            ['bash', '-c', script],
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError('读取 ROS 话题超时，请确认 RTK 节点正在发布数据') from exc

    if result.returncode != 0:
        detail = (result.stderr or result.stdout or '').strip()
        raise RuntimeError(detail or 'ROS 命令执行失败')

    return result.stdout


def _first_yaml_doc(output: str) -> dict:
    for doc in yaml.safe_load_all(output):
        if isinstance(doc, dict):
            return doc
    raise RuntimeError('ROS 话题没有返回有效数据')


def _read_topic_once(topic: str) -> dict:
    output = _run_ros_command(f'rostopic echo -n 1 {shlex.quote(topic)}')
    return _first_yaml_doc(output)


def _number(value, field_name: str) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise RuntimeError(f'RTK 数据字段无效：{field_name}') from exc
    if not math.isfinite(number):
        raise RuntimeError(f'RTK 数据字段无效：{field_name}')
    return number


def _read_fix_message() -> Tuple[str, dict]:
    errors = []
    for topic in ('/rtk/fix', '/gps/fix'):
        try:
            return topic, _read_topic_once(topic)
        except RuntimeError as exc:
            errors.append(f'{topic}: {exc}')
    raise RuntimeError('无法读取 RTK 坐标；' + '；'.join(errors))


def _read_fix_quality() -> Optional[int]:
    try:
        msg = _read_topic_once('/rtk/fix_quality')
        return int(msg.get('data'))
    except Exception:
        return None


@rtk_bp.route('/origin', methods=['GET'])
@jwt_required()
def get_rtk_origin():
    """Return the current RTK fixed solution as a WGS84 origin."""
    try:
        source_topic, fix_msg = _read_fix_message()
        lat = _number(fix_msg.get('latitude'), 'latitude')
        lon = _number(fix_msg.get('longitude'), 'longitude')
        alt = _number(fix_msg.get('altitude', 0.0), 'altitude')

        quality = _read_fix_quality()
        navsat_status = None
        status = fix_msg.get('status')
        if isinstance(status, dict):
            navsat_status = status.get('status')

        if quality is not None:
            fixed = quality == 4
        else:
            fixed = navsat_status in (1, 2)

        if not fixed:
            detail = f'fix_quality={quality}' if quality is not None else f'navsat_status={navsat_status}'
            return jsonify({
                'success': False,
                'error': f'RTK 尚未固定，当前 {detail}',
            }), 409

        return jsonify({
            'success': True,
            'lat': lat,
            'lon': lon,
            'lng': lon,
            'alt': alt,
            'fixed': True,
            'fix_quality': quality,
            'navsat_status': navsat_status,
            'source_topic': source_topic,
        })
    except RuntimeError as exc:
        return jsonify({
            'success': False,
            'error': str(exc),
        }), 503
