#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
GPS 地图管理 API

功能:
- GPS 地图创建
- 多点配准算法（最小二乘法）
- 配准参数保存
- 地图文件管理
"""

from flask import Blueprint, request, jsonify
import os
import json
import math
from datetime import datetime

gps_map_bp = Blueprint('gps_map', __name__, url_prefix='/api/gps_map')

# 地图存储目录
MAPS_DIR = '/home/ros/ZMG/sigu/rtk/data/maps'

# 确保目录存在
os.makedirs(MAPS_DIR, exist_ok=True)


def calculate_transform(gps_points, local_points):
    """
    计算 GPS 坐标到本地坐标的转换参数（最小二乘法）
    
    Args:
        gps_points: [(lat, lon), ...] GPS 坐标列表
        local_points: [(x, y), ...] 本地坐标列表
    
    Returns:
        {
            'origin_lat': float,      # 原点纬度
            'origin_lon': float,      # 原点经度
            'scale': float,           # 缩放比例
            'rotation': float,        # 旋转角度（弧度）
            'translation_x': float,   # X 平移
            'translation_y': float,   # Y 平移
            'error': float            # 配准误差（米）
        }
    """
    if len(gps_points) < 3:
        return {'error': '至少需要 3 个控制点'}
    
    # 计算 GPS 坐标的中心点
    origin_lat = sum(p[0] for p in gps_points) / len(gps_points)
    origin_lon = sum(p[1] for p in gps_points) / len(gps_points)
    
    # 将 GPS 坐标转换为平面坐标（米）
    # 使用简化的经纬度到米的转换
    R = 6378137  # 地球半径（米）
    
    gps_plane = []
    for lat, lon in gps_points:
        x = R * math.radians(lon - origin_lon) * math.cos(math.radians(origin_lat))
        y = R * math.radians(lat - origin_lat)
        gps_plane.append((x, y))
    
    # 使用最小二乘法计算变换参数
    # 假设变换模型：local = scale * R(rotation) * gps_plane + translation
    
    # 简化处理：计算平均缩放和平移
    scale_sum = 0
    rotation_sum = 0
    translation_x_sum = 0
    translation_y_sum = 0
    
    for i, (gps, local) in enumerate(zip(gps_plane, local_points)):
        # 计算缩放
        gps_dist = math.sqrt(gps[0]**2 + gps[1]**2)
        local_dist = math.sqrt(local[0]**2 + local[1]**2)
        if gps_dist > 0:
            scale_sum += local_dist / gps_dist
        
        # 计算旋转
        gps_angle = math.atan2(gps[1], gps[0])
        local_angle = math.atan2(local[1], local[0])
        rotation_sum += local_angle - gps_angle
        
        # 计算平移
        translation_x_sum += local[0] - gps[0]
        translation_y_sum += local[1] - gps[1]
    
    n = len(gps_points)
    scale = scale_sum / n if n > 0 else 1.0
    rotation = rotation_sum / n if n > 0 else 0.0
    translation_x = translation_x_sum / n if n > 0 else 0.0
    translation_y = translation_y_sum / n if n > 0 else 0.0
    
    # 计算配准误差
    error_sum = 0
    for gps, local in zip(gps_plane, local_points):
        # 应用变换
        x_transformed = scale * (gps[0] * math.cos(rotation) - gps[1] * math.sin(rotation)) + translation_x
        y_transformed = scale * (gps[0] * math.sin(rotation) + gps[1] * math.cos(rotation)) + translation_y
        
        # 计算误差
        dx = x_transformed - local[0]
        dy = y_transformed - local[1]
        error_sum += math.sqrt(dx**2 + dy**2)
    
    error = error_sum / n if n > 0 else 0.0
    
    return {
        'origin_lat': origin_lat,
        'origin_lon': origin_lon,
        'scale': scale,
        'rotation': rotation,
        'translation_x': translation_x,
        'translation_y': translation_y,
        'error': error
    }


@gps_map_bp.route('/create', methods=['POST'])
def create_map():
    """
    创建 GPS 地图
    
    Request JSON:
        name: 地图名称
        description: 地图描述
        origin_lat: 原点纬度（可选，不提供则自动计算）
        origin_lon: 原点经度（可选，不提供则自动计算）
    
    Returns:
        map_id: 地图 ID
        map_dir: 地图目录
    """
    data = request.json
    if not data or 'name' not in data:
        return jsonify({'error': '地图名称不能为空'}), 400
    
    map_name = data['name']
    map_dir = os.path.join(MAPS_DIR, map_name)
    
    # 检查地图是否已存在
    if os.path.exists(map_dir):
        return jsonify({'error': f'地图 {map_name} 已存在'}), 400
    
    # 创建地图目录
    os.makedirs(map_dir, exist_ok=True)
    
    # 创建地图配置文件
    config = {
        'id': map_name,
        'name': map_name,
        'type': 'gps',
        'created': datetime.now().isoformat(),
        'description': data.get('description', ''),
        'gpsOrigin': {
            'latitude': data.get('origin_lat', 39.9042),
            'longitude': data.get('origin_lon', 116.4074),
            'altitude': data.get('altitude', 50.0),
            'utmZone': 50
        },
        'coordinateSystem': {
            'type': 'wgs84',
            'epsg': 4326
        },
        'transform': None,  # 配准参数（待计算）
        'controlPoints': []  # 控制点列表
    }
    
    config_file = os.path.join(map_dir, 'map_config.json')
    with open(config_file, 'w', encoding='utf-8') as f:
        json.dump(config, f, indent=2, ensure_ascii=False)
    
    return jsonify({
        'status': 'ok',
        'map_id': map_name,
        'map_dir': map_dir,
        'config_file': config_file
    })


@gps_map_bp.route('/save_transform', methods=['POST'])
def save_transform():
    """
    保存配准参数
    
    Request JSON:
        map_id: 地图 ID
        control_points: [
            {
                'gps': {'lat': 39.9042, 'lon': 116.4074},
                'local': {'x': 10.5, 'y': 5.2}
            },
            ...
        ]
    
    Returns:
        transform: 配准参数
        error: 配准误差（米）
    """
    data = request.json
    if not data or 'map_id' not in data or 'control_points' not in data:
        return jsonify({'error': '缺少必要参数'}), 400
    
    map_id = data['map_id']
    control_points = data['control_points']
    
    if len(control_points) < 3:
        return jsonify({'error': '至少需要 3 个控制点'}), 400
    
    # 提取 GPS 坐标和本地坐标
    gps_points = []
    local_points = []
    for point in control_points:
        gps_points.append((point['gps']['lat'], point['gps']['lon']))
        local_points.append((point['local']['x'], point['local']['y']))
    
    # 计算配准参数
    transform = calculate_transform(gps_points, local_points)
    
    if 'error' in transform and isinstance(transform['error'], str):
        return jsonify({'error': transform['error']}), 400
    
    # 更新地图配置文件
    map_dir = os.path.join(MAPS_DIR, map_id)
    config_file = os.path.join(map_dir, 'map_config.json')
    
    if not os.path.exists(config_file):
        return jsonify({'error': f'地图 {map_id} 不存在'}), 404
    
    with open(config_file, 'r', encoding='utf-8') as f:
        config = json.load(f)
    
    # 更新配准参数
    config['transform'] = {
        'rotation': transform['rotation'],
        'scale': transform['scale'],
        'translation': {
            'x': transform['translation_x'],
            'y': transform['translation_y'],
            'z': 0.0
        }
    }
    config['gpsOrigin'] = {
        'latitude': transform['origin_lat'],
        'longitude': transform['origin_lon'],
        'altitude': 50.0,
        'utmZone': 50
    }
    config['controlPoints'] = control_points
    config['registrationError'] = transform['error']  # 配准误差（米）
    
    with open(config_file, 'w', encoding='utf-8') as f:
        json.dump(config, f, indent=2, ensure_ascii=False)
    
    return jsonify({
        'status': 'ok',
        'transform': transform,
        'config_file': config_file
    })


@gps_map_bp.route('/list', methods=['GET'])
def list_maps():
    """
    获取地图列表
    
    Returns:
        maps: 地图列表
    """
    maps = []
    
    if not os.path.exists(MAPS_DIR):
        return jsonify({'maps': []})
    
    for item in os.listdir(MAPS_DIR):
        item_path = os.path.join(MAPS_DIR, item)
        if os.path.isdir(item_path):
            config_file = os.path.join(item_path, 'map_config.json')
            if os.path.exists(config_file):
                with open(config_file, 'r', encoding='utf-8') as f:
                    config = json.load(f)
                maps.append({
                    'id': config.get('id', item),
                    'name': config.get('name', item),
                    'type': config.get('type', 'unknown'),
                    'created': config.get('created', ''),
                    'description': config.get('description', '')
                })
    
    return jsonify({'maps': maps})


@gps_map_bp.route('/<map_id>/config', methods=['GET'])
def get_map_config(map_id):
    """
    获取地图配置
    
    Returns:
        config: 地图配置
    """
    map_dir = os.path.join(MAPS_DIR, map_id)
    config_file = os.path.join(map_dir, 'map_config.json')
    
    if not os.path.exists(config_file):
        return jsonify({'error': f'地图 {map_id} 不存在'}), 404
    
    with open(config_file, 'r', encoding='utf-8') as f:
        config = json.load(f)
    
    return jsonify(config)


@gps_map_bp.route('/test_transform', methods=['POST'])
def test_transform():
    """
    测试配准参数（将 GPS 坐标转换为本地坐标）
    
    Request JSON:
        map_id: 地图 ID
        gps: {'lat': 39.9042, 'lon': 116.4074}
    
    Returns:
        local: {'x': 10.5, 'y': 5.2}
    """
    data = request.json
    if not data or 'map_id' not in data or 'gps' not in data:
        return jsonify({'error': '缺少必要参数'}), 400
    
    map_id = data['map_id']
    gps = data['gps']
    
    # 读取地图配置
    map_dir = os.path.join(MAPS_DIR, map_id)
    config_file = os.path.join(map_dir, 'map_config.json')
    
    if not os.path.exists(config_file):
        return jsonify({'error': f'地图 {map_id} 不存在'}), 404
    
    with open(config_file, 'r', encoding='utf-8') as f:
        config = json.load(f)
    
    transform = config.get('transform')
    origin = config.get('gpsOrigin')
    
    if not transform or not origin:
        return jsonify({'error': '地图未配准'}), 400
    
    # GPS 坐标转本地坐标
    R = 6378137  # 地球半径（米）
    
    # 转换为平面坐标
    gps_x = R * math.radians(gps['lon'] - origin['longitude']) * math.cos(math.radians(origin['latitude']))
    gps_y = R * math.radians(gps['lat'] - origin['latitude'])
    
    # 应用变换
    local_x = transform['scale'] * (gps_x * math.cos(transform['rotation']) - gps_y * math.sin(transform['rotation'])) + transform['translation']['x']
    local_y = transform['scale'] * (gps_x * math.sin(transform['rotation']) + gps_y * math.cos(transform['rotation'])) + transform['translation']['y']
    
    return jsonify({
        'local': {
            'x': local_x,
            'y': local_y,
            'z': 0.0
        }
    })
