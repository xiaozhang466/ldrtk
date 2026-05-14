/**
 * MarsMapForManager - 用于地图管理器的 Cesium 地图组件
 * 基于 MarsMap.jsx 重构，支持 GPS 地图预览
 */

import React, { useEffect, useRef, useMemo } from 'react'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'

const MarsMapForManager = ({ gpsOrigin, mode = 'preview', onViewerReady, onMapClick }) => {
  const currentHost = window.location.hostname || 'localhost'
  const TIANDITU_PROXY = `http://${currentHost}:5001/api/tianditu`
  const API_TOKEN = 'sigu_tdt_2026_secure_token'
  const viewerContainerRef = useRef(null)
  const viewerRef = useRef(null)
  const initializedRef = useRef(false)
  const modeRef = useRef(mode)
  const onMapClickRef = useRef(onMapClick)
  const gpsOriginStrRef = useRef(JSON.stringify(gpsOrigin))  // 用于比较 gpsOrigin 是否变化

  // 保持 mode 和 onMapClick 的引用最新
  useEffect(() => {
    modeRef.current = mode
    onMapClickRef.current = onMapClick
  }, [mode, onMapClick])

  // 序列化 gpsOrigin 用于比较
  const gpsOriginStr = useMemo(() => JSON.stringify(gpsOrigin), [gpsOrigin])

  useEffect(() => {
    if (!viewerContainerRef.current) return

    // 检查 gpsOrigin 是否真的变化了
    if (initializedRef.current && gpsOriginStrRef.current === gpsOriginStr) {
      // gpsOrigin 没变，不需要重新初始化
      return
    }

    // 如果已经初始化过，先销毁
    if (initializedRef.current) {
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.destroy()
        viewerRef.current = null
      }
      initializedRef.current = false
    }

    initializedRef.current = true
    gpsOriginStrRef.current = gpsOriginStr
    const container = viewerContainerRef.current

    try {
      // 创建 Viewer，参考 MarsMap.jsx 的成功配置
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
        shouldAnimate: false,
      })

      viewerRef.current = viewer

      // 回调通知父组件 viewer 已就绪
      if (onViewerReady) {
        onViewerReady(viewer)
      }

      // 移除所有默认图层
      viewer.imageryLayers.removeAll()

      // 添加天地图底图
      const imgProvider = new Cesium.WebMapTileServiceImageryProvider({
        url: `${TIANDITU_PROXY}/img_w/{TileMatrix}/{TileCol}/{TileRow}?token=${API_TOKEN}`,
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
        url: `${TIANDITU_PROXY}/cva_w/{TileMatrix}/{TileCol}/{TileRow}?token=${API_TOKEN}`,
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

      // 优化性能
      const scene = viewer.scene
      scene.globe.enableLighting = false
      scene.globe.show = true
      scene.fog.enabled = false
      scene.skyAtmosphere.show = false
      scene.sun.show = false
      scene.moon.show = false
      scene.skyBox.show = false
      scene.highDynamicRange = false
      scene.postProcessStages.fxaaEnabled = false
      scene.postProcessStages.bloomEnabled = false
      
      // 添加错误处理
      if (!imgProvider.ready) {
        imgProvider.errorEvent.addEventListener((error) => {
          console.error('[MarsMap] 底图加载错误:', error)
        })
      }

      // 定位到原点；无本地地图时先显示一个全国范围在线底图
      if (gpsOrigin) {
        const { lat, lng, alt = 0 } = gpsOrigin

        viewer.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(lng, lat, 500),
          orientation: {
            heading: Cesium.Math.toRadians(0),
            pitch: Cesium.Math.toRadians(-90),
            roll: 0,
          },
        })

        viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(lng, lat, alt),
          point: {
            pixelSize: 12,
            color: Cesium.Color.RED,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
          },
          label: {
            text: '地图原点',
            font: '14pt monospace',
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            outlineWidth: 2,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -9),
          },
        })
      } else {
        viewer.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(104.0, 35.0, 6000000),
          orientation: {
            heading: Cesium.Math.toRadians(0),
            pitch: Cesium.Math.toRadians(-90),
            roll: 0,
          },
        })
      }

      // 规划模式下启用点击事件 - 使用 ref 避免闭包问题
      if (modeRef.current === 'planning' && onMapClickRef.current) {
        viewer.screenSpaceEventHandler.setInputAction((event) => {
          const ray = viewer.camera.getPickRay(event.position)
          if (!ray) return
          const cartesian = viewer.scene.globe.pick(ray, viewer.scene)
          if (!cartesian) return
          const cartographic = Cesium.Cartographic.fromCartesian(cartesian)
          const lat = Cesium.Math.toDegrees(cartographic.latitude)
          const lng = Cesium.Math.toDegrees(cartographic.longitude)
          const alt = cartographic.height
          onMapClickRef.current({ lat, lng, alt })
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK)
      }

      // 延迟渲染确保图层加载
      setTimeout(() => {
        if (!viewer.isDestroyed()) {
          viewer.scene.render()
        }
      }, 500)

    } catch (error) {
      console.error('❌ Cesium 初始化失败:', error)
      initializedRef.current = false
    }

    // 只在组件卸载时销毁 viewer，不依赖 gpsOrigin 变化
    return () => {
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.destroy()
        viewerRef.current = null
      }
      initializedRef.current = false
    }
  }, [gpsOriginStr])  // 只在 gpsOrigin 字符串表示变化时重新初始化

  return (
    <div
      ref={viewerContainerRef}
      style={{
        width: '100%',
        height: '100%',
        minHeight: '300px',
        overflow: 'hidden',
        background: '#000',
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
      }}
    />
  )
}

export default MarsMapForManager
