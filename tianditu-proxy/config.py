"""
天地图代理服务配置

安全提示：
- 不要在本文件中写入真实 Token
- 通过环境变量 TIANDITU_TOKEN 和 TIANDITU_API_TOKEN 注入现场配置
"""

import os

# 天地图 Token
TDT_TOKEN = os.environ.get('TIANDITU_TOKEN', '')

# API 访问 Token（防止盗链）
# 生成方法：python3 -c "import secrets; print(secrets.token_hex(16))"
API_TOKEN = os.environ.get('TIANDITU_API_TOKEN', 'sigu_tdt_2026_secure_token')

# 服务配置
PORT = 5001
HOST = '0.0.0.0'

# 缓存配置
CACHE_TTL = 3600  # 秒（1 小时）
CACHE_MAX_SIZE = 1000  # 最大瓦片数

# CORS 配置
CORS_ORIGINS = ['*']

# 调试模式
DEBUG = False
