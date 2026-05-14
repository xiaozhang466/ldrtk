from flask import Blueprint, request, jsonify, make_response
from flask_jwt_extended import (
    create_access_token, create_refresh_token,
    jwt_required, get_jwt_identity, get_jwt
)
from datetime import timedelta
import time

from models.user import UserModel
from config.config import Config

auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')
user_model = UserModel()

@auth_bp.route('/login', methods=['POST'])
def login():
    """用户登录"""
    data = request.get_json()
    
    if not data:
        return jsonify({'error': '请求数据为空'}), 400
    
    username = data.get('username', '').strip()
    password = data.get('password', '')
    
    if not username or not password:
        return jsonify({'error': '用户名和密码不能为空'}), 400
    
    # 检查用户是否存在
    user = user_model.get_user(username)
    if not user:
        # 延迟响应防枚举
        time.sleep(0.5)
        return jsonify({'error': '用户名或密码错误'}), 401
    
    # 检查是否被锁定
    if user.get('locked'):
        return jsonify({
            'error': '账号已被锁定，请 15 分钟后再试',
            'locked': True
        }), 423
    
    # 验证密码
    if not user_model.verify_password(username, password):
        user_model.record_failed_attempt(username, Config.MAX_LOGIN_ATTEMPTS)
        time.sleep(0.5)
        return jsonify({'error': '用户名或密码错误'}), 401
    
    # 创建 Token
    access_token = create_access_token(
        identity=username,
        expires_delta=timedelta(seconds=Config.JWT_ACCESS_TOKEN_EXPIRES),
        additional_claims={'role': 'admin'}
    )
    
    refresh_token = create_refresh_token(
        identity=username,
        expires_delta=timedelta(seconds=Config.JWT_REFRESH_TOKEN_EXPIRES)
    )
    
    # 更新登录信息
    user_model.update_login(username)
    
    # 设置 HttpOnly Cookie
    response = make_response(jsonify({
        'success': True,
        'username': username,
        'password_changed': user.get('password_changed', False)
    }))
    
    response.set_cookie(
        'access_token_cookie',
        access_token,
        httponly=True,
        secure=Config.JWT_COOKIE_SECURE,
        samesite=Config.JWT_COOKIE_SAMESITE,
        max_age=Config.JWT_ACCESS_TOKEN_EXPIRES
    )
    
    response.set_cookie(
        'refresh_token_cookie',
        refresh_token,
        httponly=True,
        secure=Config.JWT_COOKIE_SECURE,
        samesite=Config.JWT_COOKIE_SAMESITE,
        max_age=Config.JWT_REFRESH_TOKEN_EXPIRES
    )
    
    return response

@auth_bp.route('/refresh', methods=['POST'])
@jwt_required(refresh=True)
def refresh():
    """刷新 Access Token"""
    current_user = get_jwt_identity()
    
    new_access_token = create_access_token(
        identity=current_user,
        expires_delta=timedelta(seconds=Config.JWT_ACCESS_TOKEN_EXPIRES),
        additional_claims={'role': 'admin'}
    )
    
    response = make_response(jsonify({'success': True}))
    
    response.set_cookie(
        'access_token_cookie',
        new_access_token,
        httponly=True,
        secure=Config.JWT_COOKIE_SECURE,
        samesite=Config.JWT_COOKIE_SAMESITE,
        max_age=Config.JWT_ACCESS_TOKEN_EXPIRES
    )
    
    return response

@auth_bp.route('/logout', methods=['POST'])
def logout():
    """用户登出"""
    response = make_response(jsonify({'success': True}))
    
    # 清除 Cookie
    response.set_cookie('access_token_cookie', '', expires=0)
    response.set_cookie('refresh_token_cookie', '', expires=0)
    
    return response

@auth_bp.route('/me', methods=['GET'])
@jwt_required()
def get_current_user():
    """获取当前用户信息"""
    current_user = get_jwt_identity()
    user = user_model.get_user(current_user)
    
    if not user:
        return jsonify({'error': '用户不存在'}), 404
    
    return jsonify({
        'username': user['username'],
        'password_changed': user.get('password_changed', False),
        'last_login': user.get('last_login')
    })

@auth_bp.route('/change-password', methods=['POST'])
@jwt_required()
def change_password():
    """修改密码"""
    current_user = get_jwt_identity()
    data = request.get_json()
    
    if not data:
        return jsonify({'error': '请求数据为空'}), 400
    
    old_password = data.get('old_password', '')
    new_password = data.get('new_password', '')
    
    if not old_password or not new_password:
        return jsonify({'error': '密码不能为空'}), 400
    
    # 验证旧密码
    if not user_model.verify_password(current_user, old_password):
        return jsonify({'error': '原密码错误'}), 401
    
    # 验证新密码强度
    is_valid, errors = user_model.validate_password_strength(new_password)
    if not is_valid:
        return jsonify({
            'error': '密码强度不足',
            'errors': errors
        }), 400
    
    # 修改密码
    user_model.change_password(current_user, new_password)
    
    return jsonify({'success': True})

@auth_bp.route('/check', methods=['GET'])
def check_auth():
    """检查认证状态"""
    # 从 Cookie 获取 Token
    access_token = request.cookies.get('access_token_cookie')
    
    if not access_token:
        return jsonify({
            'authenticated': False,
            'default_user': 'admin'
        })
    
    return jsonify({
        'authenticated': True,
        'default_user': 'admin'
    })
