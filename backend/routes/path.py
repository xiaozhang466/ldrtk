from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from pathlib import Path
import json
from datetime import datetime
import yaml
from math import radians, degrees, sin, cos, sqrt, atan2, tan, pi
from config.config import Config

path_bp = Blueprint('path', __name__, url_prefix='/api/path')

MAP_BASE_PATH = Path(Config.MAP_BASE_PATH)


def wgs84_to_utm(lat: float, lng: float) -> tuple:
    """
    WGS84 经纬度 → 标准 UTM 坐标

    Args:
        lat: 纬度 (WGS84)
        lng: 经度 (WGS84)

    Returns:
        (zone, easting, northing): UTM Zone号, 东向坐标(米), 北向坐标(米)
    """
    # WGS84 参数
    a = 6378137.0  # 半长轴
    f = 1 / 298.257223563  # 扁率
    k0 = 0.9996  # UTM 比例因子
    e2 = 2 * f - f * f
    e4 = e2 * e2
    e6 = e4 * e2
    ep2 = e2 / (1 - e2)

    lat_r = radians(lat)
    lng_r = radians(lng)

    # 计算 UTM Zone
    zone = int((lng + 180) / 6) + 1
    lng_origin = radians((zone - 1) * 6 - 180 + 3)

    # 辅助计算
    sin_lat = sin(lat_r)
    cos_lat = cos(lat_r)
    tan_lat = tan(lat_r)

    N = a / sqrt(1 - e2 * sin_lat**2)
    T = tan_lat**2
    C = ep2 * cos_lat**2
    A = cos_lat * (lng_r - lng_origin)

    # 子午线弧长
    A0 = 1 - e2/4 - 3*e4/64 - 5*e6/256
    A2 = 3/8 * (e2 + e4/4 + 15*e6/128)
    A4 = 15/256 * (e4 + 3*e6/4)
    A6 = 35*e6/3072
    M = a * (A0*lat_r - A2*sin(2*lat_r) + A4*sin(4*lat_r) - A6*sin(6*lat_r))

    # UTM 坐标
    easting = k0 * N * (A + (1-T+C)*A**3/6 + (5-18*T+T**2+72*C-58*ep2)*A**5/120)
    northing = k0 * (M + N*tan_lat*(A**2/2 + (5-T+9*C+4*C**2)*A**4/24))

    # 南半球修正
    if lat < 0:
        northing += 10000000

    # 东向偏移 500km
    easting += 500000

    return zone, round(easting, 3), round(northing, 3)


def get_map_type_from_config(map_name: str) -> str:
    """
    从 map_config.json 获取地图类型
    优先读取 map_config.json 中的 map_type 字段
    - fusion: 建图时进行了 GPS 配准
    - gps: 有 GPS 数据，但未配准
    - local: 无 GPS 数据
    """
    config_path = MAP_BASE_PATH / map_name / 'map_config.json'
    if not config_path.exists():
        return 'local'
    
    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)
        
        # 优先读取 map_type 字段（配准后保存的值）
        map_type = config.get('map_type')
        if map_type in ('fusion', 'gps', 'local'):
            return map_type
        
        # 兼容旧逻辑：无 map_type 字段时，根据是否有配准数据推导
        # fusion 地图会有配准后的轨迹数据或 gpsOrigin
        gps_origin = config.get('gpsOrigin')
        if not gps_origin:
            gps_origin = config.get('gps_fusion', {}).get('origin')
        
        if gps_origin:
            lat = gps_origin.get('lat', gps_origin.get('latitude', 0))
            lon = gps_origin.get('lng', gps_origin.get('longitude', 0))
            if lat != 0 or lon != 0:
                # 有 GPS 坐标，检查是否有配准标记
                # 配准后的地图会有 registered: true 或 trajectory 数据
                if config.get('registered') or config.get('trajectory'):
                    return 'fusion'
                return 'gps'
        
        return 'local'
    except:
        return 'local'


def get_map_config(map_name: str) -> dict:
    """获取地图配置信息（origin, resolution, gpsOrigin）"""
    map_path = MAP_BASE_PATH / map_name
    
    # 读取 map.yaml 获取分辨率和原点
    yaml_path = map_path / 'map.yaml'
    config = {
        'resolution': 0.05,  # 默认值
        'origin': [0.0, 0.0, 0.0],
        'width': 0,
        'height': 0,
        'map_type': 'local'
    }
    
    if yaml_path.exists():
        try:
            with open(yaml_path, 'r') as f:
                yaml_config = yaml.safe_load(f)
                config['resolution'] = yaml_config.get('resolution', 0.05)
                config['origin'] = yaml_config.get('origin', [0.0, 0.0, 0.0])
                # 从 PNG 获取宽高
                png_path = map_path / 'map.png'
                if png_path.exists():
                    import struct
                    with open(png_path, 'rb') as pf:
                        pf.read(16)  # PNG signature
                        width, height = struct.unpack('>II', pf.read(8))
                        config['width'] = width
                        config['height'] = height
        except Exception as e:
            print(f"Error reading map.yaml: {e}")
    
    # 读取 map_config.json 获取 gpsOrigin
    config_json_path = map_path / 'map_config.json'
    if config_json_path.exists():
        try:
            with open(config_json_path, 'r', encoding='utf-8') as f:
                map_config = json.load(f)
                # gpsOrigin (新格式) - 统一转换为 gps_origin 返回前端
                if map_config.get('gpsOrigin'):
                    config['gps_origin'] = map_config['gpsOrigin']
                # gps_fusion.origin (旧格式) - 统一转换为 gps_origin 返回前端
                elif map_config.get('gps_fusion', {}).get('origin'):
                    config['gps_origin'] = map_config['gps_fusion']['origin']
        except Exception as e:
            print(f"Error reading map_config.json: {e}")
    
    # 获取地图类型
    config['map_type'] = get_map_type_from_config(map_name)
    
    return config


def pixel_to_world(pixel_x: float, pixel_y: float, config: dict) -> dict:
    """
    像素坐标转世界坐标
    map.yaml origin: [origin_x, origin_y, origin_z]
    世界坐标 X = pixel_x * resolution + origin_x
    世界坐标 Y = (height - pixel_y) * resolution + origin_y
    """
    resolution = config['resolution']
    origin = config['origin']
    height = config['height']
    
    world_x = pixel_x * resolution + origin[0]
    # Y 坐标需要翻转（图像 Y 轴向下，世界 Y 轴向上）
    world_y = (height - pixel_y) * resolution + origin[1]
    world_z = origin[2]
    
    return {'x': world_x, 'y': world_y, 'z': world_z}


def get_paths_file(map_name: str) -> Path:
    """获取多路径文件路径（paths.json）"""
    map_path = MAP_BASE_PATH / map_name
    return map_path / 'paths.json'


def get_legacy_path_file(map_name: str, path_type: str = None) -> Path:
    """获取旧版单路径文件路径（兼容）"""
    map_path = MAP_BASE_PATH / map_name
    
    if path_type:
        return map_path / f'path_{path_type}.json'
    else:
        return map_path / 'path.json'


@path_bp.route('/<map_name>/save', methods=['POST'])
@jwt_required()
def save_path(map_name: str):
    """保存路径到 paths.json（多路径格式）

    对于 GPS 地图：将 lat/lng 坐标转换为标准 UTM 坐标（zone, x, y, z）
    """
    try:
        map_path = MAP_BASE_PATH / map_name

        if not map_path.exists():
            return jsonify({
                'success': False,
                'error': f'地图 "{map_name}" 不存在'
            }), 404

        data = request.get_json()
        paths = data.get('paths', [])

        if not paths:
            return jsonify({
                'success': False,
                'error': '路径不能为空'
            }), 400

        # 获取地图配置
        config = get_map_config(map_name)
        map_type = config.get('map_type', 'local')

        # 对于 GPS 地图，将 lat/lng 转换为标准 UTM 坐标
        if map_type == 'gps':
            for path in paths:
                for point in path.get('points', []):
                    if 'lat' in point and 'lng' in point:
                        lat = float(point['lat'])
                        lng = float(point['lng'])
                        alt = float(point.get('alt', 0) or 0)

                        # WGS84 → 标准 UTM 坐标
                        zone, easting, northing = wgs84_to_utm(lat, lng)

                        # 保存 UTM 坐标
                        point['zone'] = zone
                        point['x'] = easting      # UTM 东向（米）
                        point['y'] = northing     # UTM 北向（米）
                        point['z'] = round(alt, 3)  # 高度（米）

                        # 保留原始 GPS 坐标（用于前端显示）
                        point['_orig_lat'] = lat
                        point['_orig_lng'] = lng

        # 保存为 paths.json
        paths_file = get_paths_file(map_name)
        paths_data = {
            'version': '1.1',  # 版本升级，标识包含转换后的坐标
            'map_name': map_name,
            'map_type': map_type,
            'updated_at': datetime.now().isoformat(),
            'paths': paths,
        }

        with open(paths_file, 'w', encoding='utf-8') as f:
            json.dump(paths_data, f, indent=2, ensure_ascii=False)

        total_points = sum(len(p.get('points', [])) for p in paths)
        return jsonify({
            'success': True,
            'message': f'路径已保存到 {map_name}',
            'paths_count': len(paths),
            'total_points': total_points,
            'paths_file': str(paths_file.name),
            'map_type': map_type,
            'gps_converted': map_type == 'gps'
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@path_bp.route('/<map_name>/load', methods=['GET'])
@jwt_required()
def load_path(map_name: str):
    """从 paths.json 加载多路径"""
    try:
        map_path = MAP_BASE_PATH / map_name

        if not map_path.exists():
            return jsonify({
                'success': False,
                'error': f'地图 "{map_name}" 不存在'
            }), 404

        # 获取地图配置
        config = get_map_config(map_name)
        map_type = config.get('map_type', 'local')

        # 优先加载 paths.json
        paths_file = get_paths_file(map_name)

        if paths_file.exists():
            with open(paths_file, 'r', encoding='utf-8') as f:
                paths_data = json.load(f)
            paths = paths_data.get('paths', [])

            # 对于 GPS 地图，如果路径没有 x/y/z 坐标（旧版保存的），
            # 需要在加载时转换为 UTM 坐标
            if map_type == 'gps':
                for path in paths:
                    for point in path.get('points', []):
                        if 'lat' in point and 'lng' in point and 'x' not in point:
                            lat = float(point['lat'])
                            lng = float(point['lng'])
                            alt = float(point.get('alt', 0) or 0)

                            zone, easting, northing = wgs84_to_utm(lat, lng)
                            point['zone'] = zone
                            point['x'] = easting
                            point['y'] = northing
                            point['z'] = round(alt, 3)

            return jsonify({
                'success': True,
                'paths': paths,
                'version': paths_data.get('version', '1.0'),
                'updated_at': paths_data.get('updated_at'),
                'map_type': map_type,
                'coordinate_system': 'UTM' if map_type == 'gps' else 'local',
            })

        # 兼容旧格式：尝试 path.json
        legacy_file = get_legacy_path_file(map_name)
        if legacy_file.exists():
            with open(legacy_file, 'r', encoding='utf-8') as f:
                path_data = json.load(f)
            # 转换为新格式
            legacy_paths = [{
                'id': 'path-legacy',
                'name': '路径1',
                'points': path_data.get('waypoints', [])
            }]
            return jsonify({
                'success': True,
                'paths': legacy_paths,
                'version': '1.0',
                'updated_at': path_data.get('created_at'),
                'legacy': True,
                'map_type': map_type,
            })

        # 没有路径文件时返回空数组
        return jsonify({
            'success': True,
            'paths': [],
            'version': '1.0',
            'map_type': map_type,
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@path_bp.route('/<map_name>/config', methods=['GET'])
def get_map_info(map_name: str):
    """获取地图配置信息（用于坐标转换）"""
    try:
        map_path = MAP_BASE_PATH / map_name

        if not map_path.exists():
            return jsonify({
                'success': False,
                'error': f'地图 "{map_name}" 不存在'
            }), 404

        config = get_map_config(map_name)

        return jsonify({
            'success': True,
            'map_name': map_name,
            'config': config
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@path_bp.route('/<map_name>/pixel_to_world', methods=['POST'])
@jwt_required()
def convert_pixel_to_world(map_name: str):
    """像素坐标转世界坐标"""
    try:
        map_path = MAP_BASE_PATH / map_name
        
        if not map_path.exists():
            return jsonify({
                'success': False,
                'error': f'地图 "{map_name}" 不存在'
            }), 404
        
        data = request.get_json()
        pixel_x = data.get('pixel_x', 0)
        pixel_y = data.get('pixel_y', 0)
        
        config = get_map_config(map_name)
        world = pixel_to_world(pixel_x, pixel_y, config)
        
        return jsonify({
            'success': True,
            'pixel': {'x': pixel_x, 'y': pixel_y},
            'world': world,
            'config': {
                'resolution': config['resolution'],
                'origin': config['origin'],
                'height': config['height']
            }
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@path_bp.route('/<map_name>', methods=['GET'])
@jwt_required()
def get_path_info(map_name: str):
    """获取路径信息"""
    try:
        map_path = MAP_BASE_PATH / map_name
        
        if not map_path.exists():
            return jsonify({
                'success': False,
                'error': f'地图 "{map_name}" 不存在'
            }), 404
        
        # 检查存在的路径文件
        path_files = []
        for pf in map_path.glob('path*.json'):
            path_files.append(pf.name)
        
        return jsonify({
            'success': True,
            'has_path': len(path_files) > 0,
            'map_name': map_name,
            'path_files': path_files
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
