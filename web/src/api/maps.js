/**
 * 地图管理 API 封装
 */

/**
 * 获取地图列表
 * 
 * @returns {Promise<Object>} 地图列表
 */
export async function getMaps() {
  const response = await fetch('/api/maps');
  
  if (!response.ok) {
    throw new Error('Failed to get maps');
  }
  
  return response.json();
}

/**
 * 创建地图（通用）
 * 
 * @param {Object} mapData - 地图数据
 * @param {string} mapData.name - 地图名称
 * @param {Object} [mapData.origin] - 原点坐标（选填）
 * @param {number} mapData.origin.lat - 纬度
 * @param {number} mapData.origin.lon - 经度
 * @param {number} mapData.origin.alt - 海拔
 * @returns {Promise<Object>} 创建结果
 */
export async function createMap(mapData) {
  const response = await fetch('/api/maps', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(mapData),
  });
  
  if (!response.ok) {
    throw new Error('Failed to create map');
  }
  
  return response.json();
}

/**
 * 创建 GPS 地图
 * 
 * @param {Object} mapData - 地图数据
 * @param {string} mapData.name - 地图名称
 * @param {Object} mapData.origin - 原点坐标
 * @param {number} mapData.origin.lat - 纬度
 * @param {number} mapData.origin.lon - 经度
 * @param {number} mapData.origin.alt - 海拔
 * @returns {Promise<Object>} 保存结果
 */
export async function createGpsMap(mapData) {
  const response = await fetch('/api/maps/gps', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(mapData),
  });
  
  if (!response.ok) {
    throw new Error('Failed to create GPS map');
  }
  
  return response.json();
}

/**
 * 创建融合地图
 * 
 * @param {Object} mapData - 地图数据
 * @param {string} mapData.name - 地图名称
 * @param {string} mapData.pcdFile - PCD 文件路径
 * @param {Object} mapData.origin - 原点坐标
 * @param {number} mapData.origin.lat - 纬度
 * @param {number} mapData.origin.lon - 经度
 * @param {number} mapData.origin.alt - 海拔
 * @returns {Promise<Object>} 保存结果
 */
export async function createFusionMap(mapData) {
  const response = await fetch('/api/maps/fusion', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(mapData),
  });
  
  if (!response.ok) {
    throw new Error('Failed to create fusion map');
  }
  
  return response.json();
}

/**
 * 获取 RTK 原点 (当前固定解)
 * 
 * @returns {Promise<Object>} RTK 原点坐标
 */
export async function getRtkOrigin() {
  const response = await fetch('/api/rtk/origin');
  
  if (!response.ok) {
    throw new Error('Failed to get RTK origin');
  }
  
  return response.json();
}

/**
 * 删除地图
 * 
 * @param {string} mapName - 地图名称
 * @returns {Promise<Object>} 删除结果
 */
export async function deleteMap(mapName) {
  const response = await fetch(`/api/maps?name=${mapName}`, {
    method: 'DELETE',
  });
  
  if (!response.ok) {
    throw new Error('Failed to delete map');
  }
  
  return response.json();
}
