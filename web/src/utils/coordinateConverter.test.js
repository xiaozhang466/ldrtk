/**
 * coordinateConverter 单元测试
 */

import {
  wgs84ToUtm,
  utmToWgs84,
  utmToLocal,
  localToUtm,
  wgs84ToLocal,
  localToWgs84,
  distance,
  bearing
} from './coordinateConverter';

describe('coordinateConverter', () => {
  // 思谷果园测试坐标 (上海附近)
  const TEST_WGS84 = { lat: 31.2304, lon: 121.4737 };
  const TEST_ORIGIN = { lat: 31.2300, lon: 121.4700 };
  
  describe('wgs84ToUtm', () => {
    test('应该正确转换 WGS84 到 UTM', () => {
      const [utmX, utmY] = wgs84ToUtm(TEST_WGS84.lat, TEST_WGS84.lon);
      
      // UTM 51N 的期望值范围
      expect(utmX).toBeGreaterThan(400000);
      expect(utmX).toBeLessThan(500000);
      expect(utmY).toBeGreaterThan(3400000);
      expect(utmY).toBeLessThan(3500000);
    });
    
    test('转换精度应该小于 3cm', () => {
      const [utmX, utmY] = wgs84ToUtm(TEST_WGS84.lat, TEST_WGS84.lon);
      const [lat, lon] = utmToWgs84(utmX, utmY);
      
      const latDiff = Math.abs(lat - TEST_WGS84.lat);
      const lonDiff = Math.abs(lon - TEST_WGS84.lon);
      
      // 1 度约等于 111km，0.0000003 度约等于 3cm
      expect(latDiff).toBeLessThan(0.0000003);
      expect(lonDiff).toBeLessThan(0.0000003);
    });
  });
  
  describe('utmToWgs84', () => {
    test('应该正确转换 UTM 到 WGS84', () => {
      const [utmX, utmY] = wgs84ToUtm(TEST_WGS84.lat, TEST_WGS84.lon);
      const [lat, lon] = utmToWgs84(utmX, utmY);
      
      expect(lat).toBeCloseTo(TEST_WGS84.lat, 5);
      expect(lon).toBeCloseTo(TEST_WGS84.lon, 5);
    });
  });
  
  describe('utmToLocal', () => {
    test('应该正确转换 UTM 到本地坐标', () => {
      const [originUtmX, originUtmY] = wgs84ToUtm(TEST_ORIGIN.lat, TEST_ORIGIN.lon);
      const [currentUtmX, currentUtmY] = wgs84ToUtm(TEST_WGS84.lat, TEST_WGS84.lon);
      
      const [localX, localY] = utmToLocal(currentUtmX, currentUtmY, {
        utmX: originUtmX,
        utmY: originUtmY
      });
      
      // 本地坐标应该是相对于原点的偏移
      expect(localX).toBeCloseTo(currentUtmX - originUtmX, 0);
      expect(localY).toBeCloseTo(currentUtmY - originUtmY, 0);
    });
    
    test('原点应该是 (0, 0)', () => {
      const [originUtmX, originUtmY] = wgs84ToUtm(TEST_ORIGIN.lat, TEST_ORIGIN.lon);
      
      const [localX, localY] = utmToLocal(originUtmX, originUtmY, {
        utmX: originUtmX,
        utmY: originUtmY
      });
      
      expect(localX).toBeCloseTo(0, 5);
      expect(localY).toBeCloseTo(0, 5);
    });
  });
  
  describe('localToUtm', () => {
    test('应该正确转换本地坐标到 UTM', () => {
      const [originUtmX, originUtmY] = wgs84ToUtm(TEST_ORIGIN.lat, TEST_ORIGIN.lon);
      
      const [utmX, utmY] = localToUtm(100, 100, {
        utmX: originUtmX,
        utmY: originUtmY
      });
      
      expect(utmX).toBeCloseTo(originUtmX + 100, 0);
      expect(utmY).toBeCloseTo(originUtmY + 100, 0);
    });
    
    test('应该与 utmToLocal 互为逆运算', () => {
      const [originUtmX, originUtmY] = wgs84ToUtm(TEST_ORIGIN.lat, TEST_ORIGIN.lon);
      const testLocalX = 150;
      const testLocalY = 200;
      
      const [utmX, utmY] = localToUtm(testLocalX, testLocalY, {
        utmX: originUtmX,
        utmY: originUtmY
      });
      
      const [localX, localY] = utmToLocal(utmX, utmY, {
        utmX: originUtmX,
        utmY: originUtmY
      });
      
      expect(localX).toBeCloseTo(testLocalX, 5);
      expect(localY).toBeCloseTo(testLocalY, 5);
    });
  });
  
  describe('wgs84ToLocal', () => {
    test('应该正确转换 WGS84 到本地坐标', () => {
      const [localX, localY] = wgs84ToLocal(
        TEST_WGS84.lat,
        TEST_WGS84.lon,
        TEST_ORIGIN
      );
      
      // 应该是正数 (在Origin 的东北方向)
      expect(localX).toBeGreaterThan(0);
      expect(localY).toBeGreaterThan(0);
    });
  });
  
  describe('localToWgs84', () => {
    test('应该正确转换本地坐标到 WGS84', () => {
      const [localX, localY] = wgs84ToLocal(
        TEST_WGS84.lat,
        TEST_WGS84.lon,
        TEST_ORIGIN
      );
      
      const [lat, lon] = localToWgs84(localX, localY, TEST_ORIGIN);
      
      expect(lat).toBeCloseTo(TEST_WGS84.lat, 5);
      expect(lon).toBeCloseTo(TEST_WGS84.lon, 5);
    });
  });
  
  describe('distance', () => {
    test('应该正确计算两点距离', () => {
      const point1 = { x: 0, y: 0 };
      const point2 = { x: 3, y: 4 };
      
      const dist = distance(point1, point2);
      
      expect(dist).toBe(5);
    });
    
    test('同一点距离应该是 0', () => {
      const point = { x: 100, y: 200 };
      const dist = distance(point, point);
      
      expect(dist).toBe(0);
    });
  });
  
  describe('bearing', () => {
    test('应该正确计算方位角', () => {
      const point1 = { x: 0, y: 0 };
      const point2 = { x: 0, y: 100 }; // 正北方向
      
      const angle = bearing(point1, point2);
      
      expect(angle).toBeCloseTo(0, 5); // 正北方向为 0 弧度
    });
    
    test('正东方向应该是 PI/2', () => {
      const point1 = { x: 0, y: 0 };
      const point2 = { x: 100, y: 0 }; // 正东方向
      
      const angle = bearing(point1, point2);
      
      expect(angle).toBeCloseTo(Math.PI / 2, 5);
    });
  });
  
  describe('集成测试', () => {
    test('完整的坐标转换链应该保持精度', () => {
      // WGS84 → UTM → Local → UTM → WGS84
      const [utmX, utmY] = wgs84ToUtm(TEST_WGS84.lat, TEST_WGS84.lon);
      const [originUtmX, originUtmY] = wgs84ToUtm(TEST_ORIGIN.lat, TEST_ORIGIN.lon);
      
      const [localX, localY] = utmToLocal(utmX, utmY, {
        utmX: originUtmX,
        utmY: originUtmY
      });
      
      const [newUtmX, newUtmY] = localToUtm(localX, localY, {
        utmX: originUtmX,
        utmY: originUtmY
      });
      
      const [newLat, newLon] = utmToWgs84(newUtmX, newUtmY);
      
      expect(newLat).toBeCloseTo(TEST_WGS84.lat, 5);
      expect(newLon).toBeCloseTo(TEST_WGS84.lon, 5);
    });
  });
});
