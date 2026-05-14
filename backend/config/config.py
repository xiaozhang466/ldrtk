import os
import secrets

class Config:
    """应用配置"""
    
    # 基础配置
    SECRET_KEY = os.environ.get('SECRET_KEY') or secrets.token_hex(32)
    
    # JWT 配置
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY') or secrets.token_hex(32)
    JWT_ACCESS_TOKEN_EXPIRES = 3600  # 1 小时
    JWT_REFRESH_TOKEN_EXPIRES = 604800  # 7 天
    JWT_TOKEN_LOCATION = ['cookies']
    JWT_COOKIE_SECURE = False  # 开发环境先不用 HTTPS
    JWT_COOKIE_CSRF_PROTECT = False  # 开发环境临时关闭 CSRF
    JWT_CSRF_IN_COOKIES = False
    JWT_COOKIE_SAMESITE = 'Lax'
    JWT_CSRF_HEADER_NAME = 'X-CSRFToken'
    
    # 文件路径
    MAP_BASE_PATH = '/home/ros/ZMG/sigu/rtk/data/maps'
    CONFIG_PATH = '/home/ros/ZMG/sigu/rtk/data/config'
    
    # 用户配置
    DEFAULT_USERNAME = 'admin'
    DEFAULT_PASSWORD = 'Sigu@2026'  # 首次登录需修改
    
    # 安全配置
    MAX_LOGIN_ATTEMPTS = 5
    LOCKOUT_DURATION = 900  # 15 分钟
    MIN_PASSWORD_LENGTH = 8
