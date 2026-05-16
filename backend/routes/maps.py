from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from models.mapping_state import MappingStateManager, MappingStatus
from config.config import Config
import os
import json
import shutil
from pathlib import Path
from datetime import datetime

maps_bp = Blueprint('maps', __name__, url_prefix='/api/maps')

# 全局状态管理器实例
state_manager = MappingStateManager()

MAP_BASE_PATH = Path(Config.MAP_BASE_PATH)


def get_map_type(map_info: dict) -> str:
    """
    判断地图类型
    - local: 只有 PCD 文件，无 GPS 配置
    - gps: 无 PCD 文件，有 GPS 配置
    - fusion: 有 PCD 文件，有 GPS 配置
    """
    has_pcd = map_info.get('has_pcd', False)
    has_gps = map_info.get('has_gps_config', False)

    if has_pcd and has_gps:
        return 'fusion'
    elif has_gps and not has_pcd:
        return 'gps'
    else:
        return 'local'


def get_map_type_name(map_type: str) -> str:
    """获取地图类型中文名称"""
    type_map = {
        'local': '本地地图',
        'gps': 'GPS 地图',
        'fusion': '融合地图'
    }
    return type_map.get(map_type, '本地地图')


def load_map_config(map_name: str) -> dict:
    """加载地图配置文件"""
    config_path = MAP_BASE_PATH / map_name / 'map_config.json'
    if not config_path.exists():
        return None
    with open(config_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def load_alignment_summary(map_name: str) -> dict:
    """读取每张地图的 RTK-LiDAR 对齐摘要。"""
    alignment_path = MAP_BASE_PATH / map_name / 'calibration' / 'rtk_lidar.yaml'
    if not alignment_path.exists():
        return {
            'has_alignment': False,
            'alignment_rmse_m': None,
            'alignment_max_error_m': None,
            'alignment_yaw_error_deg': None,
            'alignment_created_at': None,
            'alignment_file': None,
        }

    try:
        import yaml
        with alignment_path.open('r', encoding='utf-8') as handle:
            data = yaml.safe_load(handle) or {}
        calibration = data.get('calibration') or {}
        return {
            'has_alignment': True,
            'alignment_rmse_m': calibration.get('rmse_m'),
            'alignment_max_error_m': calibration.get('max_error_m'),
            'alignment_yaw_error_deg': calibration.get('yaw_check_error_deg'),
            'alignment_created_at': calibration.get('created_at'),
            'alignment_file': str(alignment_path.relative_to(MAP_BASE_PATH / map_name)),
        }
    except Exception:
        return {
            'has_alignment': False,
            'alignment_rmse_m': None,
            'alignment_max_error_m': None,
            'alignment_yaw_error_deg': None,
            'alignment_created_at': None,
            'alignment_file': str(alignment_path.relative_to(MAP_BASE_PATH / map_name)),
        }

@maps_bp.route('', methods=['GET'])
@jwt_required()
def get_maps():
    """获取地图列表"""
    try:
        maps = []

        if not MAP_BASE_PATH.exists():
            return jsonify({
                'success': True,
                'maps': [],
                'total': 0
            })

        # 获取当前地图
        index_file = MAP_BASE_PATH / '.index.json'
        current_map = None
        if index_file.exists():
            with open(index_file, 'r') as f:
                index = json.load(f)
                current_map = index.get('current_map')
        
        for item in MAP_BASE_PATH.iterdir():
            if item.is_dir() and not item.name.startswith('.'):
                # 获取地图信息
                map_info = {
                    'name': item.name,
                    'path': str(item),
                    'created_at': datetime.fromtimestamp(item.stat().st_ctime).isoformat(),
                    'updated_at': datetime.fromtimestamp(item.stat().st_mtime).isoformat(),
                    'file_count': 0,
                    'total_size': 0,
                    'has_grid_map': False,
                    'has_pcd': False,
                    'has_gps_config': False,
                    'has_alignment': False,
                    'alignment_rmse_m': None,
                    'alignment_max_error_m': None,
                    'alignment_yaw_error_deg': None,
                    'alignment_created_at': None,
                    'alignment_file': None,
                    'gps_origin': None,
                    'files': [],
                    'is_active': item.name == current_map
                }

                # 统计文件
                for file in item.rglob('*'):
                    if file.is_file():
                        map_info['file_count'] += 1
                        map_info['total_size'] += file.stat().st_size
                        map_info['files'].append({
                            'name': file.name,
                            'size': file.stat().st_size,
                            'path': str(file.relative_to(item))
                        })

                        if file.suffix in ['.pgm', '.yaml']:
                            map_info['has_grid_map'] = True
                        if file.suffix == '.pcd':
                            map_info['has_pcd'] = True

                # 加载地图配置获取 GPS 信息
                config = load_map_config(item.name)
                if config:
                    # 支持两种配置格式
                    gps_origin = None
                    
                    # 格式 1: gpsOrigin (新格式)
                    if config.get('gpsOrigin'):
                        gps_origin = config['gpsOrigin']
                    # 格式 2: gps_fusion.enabled + gps_fusion.origin (旧格式)
                    elif config.get('gps_fusion', {}).get('enabled') and config.get('gps_fusion', {}).get('origin'):
                        gps_origin = config['gps_fusion']['origin']
                    
                    if gps_origin:
                        # 检查是否有有效的 GPS 配置
                        lat = gps_origin.get('lat', gps_origin.get('latitude', 0))
                        lon = gps_origin.get('lng', gps_origin.get('longitude', 0))
                        if lat != 0 or lon != 0:
                            map_info['has_gps_config'] = True
                            map_info['gps_origin'] = {
                                'lat': lat,
                                'lng': lon,
                                'alt': gps_origin.get('alt', gps_origin.get('altitude', 0)),
                                'yaw': gps_origin.get('yaw', 0)
                            }

                # 判断地图类型
                map_type = get_map_type(map_info)
                map_info['map_type'] = map_type
                map_info['map_type_name'] = get_map_type_name(map_type)
                map_info.update(load_alignment_summary(item.name))

                # 检查是否正在建图
                current_state = state_manager.get_state()
                if current_state['status'] == MappingStatus.RUNNING.value and current_state['map_name'] == item.name:
                    map_info['mapping_status'] = 'running'
                else:
                    map_info['mapping_status'] = 'idle'

                maps.append(map_info)

        return jsonify({
            'success': True,
            'maps': maps,
            'total': len(maps)
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@maps_bp.route('', methods=['POST'])
@jwt_required()
def create_map():
    """创建地图目录"""
    try:
        data = request.get_json()
        
        # 支持两种格式：
        # 1. 旧格式：直接传名称字符串 {"name": "xxx"}
        # 2. 新格式：传完整对象 {"name": "xxx", "origin": {...}}
        if isinstance(data, str):
            map_name = data.strip()
        elif isinstance(data, dict):
            map_name = data.get('name', '').strip() if data.get('name') else ''
        else:
            map_name = ''
        
        if not map_name:
            return jsonify({
                'success': False,
                'error': '地图名称不能为空'
            }), 400
        
        # 检查名称合法性
        if not is_valid_map_name(map_name):
            return jsonify({
                'success': False,
                'error': '地图名称包含非法字符，只能使用中文、英文、数字、下划线和短横线'
            }), 400
        
        # 检查是否已存在
        map_path = MAP_BASE_PATH / map_name
        if map_path.exists():
            return jsonify({
                'success': False,
                'error': f'地图 "{map_name}" 已存在'
            }), 409
        
        # 检查是否正在建图
        current_state = state_manager.get_state()
        if current_state['status'] == MappingStatus.RUNNING.value:
            return jsonify({
                'success': False,
                'error': '建图过程中不能创建新地图'
            }), 409
        
        # 创建目录
        map_path.mkdir(parents=True, exist_ok=True)
        
        # 获取 GPS 坐标（如果有）
        origin = data.get('origin') if isinstance(data, dict) else None
        
        # GPS 原点数据
        if origin:
            gps_lat = float(origin.get('lat', 0.0))
            gps_lng = float(origin.get('lon', 0.0))  # 注意 lon -> lng
            gps_alt = float(origin.get('alt', 0.0))
        else:
            gps_lat, gps_lng, gps_alt = 0, 0, 0
        
        # 根据 GPS 坐标确定地图类型
        # 无 GPS 或坐标为零 → local
        # 有合法 GPS 坐标 → gps
        # (fusion 在建图完成后由 has_pcd + has_gps_config 决定)
        if origin and (gps_lat != 0.0 or gps_lng != 0.0):
            map_type = 'gps'
        else:
            map_type = 'local'
        
        # 创建地图配置文件 (统一格式)
        config = {
            'map_type': map_type,
            'name': map_name,
            'version': '1.0',
            'created_at': datetime.now().timestamp(),
            
            'gpsOrigin': {
                'lat': gps_lat,
                'lng': gps_lng,
                'alt': gps_alt,
            },
            
            'config': {
                'resolution': 0.05,
                'width': 0,
                'height': 0,
                'local_origin': {
                    'x': 0,
                    'y': 0,
                    'z': 0
                }
            },
            
            'bounds': {
                'min': {'x': 0, 'y': 0, 'z': 0},
                'max': {'x': 0, 'y': 0, 'z': 0}
            }
        }
        
        config_file = map_path / 'map_config.json'
        with open(config_file, 'w') as f:
            json.dump(config, f, indent=2)
        
        return jsonify({
            'success': True,
            'message': f'地图 "{map_name}" 创建成功',
            'map': {
                'name': map_name,
                'path': str(map_path)
            }
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@maps_bp.route('/<map_name>', methods=['PUT'])
@jwt_required()
def rename_map(map_name: str):
    """重命名地图"""
    try:
        # 检查是否正在建图
        current_state = state_manager.get_state()
        if current_state['status'] == MappingStatus.RUNNING.value:
            if current_state['map_name'] == map_name:
                return jsonify({
                    'success': False,
                    'error': '建图过程中不能重命名地图'
                }), 409
        
        data = request.get_json()
        new_name = data.get('new_name', '').strip()
        
        if not new_name:
            return jsonify({
                'success': False,
                'error': '新地图名称不能为空'
            }), 400
        
        # 检查名称合法性
        if not is_valid_map_name(new_name):
            return jsonify({
                'success': False,
                'error': '地图名称包含非法字符'
            }), 400
        
        old_path = MAP_BASE_PATH / map_name
        new_path = MAP_BASE_PATH / new_name
        
        if not old_path.exists():
            return jsonify({
                'success': False,
                'error': f'地图 "{map_name}" 不存在'
            }), 404
        
        if new_path.exists():
            return jsonify({
                'success': False,
                'error': f'地图 "{new_name}" 已存在'
            }), 409
        
        # 重命名目录
        shutil.move(str(old_path), str(new_path))
        
        return jsonify({
            'success': True,
            'message': f'地图已重命名为 "{new_name}"'
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@maps_bp.route('/<map_name>', methods=['DELETE'])
@jwt_required()
def delete_map(map_name: str):
    """删除地图"""
    try:
        # 检查是否正在建图
        current_state = state_manager.get_state()
        if current_state['status'] == MappingStatus.RUNNING.value:
            if current_state['map_name'] == map_name:
                return jsonify({
                    'success': False,
                    'error': '建图过程中不能删除地图'
                }), 409
        
        map_path = MAP_BASE_PATH / map_name
        
        if not map_path.exists():
            return jsonify({
                'success': False,
                'error': f'地图 "{map_name}" 不存在'
            }), 404
        
        # 删除目录
        shutil.rmtree(map_path)
        
        return jsonify({
            'success': True,
            'message': f'地图 "{map_name}" 已删除'
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@maps_bp.route('/<map_name>/switch', methods=['POST'])
@jwt_required()
def switch_map(map_name: str):
    """切换当前地图"""
    try:
        # 检查是否正在建图
        current_state = state_manager.get_state()
        if current_state['status'] == MappingStatus.RUNNING.value:
            return jsonify({
                'success': False,
                'error': '建图过程中不能切换地图'
            }), 409
        
        map_path = MAP_BASE_PATH / map_name
        
        if not map_path.exists():
            return jsonify({
                'success': False,
                'error': f'地图 "{map_name}" 不存在'
            }), 404
        
        # 更新当前地图配置
        index_file = MAP_BASE_PATH / '.index.json'
        index = {}
        if index_file.exists():
            with open(index_file, 'r') as f:
                index = json.load(f)
        
        index['current_map'] = map_name
        
        with open(index_file, 'w') as f:
            json.dump(index, f, indent=2)
        
        return jsonify({
            'success': True,
            'message': f'已切换到地图 "{map_name}"',
            'current_map': map_name
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

def is_valid_map_name(name: str) -> bool:
    """检查地图名称合法性"""
    import re
    # 允许中文、英文、数字、下划线、短横线
    pattern = r'^[\u4e00-\u9fa5a-zA-Z0-9_-]+$'
    return bool(re.match(pattern, name))


@maps_bp.route('/<map_name>/files', methods=['GET'])
@jwt_required()
def get_map_files(map_name: str):
    """获取地图文件列表"""
    try:
        map_path = MAP_BASE_PATH / map_name
        
        if not map_path.exists():
            return jsonify({
                'success': False,
                'error': f'地图 "{map_name}" 不存在'
            }), 404
        
        files = []
        for file in map_path.rglob('*'):
            if file.is_file():
                files.append({
                    'name': file.name,
                    'size': file.stat().st_size,
                    'path': str(file.relative_to(map_path))
                })
        
        return jsonify({
            'success': True,
            'files': files,
            'total': len(files)
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@maps_bp.route('/<map_name>/pcd/<filename>', methods=['GET'])
def get_pcd_file(map_name: str, filename: str):
    """获取 PCD 文件内容（无需认证）"""
    try:
        from flask import send_file
        
        file_path = MAP_BASE_PATH / map_name / filename
        
        if not file_path.exists():
            return jsonify({
                'success': False,
                'error': f'文件 "{filename}" 不存在'
            }), 404
        
        return send_file(str(file_path), mimetype='application/octet-stream')
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@maps_bp.route('/index', methods=['GET'])
@jwt_required()
def get_index():
    """获取当前地图索引"""
    try:
        index_file = MAP_BASE_PATH / '.index.json'
        index = {}

        if index_file.exists():
            with open(index_file, 'r') as f:
                index = json.load(f)

        return jsonify({
            'success': True,
            'current_map': index.get('current_map')
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@maps_bp.route('/<map_name>/map.png', methods=['GET'])
def get_map_image(map_name: str):
    """获取地图图片"""
    try:
        map_path = MAP_BASE_PATH / map_name
        png_file = map_path / 'map.png'
        
        if not png_file.exists():
            return jsonify({
                'success': False,
                'error': '地图图片不存在'
            }), 404
        
        from flask import send_file
        return send_file(str(png_file), mimetype='image/png')
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
