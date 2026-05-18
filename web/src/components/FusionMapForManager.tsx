/**
 * FusionMapForManager - 融合地图预览组件
 * Cesium 天地图 + PCD 栅格化叠加
 */

import React, { useEffect, useMemo, useRef } from 'react'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { TIANDITU_PROXY } from '../config'
import { API_BASE } from '../config'

interface FusionMapForManagerProps {
  mapInfo: any
  overlayOpacity?: number
  showPcdOverlay?: boolean
  mode?: 'preview' | 'planning'
  onViewerReady?: (viewer: any) => void
  onMapClick?: (position: { lat: number; lng: number; alt: number }) => void
}

const toNumber = (value: unknown): number | null => {
  const parsed = typeof value === 'string' ? parseFloat(value) : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const getGpsOrigin = (mapInfo: any) => {
  const origin = mapInfo?.gps_origin
  if (!origin) return null
  const lat = toNumber(origin.lat ?? origin.latitude)
  const lng = toNumber(origin.lng ?? origin.lon ?? origin.longitude)
  const alt = toNumber(origin.alt ?? origin.altitude) ?? 0
  if (lat === null || lng === null) return null
  return { lat, lng, alt }
}

const getPcdOverlayRectangle = (mapInfo: any) => {
  const files = Array.isArray(mapInfo?.files) ? mapInfo.files : []
  const hasMapImage = files.some((file: any) => file?.name === 'map.png' || file?.path === 'map.png')
  const bounds = mapInfo?.local_bounds || mapInfo?.gps_bounds || mapInfo?.geo_bounds
  if (!hasMapImage || !bounds) return null

  const west = toNumber(bounds.west)
  const south = toNumber(bounds.south)
  const east = toNumber(bounds.east)
  const north = toNumber(bounds.north)
  if ([west, south, east, north].some((value) => value === null)) return null
  if (!(west! >= -180 && east! <= 180 && south! >= -90 && north! <= 90)) return null
  if (!(east! > west! && north! > south!)) return null
  return Cesium.Rectangle.fromDegrees(west!, south!, east!, north!)
}

const getPcdOverlayKey = (mapInfo: any, showPcdOverlay: boolean) => {
  if (!showPcdOverlay) return 'off'
  const files = Array.isArray(mapInfo?.files) ? mapInfo.files : []
  const hasMapImage = files.some((file: any) => file?.name === 'map.png' || file?.path === 'map.png')
  const bounds = mapInfo?.local_bounds || mapInfo?.gps_bounds || mapInfo?.geo_bounds
  if (!hasMapImage || !bounds) return 'none'

  const west = toNumber(bounds.west)
  const south = toNumber(bounds.south)
  const east = toNumber(bounds.east)
  const north = toNumber(bounds.north)
  return [west, south, east, north].every((value) => value !== null)
    ? `${west},${south},${east},${north}`
    : 'none'
}

const FusionMapForManager: React.FC<FusionMapForManagerProps> = ({
  mapInfo,
  overlayOpacity = 0.7,
  showPcdOverlay = true,
  mode = 'preview',
  onViewerReady,
  onMapClick,
}) => {
  const viewerContainerRef = useRef(null)
  const viewerRef = useRef(null)
  const initializedRef = useRef(false)
  const pcdLayerRef = useRef(null)
  const onViewerReadyRef = useRef(onViewerReady)
  const onMapClickRef = useRef(onMapClick)
  const gpsOrigin = getGpsOrigin(mapInfo)
  const gpsOriginKey = gpsOrigin ? `${gpsOrigin.lat},${gpsOrigin.lng},${gpsOrigin.alt}` : 'none'
  const pcdOverlayKey = useMemo(
    () => getPcdOverlayKey(mapInfo, showPcdOverlay),
    [mapInfo?.files, mapInfo?.local_bounds, mapInfo?.gps_bounds, mapInfo?.geo_bounds, showPcdOverlay]
  )

  useEffect(() => {
    onViewerReadyRef.current = onViewerReady
  }, [onViewerReady])

  useEffect(() => {
    onMapClickRef.current = onMapClick
  }, [onMapClick])

  useEffect(() => {
    if (initializedRef.current) return
    if (!viewerContainerRef.current) return

    initializedRef.current = true
    const container = viewerContainerRef.current

    try {
      const viewer = new Cesium.Viewer(container, {
        animation: false,
        timeline: false,
        baseLayerPicker: false,
        geocoder: false,
        homeButton: false,
        infoBox: false,
        sceneModePicker: false,
        selectionIndicator: false,
        navigationHelpButton: false,
        fullscreenButton: false,
        vrButton: false,
        creditsContainer: false,
        imageryProvider: undefined,
        terrainProvider: undefined,
        useBrowserRecommendedResolution: false,
        contextOptions: {
          webgl: {
            alpha: false,
            depth: true,
            stencil: false,
            antialias: false,
            preserveDrawingBuffer: false,
          },
        },
      })

      viewerRef.current = viewer

      // 移除默认图层
      viewer.imageryLayers.removeAll()

      // 添加天地图底图
      const imgProvider = new Cesium.WebMapTileServiceImageryProvider({
        url: `${TIANDITU_PROXY}/img_w/{TileMatrix}/{TileCol}/{TileRow}`,
        layer: 'img',
        style: 'default',
        format: 'image/jpeg',
        tileMatrixSetID: 'w',
        tileMatrixLabels: ['0','1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','17','18'],
        maximumLevel: 18,
        minimumLevel: 1,
        tilingScheme: new Cesium.WebMercatorTilingScheme(),
      })
      viewer.imageryLayers.addImageryProvider(imgProvider)

      // 添加天地图注记
      const ciaProvider = new Cesium.WebMapTileServiceImageryProvider({
        url: `${TIANDITU_PROXY}/cva_w/{TileMatrix}/{TileCol}/{TileRow}`,
        layer: 'cva',
        style: 'default',
        format: 'image/png',
        tileMatrixSetID: 'w',
        tileMatrixLabels: ['0','1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','17','18'],
        maximumLevel: 18,
        minimumLevel: 1,
        tilingScheme: new Cesium.WebMercatorTilingScheme(),
      })
      viewer.imageryLayers.addImageryProvider(ciaProvider)

      // 添加 PCD 栅格化图层（map.png）
      const pcdRectangle = showPcdOverlay ? getPcdOverlayRectangle(mapInfo) : null
      if (pcdRectangle && mapInfo.name) {
        const pcdUrl = `${API_BASE}/maps/${encodeURIComponent(mapInfo.name)}/map.png`
        const pcdProvider = new Cesium.SingleTileImageryProvider({
          url: pcdUrl,
          rectangle: pcdRectangle,
        })
        pcdLayerRef.current = viewer.imageryLayers.addImageryProvider(pcdProvider)
        pcdLayerRef.current.alpha = overlayOpacity
      }

      // 优化性能
      const scene = viewer.scene
      scene.globe.enableLighting = false
      scene.fog.enabled = false
      scene.skyAtmosphere.show = false
      scene.sun.show = false
      scene.moon.show = false
      scene.skyBox.show = false
      scene.highDynamicRange = false

      // 定位到地图中心
      if (gpsOrigin) {
        viewer.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(gpsOrigin.lng, gpsOrigin.lat, 1200),
          orientation: {
            heading: 0,
            pitch: Cesium.Math.toRadians(-90),
            roll: 0,
          },
        })
      }

      onViewerReadyRef.current?.(viewer)

      // 规划模式下启用点击事件
      if (mode === 'planning' && onMapClick) {
        viewer.screenSpaceEventHandler.setInputAction((event) => {
          const ray = viewer.camera.getPickRay(event.position)
          if (!ray) return
          const cartesian = viewer.scene.globe.pick(ray, viewer.scene)
          if (!cartesian) return
          const cartographic = Cesium.Cartographic.fromCartesian(cartesian)
          const lat = Cesium.Math.toDegrees(cartographic.latitude)
          const lng = Cesium.Math.toDegrees(cartographic.longitude)
          const alt = cartographic.height
          onMapClickRef.current?.({ lat, lng, alt })
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK)
      }

      // 延迟渲染
      setTimeout(() => {
        if (!viewer.isDestroyed()) {
          viewer.scene.render()
        }
      }, 500)

    } catch (error) {
      console.error('❌ FusionMap 初始化失败:', error)
      initializedRef.current = false
    }

    return () => {
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.destroy()
        viewerRef.current = null
      }
      initializedRef.current = false
    }
  }, [mapInfo?.name, gpsOriginKey, pcdOverlayKey, showPcdOverlay, mode])

  useEffect(() => {
    if (pcdLayerRef.current) {
      pcdLayerRef.current.alpha = overlayOpacity
    }
  }, [overlayOpacity])

  return (
    <div
      ref={viewerContainerRef}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: '#000',
      }}
    />
  )
}

export default FusionMapForManager
