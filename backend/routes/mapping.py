from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required
from datetime import datetime

mapping_bp = Blueprint('mapping', __name__, url_prefix='/api/mapping')

DISABLED_MESSAGE = '雷达建图算法未接入；当前 RTK 版本仅启用纯 RTK 导航链路'


def _disabled_response():
    return jsonify({
        'success': False,
        'error': DISABLED_MESSAGE,
    }), 501


def _idle_status():
    return {
        'status': 'disabled',
        'map_name': None,
        'frame_count': 0,
        'trajectory_points': 0,
        'duration_seconds': 0,
        'error_message': DISABLED_MESSAGE,
        'last_update': datetime.now().isoformat(),
    }


@mapping_bp.route('/status', methods=['GET'])
@jwt_required()
def get_mapping_status():
    return jsonify({
        'success': True,
        'status': _idle_status(),
    })


@mapping_bp.route('/start', methods=['POST'])
@jwt_required()
def start_mapping():
    return _disabled_response()


@mapping_bp.route('/stop', methods=['POST'])
@jwt_required()
def stop_mapping():
    return _disabled_response()


@mapping_bp.route('/save', methods=['POST'])
@jwt_required()
def save_map():
    return _disabled_response()


@mapping_bp.route('/update', methods=['POST'])
@jwt_required()
def update_mapping():
    return _disabled_response()


@mapping_bp.route('/recover', methods=['POST'])
@jwt_required()
def recover_mapping():
    return jsonify({
        'success': True,
        'status': _idle_status(),
    })


@mapping_bp.route('/history', methods=['GET'])
@jwt_required()
def get_mapping_history():
    return jsonify({
        'success': True,
        'history': [],
    })
