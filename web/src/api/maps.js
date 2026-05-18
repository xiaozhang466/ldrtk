/**
 * 地图管理 API 封装
 */

/**
 * 获取地图列表
 * 
 * @returns {Promise<Object>} 地图列表
 */
export async function getMaps() {
  const response = await fetch('/api/maps', {
    credentials: 'include',
  });
  
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
    credentials: 'include',
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
  return createMap(mapData);
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
  return createMap(mapData);
}


/**
 * 删除地图
 * 
 * @param {string} mapName - 地图名称
 * @returns {Promise<Object>} 删除结果
 */
export async function deleteMap(mapName) {
  const response = await fetch(`/api/maps/${encodeURIComponent(mapName)}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  
  if (!response.ok) {
    throw new Error('Failed to delete map');
  }
  
  return response.json();
}
