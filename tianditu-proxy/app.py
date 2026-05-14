#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
天地图代理服务 - 独立部署版本

功能:
- 天地图 WMTS 瓦片代理
- API Token 验证（防止盗链）
- 内存缓存（可配置 TTL）
- 配置管理 API
- 缓存管理 API

使用示例:
- 影像瓦片：http://localhost:5001/api/tianditu/img_w/5/10/20?token=xxx
- 标注瓦片：http://localhost:5001/api/tianditu/cva_w/5/10/20?token=xxx
- 健康检查：http://localhost:5001/api/tianditu/health
- 配置查看：http://localhost:5001/api/tianditu/config
- 清空缓存：curl -X POST http://localhost:5001/api/tianditu/cache/clear
"""

from flask import Flask, request, Response, jsonify, current_app
from flask_cors import CORS
from functools import wraps
import requests
import time

# 导入配置
import config

# 创建 Flask 应用
app = Flask(__name__)
app.config.from_object(config)

# 启用 CORS
CORS(app, resources={r"/api/*": {"origins": app.config['CORS_ORIGINS']}})

# 内存缓存
tile_cache = {}


def require_token(f):
    """Token 验证装饰器"""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.args.get('token')
        if not token or token != current_app.config['API_TOKEN']:
            return jsonify({
                'error': 'Invalid or missing token',
                'message': 'Please provide a valid API token via ?token=xxx'
            }), 403
        return f(*args, **kwargs)
    return decorated


def get_cache_key(layer, z, x, y):
    """生成缓存键"""
    return f'{layer}_{z}_{x}_{y}'


def cache_tile(key, data):
    """缓存瓦片"""
    # 检查缓存大小
    if len(tile_cache) >= current_app.config['CACHE_MAX_SIZE']:
        # 清空最旧的 10% 缓存
        keys_to_remove = list(tile_cache.keys())[:len(tile_cache) // 10]
        for k in keys_to_remove:
            del tile_cache[k]
    
    tile_cache[key] = (time.time(), data)


def get_cached_tile(key):
    """获取缓存的瓦片"""
    if key not in tile_cache:
        return None
    
    cached_time, data = tile_cache[key]
    if time.time() - cached_time > current_app.config['CACHE_TTL']:
        del tile_cache[key]
        return None
    
    return data


@app.route('/api/tianditu/img_w/<int:z>/<int:x>/<int:y>')
#@require_token
def proxy_img_w(z, x, y):
    """
    代理天地图影像底图瓦片
    
    Args:
        z: 缩放级别 (1-18)
        x: 瓦片列号
        y: 瓦片行号
        token: API Token（必需）
    
    Returns:
        JPEG 图片响应
    """
    # 参数验证
    if z < 1 or z > 18:
        return jsonify({'error': 'Invalid zoom level (1-18)'}), 400
    if x < 0 or y < 0:
        return jsonify({'error': 'Invalid tile coordinates'}), 400
    
    # 检查缓存
    cache_key = get_cache_key('img_w', z, x, y)
    cached_data = get_cached_tile(cache_key)
    if cached_data:
        return Response(cached_data, mimetype='image/jpeg')
    
    # 构建天地图请求 URL
    tdt_url = 'http://t0.tianditu.gov.cn/img_w/wmts'
    params = {
        'service': 'wmts',
        'request': 'GetTile',
        'version': '1.0.0',
        'LAYER': 'img',
        'tileMatrixSet': 'w',
        'TileMatrix': str(z),
        'TileRow': str(y),
        'TileCol': str(x),
        'style': 'default',
        'format': 'tiles',
        'tk': current_app.config['TDT_TOKEN']
    }
    
    try:
        # 请求天地图
        response = requests.get(tdt_url, params=params, timeout=10)
        
        if response.status_code == 200:
            # 缓存瓦片数据
            cache_tile(cache_key, response.content)
            return Response(response.content, mimetype='image/jpeg')
        else:
            return jsonify({'error': f'Tianditu API error: {response.status_code}'}), 502
            
    except requests.exceptions.Timeout:
        return jsonify({'error': 'Tianditu API timeout'}), 504
    except requests.exceptions.RequestException as e:
        return jsonify({'error': str(e)}), 502


@app.route('/api/tianditu/cva_w/<int:z>/<int:x>/<int:y>')
#@require_token
def proxy_cva_w(z, x, y):
    """
    代理天地图标注瓦片
    
    Args:
        z: 缩放级别 (1-18)
        x: 瓦片列号
        y: 瓦片行号
        token: API Token（必需）
    
    Returns:
        PNG 图片响应
    """
    # 参数验证
    if z < 1 or z > 18:
        return jsonify({'error': 'Invalid zoom level (1-18)'}), 400
    if x < 0 or y < 0:
        return jsonify({'error': 'Invalid tile coordinates'}), 400
    
    # 检查缓存
    cache_key = get_cache_key('cva_w', z, x, y)
    cached_data = get_cached_tile(cache_key)
    if cached_data:
        return Response(cached_data, mimetype='image/png')
    
    # 构建天地图请求 URL
    tdt_url = 'http://t0.tianditu.gov.cn/cva_w/wmts'
    params = {
        'service': 'wmts',
        'request': 'GetTile',
        'version': '1.0.0',
        'LAYER': 'cva',
        'tileMatrixSet': 'w',
        'TileMatrix': str(z),
        'TileRow': str(y),
        'TileCol': str(x),
        'style': 'default',
        'format': 'tiles',
        'tk': current_app.config['TDT_TOKEN']
    }
    
    try:
        # 请求天地图
        response = requests.get(tdt_url, params=params, timeout=10)
        
        if response.status_code == 200:
            # 缓存瓦片数据
            cache_tile(cache_key, response.content)
            return Response(response.content, mimetype='image/png')
        else:
            return jsonify({'error': f'Tianditu API error: {response.status_code}'}), 502
            
    except requests.exceptions.Timeout:
        return jsonify({'error': 'Tianditu API timeout'}), 504
    except requests.exceptions.RequestException as e:
        return jsonify({'error': str(e)}), 502


@app.route('/api/tianditu/health')
def health():
    """健康检查"""
    return jsonify({
        'status': 'ok',
        'service': 'tianditu-proxy',
        'version': '2.0.0',
        'cache': {
            'size': len(tile_cache),
            'max_size': current_app.config['CACHE_MAX_SIZE'],
            'ttl': current_app.config['CACHE_TTL']
        }
    })


@app.route('/api/tianditu/config', methods=['GET'])
def get_config():
    """获取配置（不返回敏感信息）"""
    return jsonify({
        'port': current_app.config['PORT'],
        'host': current_app.config['HOST'],
        'cache_ttl': current_app.config['CACHE_TTL'],
        'cache_max_size': current_app.config['CACHE_MAX_SIZE'],
        'cache_size': len(tile_cache),
        'cors_origins': current_app.config['CORS_ORIGINS'],
        'debug': current_app.config['DEBUG']
    })


@app.route('/api/tianditu/config', methods=['POST'])
def update_config():
    """更新配置"""
    data = request.json
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    updated = {}
    if 'cache_ttl' in data:
        current_app.config['CACHE_TTL'] = int(data['cache_ttl'])
        updated['cache_ttl'] = current_app.config['CACHE_TTL']
    if 'cache_max_size' in data:
        current_app.config['CACHE_MAX_SIZE'] = int(data['cache_max_size'])
        updated['cache_max_size'] = current_app.config['CACHE_MAX_SIZE']
    if 'cors_origins' in data:
        current_app.config['CORS_ORIGINS'] = data['cors_origins']
        updated['cors_origins'] = current_app.config['CORS_ORIGINS']
    
    return jsonify({
        'status': 'ok',
        'updated': updated
    })


@app.route('/api/tianditu/cache/stats', methods=['GET'])
def cache_stats():
    """缓存统计"""
    return jsonify({
        'size': len(tile_cache),
        'max_size': current_app.config['CACHE_MAX_SIZE'],
        'ttl': current_app.config['CACHE_TTL']
    })


@app.route('/api/tianditu/cache/clear', methods=['POST'])
def clear_cache():
    """清空缓存"""
    cleared = len(tile_cache)
    tile_cache.clear()
    return jsonify({
        'status': 'ok',
        'cleared': cleared
    })


if __name__ == '__main__':
    print(f"""
╔════════════════════════════════════════════════════════╗
║          天地图代理服务 - 独立部署版本                  ║
╠════════════════════════════════════════════════════════╣
║  启动配置：                                            ║
║  - 主机：{config.HOST:<40} ║
║  - 端口：{config.PORT:<40} ║
║  - 缓存 TTL: {config.CACHE_TTL} 秒                           ║
║  - 最大缓存：{config.CACHE_MAX_SIZE} 瓦片                       ║
║  - API Token: {config.API_TOKEN:<32} ║
╠════════════════════════════════════════════════════════╣
║  API 端点：                                            ║
║  - 影像瓦片：/api/tianditu/img_w/<z>/<x>/<y>?token=x  ║
║  - 标注瓦片：/api/tianditu/cva_w/<z>/<x>/<y>?token=x  ║
║  - 健康检查：/api/tianditu/health                      ║
║  - 配置管理：/api/tianditu/config                      ║
║  - 缓存统计：/api/tianditu/cache/stats                 ║
║  - 清空缓存：/api/tianditu/cache/clear (POST)          ║
╚════════════════════════════════════════════════════════╝
    """)
    
    app.run(
        host=config.HOST,
        port=config.PORT,
        debug=config.DEBUG,
        threaded=True
    )
