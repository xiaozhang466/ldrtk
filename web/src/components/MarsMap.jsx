import React, { useEffect, useRef, useState } from 'react'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'

const MarsMap = ({ robotPosition, heading, waypoints, currentWaypoint }) => {
  const viewerContainerRef = useRef(null)
  const [viewer, setViewer] = useState(null)
  const [robotEntity, setRobotEntity] = useState(null)
  const [pathEntity, setPathEntity] = useState(null)
  const [isInitialized, setIsInitialized] = useState(false)
  const currentHost = window.location.hostname || 'localhost'
  const TIANDITU_PROXY = `http://${currentHost}:5001/api/tianditu`
  const API_TOKEN = 'sigu_tdt_2026_secure_token'

  useEffect(() => {
    if (!viewerContainerRef.current || isInitialized) return
    try {
      const viewer = new Cesium.Viewer(viewerContainerRef.current, {
        baseLayerPicker: false, animation: false, timeline: false,
        fullscreenButton: false, vrButton: false, geocoder: false,
        homeButton: false, infoBox: true, sceneModePicker: false,
        selectionIndicator: true, navigationHelpButton: false,
        creditsContainer: false, targetFrameRate: 60
      })
      viewer.imageryLayers.removeAll()
      
      // 设置初始视图为北京
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(116.4074, 39.9042, 100000)
      })
      
      // 使用独立天地图代理服务加载瓦片（带 Token 验证）
      const tdtImg = new Cesium.WebMapTileServiceImageryProvider({
        url: `${TIANDITU_PROXY}/img_w/{TileMatrix}/{TileCol}/{TileRow}?token=${API_TOKEN}`,
        layer: 'img',
        style: 'default',
        format: 'image/jpeg',
        tileMatrixSetID: 'w',
        tileMatrixLabels: ['0','1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','17','18'],
        maximumLevel: 18,
        tilingScheme: new Cesium.WebMercatorTilingScheme()
      })
      viewer.imageryLayers.addImageryProvider(tdtImg)
      
      const tdtAnno = new Cesium.WebMapTileServiceImageryProvider({
        url: `${TIANDITU_PROXY}/cva_w/{TileMatrix}/{TileCol}/{TileRow}?token=${API_TOKEN}`,
        layer: 'cva',
        style: 'default',
        format: 'image/png',
        tileMatrixSetID: 'w',
        tileMatrixLabels: ['0','1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','17','18'],
        maximumLevel: 18,
        tilingScheme: new Cesium.WebMercatorTilingScheme()
      })
      viewer.imageryLayers.addImageryProvider(tdtAnno)
      viewer.scene.globe.enableLighting = false
      viewer.camera.enableCollisionDetection = true
      setViewer(viewer)
      setIsInitialized(true)
      return () => { if (viewer && !viewer.isDestroyed) viewer.destroy() }
    } catch (error) { console.error('❌ Cesium 初始化失败:', error) }
  }, [isInitialized])

  useEffect(() => {
    if (!viewer || !robotPosition || viewer.isDestroyed) return
    if (robotEntity) viewer.entities.remove(robotEntity)
    try {
      const robot = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(robotPosition.lng, robotPosition.lat, robotPosition.alt || 0),
        billboard: {
          image: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgdmlld0JveD0iMCAwIDQwIDQwIj48Y2lyY2xlIGN4PSIyMCIgY3k9IjIwIiByPSIyMCIgZmlsbD0iI2ZmNGQ0ZiIvPjx0ZXh0IHg9IjIwIiB5PSIyNiIgZm9udC1zaXplPSIyNCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0id2hpdGUiPvCfkro8L3RleHQ+PC9zdmc+',
          scale: 1.5, horizontalOrigin: Cesium.HorizontalOrigin.CENTER, verticalOrigin: Cesium.VerticalOrigin.BOTTOM
        },
        description: `<div style="padding:10px"><h3>🤖 机器人</h3><p>航向：${heading}°</p></div>`
      })
      // 调试日志
      console.log('[MarsMap] heading:', heading)
      
      // 航向转方向向量 (导航: 北=0°, 东=90°, 南=180°, 西=270°)
      const headingRad = heading * Math.PI / 180
      const headingLng = robotPosition.lng + 0.0001 * Math.sin(headingRad)  // 经度 = East positive
      const headingLat = robotPosition.lat + 0.0001 * Math.cos(headingRad)  // 纬度 = North positive
      const headingLine = viewer.entities.add({
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArray([robotPosition.lng, robotPosition.lat, headingLng, headingLat]),
          width: 4, material: new Cesium.ColorMaterialProperty(Cesium.Color.fromCssColorString('#1890ff').withAlpha(0.8))
        }
      })
      const robotGroup = viewer.entities.add({})
      robotGroup.addChild(robot)
      robotGroup.addChild(headingLine)
      setRobotEntity(robotGroup)
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(robotPosition.lng, robotPosition.lat, 150),
        orientation: { heading: Cesium.Math.toRadians(heading), pitch: Cesium.Math.toRadians(-45), roll: 0 },
        duration: 1
      })
      return () => { if (robotGroup && !viewer.isDestroyed) viewer.entities.remove(robotGroup) }
    } catch (error) { console.error('❌ 更新机器人位置失败:', error) }
  }, [viewer, robotPosition, heading])

  useEffect(() => {
    if (!viewer || !waypoints || waypoints.length === 0 || viewer.isDestroyed) return
    if (pathEntity) viewer.entities.remove(pathEntity)
    try {
      const pathGroup = viewer.entities.add({})
      const positions = waypoints.map(wp => Cesium.Cartesian3.fromDegrees(wp.lng, wp.lat, wp.alt || 0))
      const pathLine = viewer.entities.add({
        polyline: {
          positions: positions, width: 5,
          material: new Cesium.PolylineDashMaterialProperty({ color: Cesium.Color.fromCssColorString('#1890ff').withAlpha(0.9) })
        }
      })
      pathGroup.addChild(pathLine)
      waypoints.forEach((wp, index) => {
        const isPassed = index <= currentWaypoint
        const color = isPassed ? '#52c41a' : '#1890ff'
        const pixelSize = isPassed ? 15 : 10
        const point = viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(wp.lng, wp.lat, wp.alt || 0),
          point: { pixelSize, color: Cesium.Color.fromCssColorString(color), outlineColor: Cesium.Color.WHITE, outlineWidth: 2 },
          description: `<div style="padding:10px"><h4>路径点 ${index+1}</h4><p>${isPassed?'✅':'⏳'}</p></div>`
        })
        pathGroup.addChild(point)
      })
      setPathEntity(pathGroup)
      return () => { if (pathGroup && !viewer.isDestroyed) viewer.entities.remove(pathGroup) }
    } catch (error) { console.error('❌ 绘制路径失败:', error) }
  }, [viewer, waypoints, currentWaypoint])

  return <div ref={viewerContainerRef} style={{ width: '100%', height: '100%', borderRadius: '16px', overflow: 'hidden', background: '#1a1a2e' }} />
}

export default MarsMap
