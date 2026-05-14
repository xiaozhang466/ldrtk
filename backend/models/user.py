import os
import json
import bcrypt
from datetime import datetime
from pathlib import Path

class UserModel:
    """用户模型 - 本地文件存储"""
    
    def __init__(self, config_path: str = '/home/ros/ZMG/sigu/rtk/data/config'):
        self.config_path = Path(config_path)
        self.users_file = self.config_path / 'users.json'
        self._ensure_config_dir()
        self._ensure_default_user()
    
    def _ensure_config_dir(self):
        """确保配置目录存在"""
        self.config_path.mkdir(parents=True, exist_ok=True)
    
    def _ensure_default_user(self):
        """确保默认用户存在"""
        if not self.users_file.exists():
            self._create_default_user()
    
    def _create_default_user(self):
        """创建默认管理员账号"""
        users = {
            'version': '1.0',
            'users': [{
                'username': 'admin',
                'password_hash': bcrypt.hashpw(
                    'Sigu@2026'.encode('utf-8'),
                    bcrypt.gensalt(rounds=12)
                ).decode('utf-8'),
                'created_at': datetime.now().isoformat(),
                'last_login': None,
                'password_changed': False,
                'locked': False,
                'failed_attempts': 0
            }]
        }
        self._save_users(users)
    
    def _save_users(self, users: dict):
        """原子保存用户数据"""
        temp_file = self.users_file.with_suffix('.tmp')
        with open(temp_file, 'w') as f:
            json.dump(users, f, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temp_file, self.users_file)
    
    def _load_users(self) -> dict:
        """加载用户数据"""
        if not self.users_file.exists():
            self._create_default_user()
        
        with open(self.users_file, 'r') as f:
            return json.load(f)
    
    def get_user(self, username: str) -> dict:
        """获取用户信息"""
        users = self._load_users()
        for user in users['users']:
            if user['username'] == username:
                return user
        return None
    
    def verify_password(self, username: str, password: str) -> bool:
        """验证密码"""
        user = self.get_user(username)
        if not user:
            return False
        
        if user.get('locked'):
            return False
        
        return bcrypt.checkpw(
            password.encode('utf-8'),
            user['password_hash'].encode('utf-8')
        )
    
    def update_login(self, username: str):
        """更新登录信息"""
        users = self._load_users()
        for user in users['users']:
            if user['username'] == username:
                user['last_login'] = datetime.now().isoformat()
                user['failed_attempts'] = 0
                user['locked'] = False
                break
        self._save_users(users)
    
    def record_failed_attempt(self, username: str, max_attempts: int = 5):
        """记录失败尝试"""
        users = self._load_users()
        for user in users['users']:
            if user['username'] == username:
                user['failed_attempts'] = user.get('failed_attempts', 0) + 1
                if user['failed_attempts'] >= max_attempts:
                    user['locked'] = True
                break
        self._save_users(users)
    
    def change_password(self, username: str, new_password: str) -> bool:
        """修改密码"""
        users = self._load_users()
        for user in users['users']:
            if user['username'] == username:
                user['password_hash'] = bcrypt.hashpw(
                    new_password.encode('utf-8'),
                    bcrypt.gensalt(rounds=12)
                ).decode('utf-8')
                user['password_changed'] = True
                user['failed_attempts'] = 0
                user['locked'] = False
                break
        self._save_users(users)
        return True
    
    def validate_password_strength(self, password: str) -> tuple:
        """验证密码强度"""
        errors = []
        
        if len(password) < 8:
            errors.append('密码长度至少 8 位')
        
        if not any(c.isupper() for c in password):
            errors.append('密码必须包含大写字母')
        
        if not any(c.islower() for c in password):
            errors.append('密码必须包含小写字母')
        
        if not any(c.isdigit() for c in password):
            errors.append('密码必须包含数字')
        
        return len(errors) == 0, errors
