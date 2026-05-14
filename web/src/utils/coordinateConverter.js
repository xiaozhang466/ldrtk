/**
 * 坐标转换工具类
 * 
 * 支持 WGS84 ↔ UTM ↔ 本地坐标 双向转换
 * 
 * @module utils/coordinateConverter
 */

import proj4 from 'proj4';

// 定义坐标系
const WGS84 = '+proj=longlat +datum=WGS84 +no_defs';
const UTM_ZONE_51N = '+proj=utm +zone=51 +ellps=WGS84 +datum=WGS84 +units=m +no_defs';

/**
 * WGS84 经纬度转 UTM 坐标
 * 
 * @param {number} lat - 纬度 (WGS84)
 * @param {number} lon - 经度 (WGS84)
 * @returns {[number, number]} [utmX, utmY] UTM 坐标 (米)
 * 
 * @example
 * const [utmX, utmY] = wgs84ToUtm(31.2304, 121.4737);
 */
export function wgs84ToUtm(lat, lon) {
  const [utmX, utmY] = proj4(WGS84, UTM_ZONE_51N, [lon, lat]);
  return [utmX, utmY];
}

/**
 * UTM 坐标转 WGS84 经纬度
 * 
 * @param {number} utmX - UTM X 坐标 (米)
 * @param {number} utmY - UTM Y 坐标 (米)
 * @returns {[number, number]} [lat, lon] WGS84 经纬度
 * 
 * @example
 * const [lat, lon] = utmToWgs84(447000, 3455000);
 */
export function utmToWgs84(utmX, utmY) {
  const [lon, lat] = proj4(UTM_ZONE_51N, WGS84, [utmX, utmY]);
  return [lat, lon];
}

/**
 * UTM 坐标转本地坐标
 * 
 * @param {number} utmX - UTM X 坐标 (米)
 * @param {number} utmY - UTM Y 坐标 (米)
 * @param {Object} origin - 本地坐标原点的 UTM 坐标
 * @param {number} origin.utmX - 原点 UTM X 坐标
 * @param {number} origin.utmY - 原点 UTM Y 坐标
 * @param {number} [origin.yaw=0] - 原点朝向偏角 (弧度)，默认为 0
 * @returns {[number, number]} [localX, localY] 本地坐标 (米)
 * 
 * @example
 * const [localX, localY] = utmToLocal(447100, 3455100, { utmX: 447000, utmY: 3455000 });
 */
export function utmToLocal(utmX, utmY, origin) {
  const { utmX: originX, utmY: originY, yaw = 0 } = origin;
  
  // 平移
  let dx = utmX - originX;
  let dy = utmY - originY;
  
  // 旋转 (如果原点有朝向偏角)
  if (yaw !== 0) {
    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);
    const rotatedX = dx * cosYaw - dy * sinYaw;
    const rotatedY = dx * sinYaw + dy * cosYaw;
    dx = rotatedX;
    dy = rotatedY;
  }
  
  return [dx, dy];
}

/**
 * 本地坐标转 UTM 坐标
 * 
 * @param {number} localX - 本地 X 坐标 (米)
 * @param {number} localY - 本地 Y 坐标 (米)
 * @param {Object} origin - 本地坐标原点的 UTM 坐标
 * @param {number} origin.utmX - 原点 UTM X 坐标
 * @param {number} origin.utmY - 原点 UTM Y 坐标
 * @param {number} [origin.yaw=0] - 原点朝向偏角 (弧度)，默认为 0
 * @returns {[number, number]} [utmX, utmY] UTM 坐标 (米)
 * 
 * @example
 * const [utmX, utmY] = localToUtm(100, 100, { utmX: 447000, utmY: 3455000 });
 */
export function localToUtm(localX, localY, origin) {
  const { utmX: originX, utmY: originY, yaw = 0 } = origin;
  
  let dx = localX;
  let dy = localY;
  
  // 反向旋转
  if (yaw !== 0) {
    const cosYaw = Math.cos(-yaw);
    const sinYaw = Math.sin(-yaw);
    const rotatedX = dx * cosYaw - dy * sinYaw;
    const rotatedY = dx * sinYaw + dy * cosYaw;
    dx = rotatedX;
    dy = rotatedY;
  }
  
  const utmX = originX + dx;
  const utmY = originY + dy;
  
  return [utmX, utmY];
}

/**
 * WGS84 经纬度转本地坐标
 * 
 * @param {number} lat - 纬度 (WGS84)
 * @param {number} lon - 经度 (WGS84)
 * @param {Object} origin - 本地坐标原点的 WGS84 坐标
 * @param {number} origin.lat - 原点纬度
 * @param {number} origin.lon - 原点经度
 * @param {number} [origin.yaw=0] - 原点朝向偏角 (弧度)，默认为 0
 * @returns {[number, number]} [localX, localY] 本地坐标 (米)
 */
export function wgs84ToLocal(lat, lon, origin) {
  const [originUtmX, originUtmY] = wgs84ToUtm(origin.lat, origin.lon);
  const [currentUtmX, currentUtmY] = wgs84ToUtm(lat, lon);
  
  return utmToLocal(currentUtmX, currentUtmY, {
    utmX: originUtmX,
    utmY: originUtmY,
    yaw: origin.yaw || 0
  });
}

/**
 * 本地坐标转 WGS84 经纬度
 * 
 * @param {number} localX - 本地 X 坐标 (米)
 * @param {number} localY - 本地 Y 坐标 (米)
 * @param {Object} origin - 本地坐标原点的 WGS84 坐标
 * @param {number} origin.lat - 原点纬度
 * @param {number} origin.lon - 原点经度
 * @param {number} [origin.yaw=0] - 原点朝向偏角 (弧度)，默认为 0
 * @returns {[number, number]} [lat, lon] WGS84 经纬度
 */
export function localToWgs84(localX, localY, origin) {
  const [originUtmX, originUtmY] = wgs84ToUtm(origin.lat, origin.lon);
  const [currentUtmX, currentUtmY] = utmToLocal(localX, localY, {
    utmX: originUtmX,
    utmY: originUtmY,
    yaw: origin.yaw || 0
  });
  
  return utmToWgs84(currentUtmX, currentUtmY);
}

/**
 * 计算两点之间的距离 (米)
 * 
 * @param {Object} point1 - 点 1 坐标
 * @param {number} point1.x - X 坐标
 * @param {number} point1.y - Y 坐标
 * @param {Object} point2 - 点 2 坐标
 * @param {number} point2.x - X 坐标
 * @param {number} point2.y - Y 坐标
 * @returns {number} 距离 (米)
 */
export function distance(point1, point2) {
  const dx = point2.x - point1.x;
  const dy = point2.y - point1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * 计算方位角 (弧度)
 * 
 * @param {Object} point1 - 起点坐标
 * @param {number} point1.x - X 坐标
 * @param {number} point1.y - Y 坐标
 * @param {Object} point2 - 终点坐标
 * @param {number} point2.x - X 坐标
 * @param {number} point2.y - Y 坐标
 * @returns {number} 方位角 (弧度)，从正北方向顺时针
 */
export function bearing(point1, point2) {
  const dx = point2.x - point1.x;
  const dy = point2.y - point1.y;
  return Math.atan2(dx, dy);
}
