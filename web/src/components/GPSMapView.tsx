/**
 * GPS 地图视图组件 - 带全屏按钮
 * 支持 preview 和 planning 两种模式
 */

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Space, Button } from 'antd'
import { FullscreenOutlined, FullscreenExitOutlined } from '@ant-design/icons'
import MarsMapForManager from './MarsMapForManager'
import * as Cesium from 'cesium'

// 路径点类型（支持 GPS 坐标和世界坐标）
export interface GPSPathPoint {
  id: string
  lat: number
  lng: number
  alt?: number
  x?: number  // 世界坐标 X (ENU 米)
  y?: number  // 世界坐标 Y (ENU 米)
  z?: number  // 世界坐标 Z (ENU 米)
  waypointType?: 'waypoint' | 'work' | 'charge'
}

interface GPSMapViewProps {
  mapInfo: any
  mode?: 'preview' | 'planning'
  pathPoints?: GPSPathPoint[]
  onPathPointsChange?: (points: GPSPathPoint[]) => void
  robotPosition?: { lat?: number; lng?: number; heading?: number }
  currentWaypointIdx?: number
  emptyMessage?: string
}

const GPSMapView: React.FC<GPSMapViewProps> = ({
  mapInfo,
  mode = 'preview',
  pathPoints = [],
  onPathPointsChange,
  robotPosition = {},
  currentWaypointIdx = -1,
  emptyMessage,
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const viewerRef = useRef<any>(null)
  const pathEntitiesRef = useRef<any[]>([])
  const vehicleEntityRef = useRef<any>(null)
  const headingLineRef = useRef<any>(null)

  const gpsOrigin = mapInfo?.gps_origin
    ? {
        lat: typeof mapInfo.gps_origin.lat === 'string'
          ? parseFloat(mapInfo.gps_origin.lat)
          : mapInfo.gps_origin.lat,
        lng: typeof mapInfo.gps_origin.lng === 'string'
          ? parseFloat(mapInfo.gps_origin.lng)
          : mapInfo.gps_origin.lng,
        alt: mapInfo.gps_origin.alt || 0,
      }
    : null

  // 经纬度转世界坐标 (ENU 米) - 与 FusionMapView 保持一致
  const latLngToWorld = useCallback((lat: number, lng: number, alt: number = 0): { x: number, y: number, z: number } => {
    if (!gpsOrigin) {
      return { x: 0, y: 0, z: 0 }
    }
    
    // WGS84 椭球参数
    const a = 6378137.0  // 半长轴 (m)
    const e2 = 0.00669437999014  // 第一偏心率的平方
    
    // 计算每度的距离
    const mPerDegLat = (Math.PI / 180) * (a * (1 - e2)) / Math.pow(1 - e2 * Math.sin(gpsOrigin.lat * Math.PI / 180) ** 2, 1.5)
    const mPerDegLng = (Math.PI / 180) * (a * Math.cos(gpsOrigin.lat * Math.PI / 180)) / Math.sqrt(1 - e2 * Math.sin(gpsOrigin.lat * Math.PI / 180) ** 2)
    
    // 计算相对于原点的偏移
    const x = (lng - gpsOrigin.lng) * mPerDegLng
    const y = (lat - gpsOrigin.lat) * mPerDegLat
    const z = alt - gpsOrigin.alt
    
    return { x, y, z }
  }, [gpsOrigin])

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }

  // Viewer 就绪回调
  const handleViewerReady = useCallback((viewer: any) => {
    viewerRef.current = viewer
    console.log('[GPSMapView] Viewer ready', mode)
  }, [mode])

  // 地图点击回调 - planning 模式下添加路径点
  const handleMapClick = useCallback((position: { lat: number; lng: number; alt: number }) => {
    if (mode === 'planning' && onPathPointsChange) {
      // 计算世界坐标 (ENU 米)
      const world = latLngToWorld(position.lat, position.lng, position.alt)
      
      // 添加新路径点（同时包含 GPS 坐标和世界坐标）
      const newPoint: GPSPathPoint = {
        id: `wp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        lat: position.lat,
        lng: position.lng,
        alt: position.alt,
        x: world.x,
        y: world.y,
        z: world.z,
        waypointType: 'waypoint',
      }
      onPathPointsChange([...pathPoints, newPoint])
    }
  }, [mode, onPathPointsChange, pathPoints, latLngToWorld])

  // 渲染路径点
  useEffect(() => {
    if (!viewerRef.current || viewerRef.current.isDestroyed()) return

    const viewer = viewerRef.current

    // 清除旧的路径实体
    pathEntitiesRef.current.forEach(entity => viewer.entities.remove(entity))
    pathEntitiesRef.current = []

    if (pathPoints.length === 0) return

    // 根据航点类型和访问状态获取颜色
    const getWaypointColor = (waypointType?: 'waypoint' | 'work' | 'charge', index?: number, total?: number, visited?: boolean, current?: boolean) => {
      if (current) return Cesium.Color.RED // 当前航点
      if (visited) return Cesium.Color.GREEN // 已访问
      if (index === 0) return Cesium.Color.GREEN // 起点（未访问）
      if (index === (total || 0) - 1) return Cesium.Color.RED // 终点
      if (waypointType === 'work') return Cesium.Color.ORANGE
      if (waypointType === 'charge') return Cesium.Color.LIME
      return Cesium.Color.CYAN // 未访问的普通航点
    }

    // 添加路径点实体
    pathPoints.forEach((point, index) => {
      const visited = index <= currentWaypointIdx
      const current = index === currentWaypointIdx
      const entity = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(point.lng, point.lat, point.alt || 0),
        point: {
          pixelSize: current ? 14 : 10,
          color: getWaypointColor(point.waypointType, index, pathPoints.length, visited, current),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
        },
        label: {
          text: `${index + 1}`,
          font: 'bold 14pt monospace',
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          outlineWidth: 2,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -15),
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
        },
      })
      pathEntitiesRef.current.push(entity)
    })

    // 添加路径连线
    if (pathPoints.length > 1) {
      const positions = pathPoints.map(p => Cesium.Cartesian3.fromDegrees(p.lng, p.lat, p.alt || 0))
      const pathEntity = viewer.entities.add({
        polyline: {
          positions,
          width: 3,
          material: new Cesium.PolylineDashMaterialProperty({
            color: Cesium.Color.CYAN.withAlpha(0.8),
          }),
        },
      })
      pathEntitiesRef.current.push(pathEntity)
    }
  }, [pathPoints, currentWaypointIdx])

  // 渲染车辆箭头
  useEffect(() => {
    if (!viewerRef.current || viewerRef.current.isDestroyed()) return
    if (!robotPosition?.lat || !robotPosition?.lng) return
    if (robotPosition.lat === 0 && robotPosition.lng === 0) return

    const viewer = viewerRef.current

    try {
      // 如果车辆实体已存在，更新位置和航向
      if (vehicleEntityRef.current) {
        vehicleEntityRef.current.position = Cesium.Cartesian3.fromDegrees(
          robotPosition.lng,
          robotPosition.lat,
          (robotPosition as any).alt || 0
        )
        // 更新箭头方向
        if (vehicleEntityRef.current.billboard && robotPosition.heading !== undefined) {
          vehicleEntityRef.current.billboard.rotation = -(robotPosition.heading || 0) * Math.PI / 180
        }
        return
      }

      // 创建车辆箭头实体 - 箭头朝上（北）的图标
      const canvas = document.createElement('canvas')
      canvas.width = 32
      canvas.height = 32
      const ctx = canvas.getContext('2d')
      if (ctx) {
        // 红色箭头朝上（北）
        ctx.fillStyle = '#ff4444'
        ctx.beginPath()
        ctx.moveTo(16, 2)   // 箭头顶部
        ctx.lineTo(28, 28)  // 右下角
        ctx.lineTo(16, 20)  // 箭头底部凹口
        ctx.lineTo(4, 28)   // 左下角
        ctx.closePath()
        ctx.fill()
        // 白色边框
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 2
        ctx.stroke()
        // 中心点
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        ctx.arc(16, 16, 3, 0, Math.PI * 2)
        ctx.fill()
      }
      const vehicleImg = canvas.toDataURL()

      // 根据航向设置箭头旋转角度
      const rotation = -(robotPosition.heading || 0) * Math.PI / 180

      vehicleEntityRef.current = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(
          robotPosition.lng,
          robotPosition.lat,
          (robotPosition as any).alt || 0
        ),
        billboard: {
          image: vehicleImg,
          width: 40,
          height: 40,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          rotation: rotation,
          rotation_ALIGNED_TO_SCREEN: false,
        },
      })
    } catch (err) {
      console.error('[GPSMapView] Vehicle entity error:', err)
    }
  }, [robotPosition])

  // 清理实体
  useEffect(() => {
    return () => {
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        pathEntitiesRef.current.forEach(entity => viewerRef.current.entities.remove(entity))
        pathEntitiesRef.current = []
        if (vehicleEntityRef.current) {
          viewerRef.current.entities.remove(vehicleEntityRef.current)
          vehicleEntityRef.current = null
        }
        if (headingLineRef.current) {
          viewerRef.current.entities.remove(headingLineRef.current)
          headingLineRef.current = null
        }
        viewerRef.current.entities.removeAll()
      }
    }
  }, [])

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} className="gps-map-container">
      <style>{`
        .gps-map-container .cesium-credit-logoContainer,
        .gps-map-container .cesium-credit-textContainer {
          display: none !important;
        }
      `}</style>
      <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 1000 }}>
        <Button
          type="primary"
          size="small"
          icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
          onClick={toggleFullscreen}
        />
      </div>
      <MarsMapForManager
        gpsOrigin={gpsOrigin}
        mode={mode}
        onViewerReady={handleViewerReady}
        onMapClick={handleMapClick}
      />
      {!gpsOrigin && (
        <div style={{
          position: 'absolute',
          left: '50%',
          bottom: 24,
          transform: 'translateX(-50%)',
          zIndex: 1000,
          maxWidth: 520,
          padding: '10px 16px',
          color: '#fff',
          background: 'rgba(0, 0, 0, 0.58)',
          borderRadius: 6,
          fontSize: 14,
          textAlign: 'center',
          pointerEvents: 'none',
        }}>
          {emptyMessage || '当前仅显示在线天地图底图；请先配置地图原点后显示路径'}
        </div>
      )}
    </div>
  )
}

export default GPSMapView
