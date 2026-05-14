/**
 * FusionMapForManager - 融合地图预览组件
 * Cesium 天地图 + PCD 栅格化叠加
 */

import React, { useEffect, useRef } from 'react'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { TIANDITU_PROXY } from '../config'
import { API_BASE } from '../config'

interface FusionMapForManagerProps {
  mapInfo: any
  overlayOpacity?: number
  mode?: 'preview' | 'planning'
  onViewerReady?: (viewer: any) => void
  onMapClick?: (position: { lat: number; lng: number; alt: number }) => void
}

const FusionMapForManager: React.FC<FusionMapForManagerProps> = ({
  mapInfo,
  overlayOpacity = 0.7,
  mode = 'preview',
  onViewerReady,
  onMapClick,
}) => {
  const viewerContainerRef = useRef(null)
  const viewerRef = useRef(null)
  const initializedRef = useRef(false)
  const pcdLayerRef = useRef(null)

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
      if (mapInfo.path) {
        const pcdUrl = `${API_BASE.replace('/api', '')}${mapInfo.path}/map.png`
        const pcdProvider = new Cesium.SingleTileImageryProvider({
          url: pcdUrl,
          rectangle: Cesium.Rectangle.fromDegrees(
            mapInfo.local_bounds?.west || 0,
            mapInfo.local_bounds?.south || 0,
            mapInfo.local_bounds?.east || 0,
            mapInfo.local_bounds?.north || 0,
          ),
        })
        pcdLayerRef.current = viewer.imageryLayers.addImageryProvider(pcdProvider)
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
      if (mapInfo.gps_origin) {
        const { lat, lng } = mapInfo.gps_origin
        viewer.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(lng, lat, 3000),
          orientation: {
            heading: 0,
            pitch: Cesium.Math.toRadians(-45),
            roll: 0,
          },
        })
      }

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
          onMapClick({ lat, lng, alt })
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
  }, [mapInfo.path, mapInfo.gps_origin?.lat, mapInfo.gps_origin?.lng, mode, onViewerReady, onMapClick])

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
