/**
 * ROS 通信封装模块
 * 
 * 基于 roslibjs 封装常用的 ROS 操作
 * 
 * @module utils/ros
 */

import * as ROSLIB from 'roslib';
import { WS_BASE } from '../config';

// ROS 连接实例 (单例)
let rosInstance = null;
const statusCallbacks = [];

/**
 * ROS 连接管理类 (兼容原有 RosContext)
 */
export class ROSConnection {
  constructor() {
    this.ros = null;
    this.connected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
  }

  /**
   * 连接到 ROS
   */
  async connect() {
    return new Promise((resolve, reject) => {
      this.ros = new ROSLIB.Ros({
        url: WS_BASE
      });

      this.ros.on('connection', () => {
        console.log('[ROS] Connected');
        this.connected = true;
        this.reconnectAttempts = 0;
        this._notifyStatus({ connected: true });
        resolve();
      });

      this.ros.on('error', (error) => {
        console.error('[ROS] Error:', error);
        this.connected = false;
        this._notifyStatus({ connected: false });
        reject(error);
      });

      this.ros.on('close', () => {
        console.log('[ROS] Connection closed');
        this.connected = false;
        this._notifyStatus({ connected: false });
      });
    });
  }

  /**
   * 断开连接
   */
  disconnect() {
    if (this.ros) {
      this.ros.close();
      this.ros = null;
      this.connected = false;
      this._notifyStatus({ connected: false });
    }
  }

  /**
   * 检查连接状态
   */
  isConnected() {
    return this.connected && this.ros !== null;
  }

  /**
   * 获取 ROS 实例
   */
  getRos() {
    return this.ros;
  }

  /**
   * 注册状态回调
   */
  registerStatusCallback(callback) {
    statusCallbacks.push(callback);
    // 立即通知当前状态
    callback({ connected: this.connected });
  }

  /**
   * 注销状态回调
   */
  unregisterStatusCallback(callback) {
    const index = statusCallbacks.indexOf(callback);
    if (index > -1) {
      statusCallbacks.splice(index, 1);
    }
  }

  /**
   * 通知状态变化
   */
  _notifyStatus(status) {
    statusCallbacks.forEach(cb => cb(status));
  }

  /**
   * 订阅话题
   * 
   * @param {string} topicName - 话题名称
   * @param {Function} callback - 回调函数 (message) => void
   * @param {string} messageType - 消息类型 (可选，默认 std_msgs/String)
   * @returns {Function|null} 取消订阅函数，失败返回 null
   */
  subscribe(topicName, callback, messageType = 'std_msgs/String') {
    if (!this.ros || !this.connected) {
      console.warn('[ROS] Cannot subscribe: ROS not connected');
      return null;
    }
    
    try {
      const topic = new ROSLIB.Topic({
        ros: this.ros,
        name: topicName,
        messageType: messageType
      });
      
      topic.subscribe(callback);
      
      // 返回取消订阅函数
      return () => {
        topic.unsubscribe();
      };
    } catch (error) {
      console.error('[ROS] Subscribe error:', error);
      return null;
    }
  }
}

/**
 * 默认导出 ROS 实例 (兼容旧代码)
 */
const defaultRosInstance = {
  ros: null,
  
  // 连接方法
  connect: async () => {
    if (!rosInstance) {
      rosInstance = new ROSLIB.Ros({ url: WS_BASE });
      
      // 设置连接状态监听
      rosInstance.on('connection', () => {
        defaultRosInstance._notifyStatus({ connected: true });
      });
      rosInstance.on('close', () => {
        defaultRosInstance._notifyStatus({ connected: false });
      });
      rosInstance.on('error', () => {
        defaultRosInstance._notifyStatus({ connected: false });
      });
    }
    
    // 如果已连接，直接通知
    if (rosInstance.isConnected) {
      defaultRosInstance._notifyStatus({ connected: true });
      return Promise.resolve();
    }
    
    return new Promise((resolve, reject) => {
      rosInstance.once('connection', resolve);
      rosInstance.once('error', reject);
    });
  },
  
  // 断开连接
  disconnect: () => {
    if (rosInstance) {
      rosInstance.close();
      rosInstance = null;
    }
  },
  
  // 检查连接状态
  isConnected: () => rosInstance !== null && rosInstance.isConnected,
  
  // 话题订阅
  subscribe: (topicName, callback, messageType = 'std_msgs/String') => {
    if (!rosInstance) return null;
    const topic = new ROSLIB.Topic({
      ros: rosInstance,
      name: topicName,
      messageType: messageType
    });
    topic.subscribe(callback);
    return () => topic.unsubscribe();
  },
  
  // 话题取消订阅
  unsubscribe: (topic) => {
    if (topic && typeof topic === 'function') {
      topic();
    }
  },
  
  // 事件监听
  on: (event, callback) => {
    if (rosInstance) rosInstance.on(event, callback);
  },
  once: (event, callback) => {
    if (rosInstance) rosInstance.once(event, callback);
  },
  off: (event, callback) => {
    if (rosInstance) rosInstance.off(event, callback);
  },
  
  // 话题发布
  publish: (topicName, message, messageType = 'std_msgs/String') => {
    if (!rosInstance) return;
    const topic = new ROSLIB.Topic({
      ros: rosInstance,
      name: topicName,
      messageType: messageType
    });
    topic.publish(new ROSLIB.Message(message));
  },
  
  // 状态回调 (兼容 RosContext)
  registerStatusCallback: (callback) => {
    statusCallbacks.push(callback);
    callback({ connected: defaultRosInstance.isConnected() });
  },
  unregisterStatusCallback: (callback) => {
    const index = statusCallbacks.indexOf(callback);
    if (index > -1) statusCallbacks.splice(index, 1);
  },
  _notifyStatus: (status) => {
    statusCallbacks.forEach(cb => cb(status));
  },
};

// 监听 ROS 连接事件
if (typeof window !== 'undefined') {
  // 延迟初始化，等待 rosInstance 被设置
  setTimeout(() => {
    if (rosInstance) {
      rosInstance.on('connection', () => defaultRosInstance._notifyStatus({ connected: true }));
      rosInstance.on('close', () => defaultRosInstance._notifyStatus({ connected: false }));
      rosInstance.on('error', () => defaultRosInstance._notifyStatus({ connected: false }));
    }
  }, 100);
}

export default defaultRosInstance;

/**
 * ROS 参数操作类
 */
export class RosParam {
  /**
   * 创建参数实例
   * 
   * @param {string} name - 参数名称 (如 '/um982_rtk_node/config')
   */
  constructor(name) {
    this.ros = getRosInstance();
    this.param = new ROSLIB.Param({
      ros: this.ros,
      name: name
    });
  }
  
  /**
   * 获取参数值
   * 
   * @returns {Promise<any>} 参数值
   */
  async get() {
    return new Promise((resolve, reject) => {
      this.param.get((value) => {
        if (value === null || value === undefined) {
          reject(new Error(`Parameter not found`));
        } else {
          resolve(value);
        }
      });
    });
  }
  
  /**
   * 设置参数值
   * 
   * @param {any} value - 参数值
   * @returns {Promise<void>}
   */
  async set(value) {
    return new Promise((resolve, reject) => {
      this.param.set(value, (success) => {
        if (success) {
          resolve();
        } else {
          reject(new Error('Failed to set parameter'));
        }
      });
    });
  }
  
  /**
   * 删除参数
   * 
   * @returns {Promise<void>}
   */
  async delete() {
    return new Promise((resolve, reject) => {
      this.param.delete((success) => {
        if (success) {
          resolve();
        } else {
          reject(new Error('Failed to delete parameter'));
        }
      });
    });
  }
}

/**
 * ROS 话题订阅类
 */
export class RosTopic {
  /**
   * 创建话题订阅实例
   * 
   * @param {Object} options - 话题配置
   * @param {string} options.name - 话题名称 (如 '/gps/fix')
   * @param {string} options.messageType - 消息类型 (如 'sensor_msgs/NavSatFix')
   * @param {boolean} [options.throttleRate=0] - 节流率 (ms)，0 表示不限流
   */
  constructor(options) {
    this.ros = getRosInstance();
    this.name = options.name;
    this.messageType = options.messageType;
    this.throttleRate = options.throttleRate || 0;
    
    this.topic = new ROSLIB.Topic({
      ros: this.ros,
      name: options.name,
      messageType: options.messageType,
      throttle_rate: this.throttleRate
    });
    
    this.callbacks = [];
  }
  
  /**
   * 订阅话题
   * 
   * @param {Function} callback - 回调函数 (message) => void
   * @returns {Function} 取消订阅函数
   */
  subscribe(callback) {
    this.callbacks.push(callback);
    
    const handler = (message) => {
      this.callbacks.forEach(cb => cb(message));
    };
    
    this.topic.subscribe(handler);
    
    // 返回取消订阅函数
    return () => {
      this.unsubscribe(callback);
    };
  }
  
  /**
   * 取消订阅
   * 
   * @param {Function} callback - 要移除的回调函数
   */
  unsubscribe(callback) {
    const index = this.callbacks.indexOf(callback);
    if (index > -1) {
      this.callbacks.splice(index, 1);
    }
    
    if (this.callbacks.length === 0) {
      this.topic.unsubscribe();
    }
  }
  
  /**
   * 发布消息 (仅用于可发布的话题)
   * 
   * @param {Object} message - 消息内容
   */
  publish(message) {
    const rosMessage = new ROSLIB.Message(message);
    this.topic.publish(rosMessage);
  }
}

/**
 * ROS 服务调用类
 */
export class RosService {
  /**
   * 创建服务实例
   * 
   * @param {Object} options - 服务配置
   * @param {string} options.name - 服务名称 (如 '/set_pose')
   * @param {string} options.serviceType - 服务类型 (如 'geometry_msgs/Pose')
   */
  constructor(options) {
    this.ros = getRosInstance();
    
    this.service = new ROSLIB.Service({
      ros: this.ros,
      name: options.name,
      serviceType: options.serviceType
    });
  }
  
  /**
   * 调用服务
   * 
   * @param {Object} request - 请求数据
   * @returns {Promise<Object>} 响应数据
   */
  async call(request) {
    return new Promise((resolve, reject) => {
      const requestMessage = new ROSLIB.ServiceRequest(request);
      
      this.service.callService(requestMessage, (response) => {
        if (response.success !== undefined && !response.success) {
          reject(new Error(response.message || 'Service call failed'));
        } else {
          resolve(response);
        }
      }, (error) => {
        reject(error);
      });
    });
  }
}

/**
 * 获取 ROS 连接实例 (单例)
 * 
 * @returns {ROSLIB.Ros} ROS 连接实例
 */
export function getRosInstance() {
  if (!rosInstance) {
    rosInstance = new ROSLIB.Ros({
      url: WS_BASE
    });
    
    // 连接事件处理
    rosInstance.on('connection', () => {
      console.log('[ROS] Connected to ROS');
    });
    
    rosInstance.on('error', (error) => {
      console.error('[ROS] Connection error:', error);
    });
    
    rosInstance.on('close', () => {
      console.log('[ROS] Connection closed');
    });
  }
  
  return rosInstance;
}

/**
 * 连接到 ROS
 * 
 * @returns {Promise<void>} 连接成功的 Promise
 */
export function connectRos() {
  return new Promise((resolve, reject) => {
    const ros = getRosInstance();
    
    let attempts = 0;
    
    const tryConnect = () => {
      attempts++;
      
      // 移除旧的事件监听器
      ros.off('connection');
      ros.off('error');
      
      // 添加一次性事件监听器
      ros.once('connection', () => {
        console.log(`[ROS] Connected after ${attempts} attempt(s)`);
        resolve();
      });
      
      ros.once('error', (error) => {
        console.error(`[ROS] Connection error (attempt ${attempts}/${5}):`, error);
        
        if (attempts >= 5) {
          reject(new Error(`Failed to connect to ROS after ${attempts} attempts`));
        } else {
          setTimeout(tryConnect, 1000);
        }
      });
    };
    
    tryConnect();
  });
}

/**
 * 断开 ROS 连接
 */
export function disconnectRos() {
  if (rosInstance) {
    rosInstance.close();
    rosInstance = null;
  }
}

/**
 * 工具函数：等待 ROS 连接
 * 
 * @param {number} timeout - 超时时间 (ms)
 * @returns {Promise<void>}
 */
export async function waitForRos(timeout = 5000) {
  const ros = getRosInstance();
  
  return new Promise((resolve, reject) => {
    if (ros.isConnected) {
      resolve();
      return;
    }
    
    const timeoutId = setTimeout(() => {
      reject(new Error('ROS connection timeout'));
    }, timeout);
    
    ros.once('connection', () => {
      clearTimeout(timeoutId);
      resolve();
    });
    
    ros.once('error', (error) => {
      clearTimeout(timeoutId);
      reject(error);
    });
  });
}

/**
 * 工具函数：检查 ROS 连接状态
 * 
 * @returns {boolean} 是否已连接
 */
export function isRosConnected() {
  return rosInstance && rosInstance.isConnected;
}
