/**
 * 融合地图视图组件 - 带全屏按钮
 * 支持 preview 和 planning 两种模式
 * 
 * 融合地图使用世界坐标 (x, y, z) 存储路径点
 * 内部处理经纬度 → 世界坐标的转换
 */

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Space, Button, Slider } from 'antd'
import { FullscreenOutlined, FullscreenExitOutlined } from '@ant-design/icons'
import FusionMapForManager from './FusionMapForManager'
import * as Cesium from 'cesium'

// 路径点接口 - 使用世界坐标
interface PathPoint {
  id?: string
  x?: number
  y?: number
  z?: number
  lat?: number
  lng?: number
  alt?: number
  waypointType?: 'waypoint' | 'work' | 'charge'
}

interface FusionMapViewProps {
  mapInfo: any
  mode?: 'preview' | 'planning'
  pathPoints?: PathPoint[]
  onPathPointsChange?: (points: PathPoint[]) => void
}

const FusionMapView: React.FC<FusionMapViewProps> = ({
  mapInfo,
  mode = 'preview',
  pathPoints = [],
  onPathPointsChange,
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [overlayOpacity, setOverlayOpacity] = useState(0.7)
  const viewerRef = useRef<any>(null)
  const pathEntitiesRef = useRef<any[]>([])

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }

  // GPS 原点信息
  const gpsOrigin = mapInfo?.gps_origin ? {
    lat: typeof mapInfo.gps_origin.lat === 'string'
      ? parseFloat(mapInfo.gps_origin.lat)
      : mapInfo.gps_origin.lat,
    lng: typeof mapInfo.gps_origin.lng === 'string'
      ? parseFloat(mapInfo.gps_origin.lng)
      : mapInfo.gps_origin.lng,
    alt: mapInfo.gps_origin.alt || 0,
  } : null

  // 经纬度 → 世界坐标转换
  const latLngToWorld = useCallback((lat: number, lng: number, alt: number = 0): { x: number, y: number, z: number } => {
    if (!gpsOrigin) {
      return { x: 0, y: 0, z: alt }
    }
    
    // 地球椭球体参数
    const a = 6378137.0  // 长半轴 (m)
    const f = 1 / 298.257223563  // 扁率
    const b = a * (1 - f)  // 短半轴
    const e2 = (a * a - b * b) / (a * a)  // 第一偏心率的平方
    
    // 计算每度的米数（近似）
    const mPerDegLat = (Math.PI / 180) * (a * (1 - e2)) / Math.pow(1 - e2 * Math.sin(gpsOrigin.lat * Math.PI / 180) ** 2, 1.5)
    const mPerDegLng = (Math.PI / 180) * (a * Math.cos(gpsOrigin.lat * Math.PI / 180)) / Math.sqrt(1 - e2 * Math.sin(gpsOrigin.lat * Math.PI / 180) ** 2)
    
    // 计算相对于原点的偏移
    const x = (lng - gpsOrigin.lng) * mPerDegLng
    const y = (lat - gpsOrigin.lat) * mPerDegLat
    const z = alt - gpsOrigin.alt
    
    return { x, y, z }
  }, [gpsOrigin])

  // 世界坐标 → 经纬度转换
  const worldToLatLng = useCallback((x: number, y: number, z: number = 0): { lat: number, lng: number, alt: number } | null => {
    if (!gpsOrigin) return null
    
    // 地球椭球体参数
    const a = 6378137.0
    const f = 1 / 298.257223563
    const e2 = (a * a - (a * (1 - f)) ** 2) / (a * a)
    
    // 计算每度的米数
    const mPerDegLat = (Math.PI / 180) * (a * (1 - e2)) / Math.pow(1 - e2 * Math.sin(gpsOrigin.lat * Math.PI / 180) ** 2, 1.5)
    const mPerDegLng = (Math.PI / 180) * (a * Math.cos(gpsOrigin.lat * Math.PI / 180)) / Math.sqrt(1 - e2 * Math.sin(gpsOrigin.lat * Math.PI / 180) ** 2)
    
    const lat = gpsOrigin.lat + y / mPerDegLat
    const lng = gpsOrigin.lng + x / mPerDegLng
    const alt = z + gpsOrigin.alt
    
    return { lat, lng, alt }
  }, [gpsOrigin])

  // Viewer 就绪回调
  const handleViewerReady = useCallback((viewer: any) => {
    viewerRef.current = viewer
    console.log('[FusionMapView] Viewer ready', mode)
  }, [mode])

  // 地图点击回调 - planning 模式下添加路径点
  const handleMapClick = useCallback((position: { lat: number; lng: number; alt: number }) => {
    if (mode === 'planning' && onPathPointsChange) {
      // 将经纬度转换为世界坐标
      const world = latLngToWorld(position.lat, position.lng, position.alt)
      
      // 添加新路径点（使用世界坐标）
      const newPoint: PathPoint = {
        id: `wp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        x: world.x,
        y: world.y,
        z: world.z,
        lat: position.lat,  // 同时保留经纬度用于显示
        lng: position.lng,
        alt: position.alt,
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

    // 根据航点类型获取颜色
    const getWaypointColor = (waypointType?: 'waypoint' | 'work' | 'charge', index?: number, total?: number) => {
      if (index === 0) return Cesium.Color.GREEN // 起点
      if (index === (total || 0) - 1) return Cesium.Color.RED // 终点
      if (waypointType === 'work') return Cesium.Color.ORANGE
      if (waypointType === 'charge') return Cesium.Color.LIME
      return Cesium.Color.BLUE
    }

    // 添加路径点实体
    pathPoints.forEach((point, index) => {
      let cartesian: Cesium.Cartesian3 | null = null
      
      if (point.lat !== undefined && point.lng !== undefined) {
        // 使用经纬度
        cartesian = Cesium.Cartesian3.fromDegrees(point.lng, point.lat, point.alt || 0)
      } else if (point.x !== undefined && point.y !== undefined) {
        // 使用世界坐标，转换为经纬度
        const latLng = worldToLatLng(point.x, point.y, point.z || 0)
        if (latLng) {
          cartesian = Cesium.Cartesian3.fromDegrees(latLng.lng, latLng.lat, latLng.alt)
        }
      }
      
      if (cartesian) {
        const entity = viewer.entities.add({
          position: cartesian,
          point: {
            pixelSize: 10,
            color: getWaypointColor(point.waypointType, index, pathPoints.length),
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
      }
    })

    // 添加路径连线
    if (pathPoints.length > 1) {
      const positions: Cesium.Cartesian3[] = []
      
      pathPoints.forEach(p => {
        let cartesian: Cesium.Cartesian3 | null = null
        
        if (p.lat !== undefined && p.lng !== undefined) {
          cartesian = Cesium.Cartesian3.fromDegrees(p.lng, p.lat, p.alt || 0)
        } else if (p.x !== undefined && p.y !== undefined) {
          const latLng = worldToLatLng(p.x, p.y, p.z || 0)
          if (latLng) {
            cartesian = Cesium.Cartesian3.fromDegrees(latLng.lng, latLng.lat, latLng.alt)
          }
        }
        
        if (cartesian) {
          positions.push(cartesian)
        }
      })
      
      if (positions.length > 1) {
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
    }
  }, [pathPoints, worldToLatLng])

  // 清理实体
  useEffect(() => {
    return () => {
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        pathEntitiesRef.current.forEach(entity => viewerRef.current.entities.remove(entity))
        pathEntitiesRef.current = []
        viewerRef.current.entities.removeAll()
      }
    }
  }, [])

  // 没有 GPS 原点信息时显示错误
  if (!mapInfo?.gps_origin) {
    return (
      <div style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#fff1f0',
        border: '1px solid #ffa39e',
        borderRadius: 8,
      }}>
        <div style={{ textAlign: 'center', color: '#cf1322' }}>
          <div style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 8 }}>
            ⚠️ 该地图未设置 GPS 坐标
          </div>
          <div style={{ fontSize: 12, color: '#cf1322' }}>
            融合地图需要 GPS 坐标才能显示
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        padding: '8px 12px',
        background: '#fafafa',
        borderBottom: '1px solid #f0f0f0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <Space size={8}>
          <span style={{ fontSize: 12, color: '#666' }}>
            融合地图{mode === 'planning' ? '（路径规划）' : '预览'}
          </span>
          <span style={{ fontSize: 11, color: '#999' }}>
            原点：{gpsOrigin?.lat.toFixed(6)}, {gpsOrigin?.lng.toFixed(6)}
          </span>
        </Space>
        <Space size={8}>
          <span style={{ fontSize: 11, color: '#999' }}>PCD 透明度</span>
          <Slider
            value={overlayOpacity}
            onChange={setOverlayOpacity}
            min={0}
            max={1}
            step={0.1}
            style={{ width: 100 }}
          />
          <Button
            type="primary"
            size="small"
            icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
            onClick={toggleFullscreen}
          >
            {isFullscreen ? '退出全屏' : '全屏'}
          </Button>
        </Space>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <FusionMapForManager
          mapInfo={mapInfo}
          overlayOpacity={overlayOpacity}
          mode={mode}
          onViewerReady={handleViewerReady}
          onMapClick={handleMapClick}
        />
      </div>

      <div style={{
        padding: '6px 12px',
        background: '#fafafa',
        borderTop: '1px solid #f0f0f0',
        fontSize: 11,
        color: '#999',
      }}>
        🖱️ 左键旋转 | Ctrl+ 左键平移 | 滚轮缩放 | 滑块调节 PCD 透明度
        {mode === 'planning' && ' | 点击地图添加路径点（世界坐标）'}
      </div>
    </div>
  )
}

export default FusionMapView
