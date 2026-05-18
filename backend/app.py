#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
耘小智 01 - 后端 API 服务
提供地图管理、建图控制、用户认证等功能
"""

from flask import Flask, jsonify, send_from_directory, make_response
from flask_cors import CORS
from flask_jwt_extended import JWTManager
import os
import sys

# 添加项目路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config.config import Config
from routes.auth import auth_bp
from routes.mapping import mapping_bp
from routes.maps import maps_bp
from routes.path import path_bp
from routes.alignment import alignment_bp
from routes.lidar_localization import lidar_localization_bp
from routes.navigation import navigation_bp
from routes.rtk import rtk_bp

def create_app():
    """创建 Flask 应用"""
    app = Flask(__name__)
    
    # 加载配置
    app.config.from_object(Config)
    
    # 启用 CORS - 允许所有来源（生产环境可改为具体域名）
    CORS(app, 
         resources={
             r"/api/*": {"origins": "*", "supports_credentials": True},
             r"/static/*": {"origins": "*", "supports_credentials": True}
         },
         supports_credentials=True)
    
    # 初始化 JWT
    jwt = JWTManager(app)
    
    # 注册 Token 黑名单检查
    @jwt.token_in_blocklist_loader
    def check_if_token_revoked(jwt_header, jwt_payload):
        # TODO: 实现 Token 黑名单
        return False
    
    # 注册 Blueprint
    app.register_blueprint(auth_bp)
    app.register_blueprint(mapping_bp)
    app.register_blueprint(maps_bp)
    app.register_blueprint(path_bp)
    app.register_blueprint(alignment_bp)
    app.register_blueprint(lidar_localization_bp)
    app.register_blueprint(navigation_bp)
    app.register_blueprint(rtk_bp)

    # 健康检查
    @app.route('/api/health', methods=['GET'])
    def health_check():
        return jsonify({
            'status': 'ok',
            'version': '2.0.0'
        })
    
    # 静态文件服务 - 地图文件（带 CORS 头）
    @app.route('/static/maps/<map_name>/<path:filename>')
    def serve_map_file(map_name, filename):
        """提供地图文件静态服务 (PCD/PGM/YAML 等)"""
        maps_dir = app.config['MAP_BASE_PATH']
        map_path = os.path.join(maps_dir, map_name)
        if not os.path.exists(map_path):
            return jsonify({'error': '地图目录不存在'}), 404
        
        response = make_response(send_from_directory(map_path, filename))
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'GET,OPTIONS')
        return response
    
    # 错误处理
    @app.errorhandler(404)
    def not_found(error):
        return jsonify({'error': '接口不存在'}), 404
    
    @app.errorhandler(500)
    def internal_error(error):
        return jsonify({'error': '服务器内部错误'}), 500
    
    @app.errorhandler(429)
    def ratelimit_handler(error):
        return jsonify({'error': '请求过于频繁，请稍后再试'}), 429
    
    return app

if __name__ == '__main__':
    app = create_app()
    app.run(host='0.0.0.0', port=5000, debug=False)
