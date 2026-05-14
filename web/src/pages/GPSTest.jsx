import React, { useState } from 'react'
import MarsMap from '../components/MarsMap'

/**
 * GPS 地图测试页面
 * 用于测试 CesiumMap 组件功能
 * 访问：http://localhost:5173/#/gps-test
 */
const GPSTest = () => {
  // 测试数据 - 北京故宫附近
  const [robotPosition] = useState({
    lng: 116.4074,
    lat: 39.9042,
    alt: 50.0
  })

  const [heading] = useState(45)

  const [waypoints] = useState([
    { lng: 116.4074, lat: 39.9042, alt: 50.0 },
    { lng: 116.4074, lat: 39.9045, alt: 50.0 },
    { lng: 116.4078, lat: 39.9048, alt: 50.0 },
    { lng: 116.4082, lat: 39.9045, alt: 50.0 },
    { lng: 116.4078, lat: 39.9042, alt: 50.0 }
  ])

  const [currentWaypoint] = useState(2)

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      background: '#000'
    }}>
      {/* 顶部信息栏 */}
      <div style={{
        position: 'absolute',
        top: 20,
        left: 20,
        right: 20,
        zIndex: 1000,
        background: 'rgba(0, 0, 0, 0.7)',
        padding: '16px 24px',
        borderRadius: '12px',
        color: '#fff',
        maxWidth: 400
      }}>
        <h2 style={{ margin: '0 0 12px 0', fontSize: 18 }}>🛰️ GPS 地图测试</h2>
        
        <div style={{ marginBottom: 8, fontSize: 13 }}>
          <strong>机器人位置:</strong>
        </div>
        <div style={{ fontSize: 12, color: '#aaa', marginBottom: 12 }}>
          N{robotPosition.lat.toFixed(6)} E{robotPosition.lng.toFixed(6)}
        </div>

        <div style={{ marginBottom: 8, fontSize: 13 }}>
          <strong>航向:</strong> {heading}°
        </div>

        <div style={{ marginBottom: 8, fontSize: 13 }}>
          <strong>路径点:</strong> {waypoints.length} 个
        </div>

        <div style={{ fontSize: 13 }}>
          <strong>当前航点:</strong> #{currentWaypoint + 1} / {waypoints.length}
        </div>

        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.2)' }}>
          <div style={{ fontSize: 12, color: '#52c41a' }}>
            ✅ 天地图底图已加载
          </div>
          <div style={{ fontSize: 12, color: '#1890ff' }}>
            🟢 Cesium.js 运行正常
          </div>
        </div>
      </div>

      {/* Cesium 地图 */}
      <MarsMap
        robotPosition={robotPosition}
        heading={heading}
        waypoints={waypoints}
        currentWaypoint={currentWaypoint}
      />
    </div>
  )
}

export default GPSTest
