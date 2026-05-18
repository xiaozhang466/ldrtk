from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models.navigation_state import NavigationStateManager, NavigationStatus
from config.config import Config
from datetime import datetime
from pathlib import Path
import subprocess
import os
import signal

navigation_bp = Blueprint('navigation', __name__, url_prefix='/api/navigation')

# 全局状态管理器
state_manager = NavigationStateManager()

# 服务脚本路径
PROJECT_ROOT = Path(Config.PROJECT_ROOT)
NAVIGATION_SCRIPT = PROJECT_ROOT / 'nav' / 'scripts' / 'start.sh'
STOP_NAVIGATION_SCRIPT = PROJECT_ROOT / 'nav' / 'scripts' / 'stop.sh'


@navigation_bp.route('/status', methods=['GET'])
@jwt_required()
def get_navigation_status():
    """获取导航状态"""
    try:
        state = state_manager.get_state()

        duration_seconds = 0
        if state.get('start_time'):
            try:
                start_time = datetime.fromisoformat(state['start_time'])
                duration_seconds = int((datetime.now() - start_time).total_seconds())
            except:
                pass

        state['duration_seconds'] = duration_seconds

        return jsonify({
            'success': True,
            'status': state
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@navigation_bp.route('/start', methods=['POST'])
@jwt_required()
def start_navigation():
    """启动导航服务"""
    try:
        data = request.get_json(silent=True) or {}
        map_name = str(data.get('map_name', '睿程佑')).strip()

        if not map_name:
            return jsonify({
                'success': False,
                'error': '地图名称不能为空'
            }), 400

        # 检查导航是否已在运行
        current_state = state_manager.get_state()
        if current_state['status'] in [
            NavigationStatus.STARTING.value,
            NavigationStatus.RUNNING.value,
            NavigationStatus.STOPPING.value,
        ]:
            return jsonify({
                'success': False,
                'error': '导航服务已在运行或正在切换状态'
            }), 409

        # 检查脚本是否存在
        if not NAVIGATION_SCRIPT.exists():
            return jsonify({
                'success': False,
                'error': f'导航脚本不存在：{NAVIGATION_SCRIPT}'
            }), 500

        state_manager.start_navigation(map_name)

        # 启动导航脚本（后台运行）
        try:
            log_file = f'/tmp/navigation_{map_name}.log'
            with open(log_file, 'w', encoding='utf-8') as f:
                f.write(f'开始导航：{map_name}\n时间：{datetime.now().isoformat()}\n')

            with open(log_file, 'a', encoding='utf-8') as log_handle:
                process = subprocess.Popen(
                    ['bash', str(NAVIGATION_SCRIPT), f'map_name:={map_name}'],
                    stdout=log_handle,
                    stderr=subprocess.STDOUT,
                    start_new_session=True,
                    cwd=str(PROJECT_ROOT)
                )
                print(f'✅ 导航脚本已启动，PID: {process.pid}，日志：{log_file}')

                try:
                    return_code = process.wait(timeout=8)
                except subprocess.TimeoutExpired:
                    return_code = None

            if return_code not in (None, 0):
                state_manager.error_navigation(f'导航启动脚本退出，返回码：{return_code}')
                return jsonify({
                    'success': False,
                    'error': f'导航启动脚本失败，返回码：{return_code}',
                    'status': state_manager.get_state()
                }), 500

            state_manager.running()

        except Exception as e:
            print(f'❌ 启动脚本失败：{str(e)}')
            state_manager.error_navigation(f'启动脚本失败：{str(e)}')
            return jsonify({
                'success': False,
                'error': f'启动脚本失败：{str(e)}',
                'status': state_manager.get_state()
            }), 500

        return jsonify({
            'success': True,
            'message': f'开始导航：{map_name}',
            'status': state_manager.get_state()
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@navigation_bp.route('/stop', methods=['POST'])
@jwt_required()
def stop_navigation():
    """停止导航服务"""
    try:
        if not STOP_NAVIGATION_SCRIPT.exists():
            return jsonify({
                'success': False,
                'error': f'停止脚本不存在：{STOP_NAVIGATION_SCRIPT}'
            }), 500

        state_manager.set_status(NavigationStatus.STOPPING)

        try:
            result = subprocess.run(
                ['bash', str(STOP_NAVIGATION_SCRIPT)],
                capture_output=True,
                text=True,
                timeout=30
            )
            print(f'✅ 导航停止脚本执行完成')
        except subprocess.TimeoutExpired:
            state_manager.error_navigation('停止脚本执行超时')
            return jsonify({
                'success': False,
                'error': '停止脚本执行超时'
            }), 500

        state_manager.stop_navigation()

        return jsonify({
            'success': True,
            'message': '导航已停止',
            'status': state_manager.get_state()
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@navigation_bp.route('/recover', methods=['POST'])
@jwt_required()
def recover_navigation():
    """恢复导航状态（异常退出后）"""
    try:
        state = state_manager.recover_state()
        return jsonify({
            'success': True,
            'status': state
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
