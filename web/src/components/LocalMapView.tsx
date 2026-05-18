/**
 * 本地地图视图组件
 * 
 * 与 MapPreview/MappingPreview 保持一致：
 * - Three.js PCD 点云显示
 * - 染色模式（高度/强度/单色）
 * - 过滤功能（高度/距离）
 * - 点云大小调节
 * - 坐标系：ROS 标准 (X 前，Y 左，Z 上) → Three.js (X 右，Y 上，Z 前)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Card, Select, Slider, Space, Button, Row, Col, Spin } from 'antd'
import {
  ZoomInOutlined,
  ZoomOutOutlined,
  ReloadOutlined,
  FilterOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
} from '@ant-design/icons'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { PCDLoader } from 'three/examples/jsm/loaders/PCDLoader'
import { MapInfo } from '../api'

interface MapFile {
  name: string
  size: number
  path: string
}

const encodePathSegments = (path: string) => path.split('/').map(encodeURIComponent).join('/')

interface LocalMapViewProps {
  mapInfo: MapInfo
  mode: 'preview' | 'mapping' | 'planning'
}

const LocalMapView: React.FC<LocalMapViewProps> = ({ mapInfo, mode }) => {
  console.log('[LocalMapView] 组件渲染，mapInfo:', mapInfo, 'mode:', mode)
  
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const pointsRef = useRef<THREE.Points | null>(null)
  const loaderRef = useRef<PCDLoader | null>(null)

  const [loading, setLoading] = useState(false)
  const [pointCount, setPointCount] = useState(0)
  const [filteredPointCount, setFilteredPointCount] = useState(0)
  const [pointSize, setPointSize] = useState(0.01)
  const [colorMode, setColorMode] = useState<'height' | 'intensity' | 'single'>('height')
  const [filters, setFilters] = useState({
    enabled: false,
    minHeight: -2,
    maxHeight: 20,
    maxDistance: 100,
  })
  const [mapFiles, setMapFiles] = useState<MapFile[]>([])
  const [selectedFile, setSelectedFile] = useState<string>('GlobalMap.pcd')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const fullscreenContainerRef = useRef<HTMLDivElement>(null)

  // 初始化 Three.js 场景
  const initScene = useCallback(() => {
    console.log('[LocalMapView] initScene 调用')
    if (!containerRef.current) {
      console.error('[LocalMapView] containerRef 为空')
      return
    }

    // 创建场景
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x1a1a2e)
    sceneRef.current = scene

    // 创建相机
    const camera = new THREE.PerspectiveCamera(
      75,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      10000
    )
    camera.position.set(0, 50, 100)
    cameraRef.current = camera

    // 创建渲染器
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight)
    renderer.setPixelRatio(window.devicePixelRatio)
    containerRef.current.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // 添加轨道控制（与 MapPreview/MappingPreview 一致）
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.maxPolarAngle = Math.PI * 0.95
    controls.minPolarAngle = 0.05
    controls.enableZoom = true
    controls.enablePan = true
    controls.screenSpacePanning = true
    
    // 配置鼠标按钮：左键旋转，右键平移，中键缩放
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN
    }
    
    // Ctrl+ 左键 = 平移模式（临时切换）
    const domElement = renderer.domElement
    let ctrlLeftActive = false
    
    domElement.addEventListener('keydown', (event) => {
      if (event.key === 'Control' && !ctrlLeftActive) {
        ctrlLeftActive = true
        controls.mouseButtons.LEFT = THREE.MOUSE.PAN
        domElement.style.cursor = 'move'
      }
    })
    
    domElement.addEventListener('keyup', (event) => {
      if (event.key === 'Control' && ctrlLeftActive) {
        ctrlLeftActive = false
        controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE
        domElement.style.cursor = 'default'
      }
    })
    
    domElement.addEventListener('mouseup', () => {
      if (ctrlLeftActive && !domElement.ownerDocument.activeElement?.matches(':focus')) {
        // 保持 Ctrl 按下状态，不恢复
      }
    })
    
    controlsRef.current = controls

    // 添加坐标轴（带标签）- ROS 标准坐标系：X 前，Y 左，Z 上
    const axesHelper = new THREE.AxesHelper(10)
    scene.add(axesHelper)
    
    // 创建坐标轴标签
    const createAxisLabel = (text: string, position: [number, number, number], color: number) => {
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')
      if (!context) return null
      
      canvas.width = 128
      canvas.height = 64
      context.fillStyle = '#' + color.toString(16).padStart(6, '0')
      context.font = 'Bold 40px Arial'
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.fillText(text, 64, 32)
      
      const texture = new THREE.CanvasTexture(canvas)
      const material = new THREE.SpriteMaterial({ map: texture })
      const sprite = new THREE.Sprite(material)
      sprite.position.set(...position)
      sprite.scale.set(2, 1, 1)
      return sprite
    }
    
    // 添加坐标轴标签 (ROS 标准：X-红色前，Y-绿色左，Z-蓝色上)
    const xLabel = createAxisLabel('X', [0, 0, -10], 0xff0000)  // X 轴 - 红色（向前）
    const yLabel = createAxisLabel('Y', [-10, 0, 0], 0x00ff00)  // Y 轴 - 绿色（向左）
    const zLabel = createAxisLabel('Z', [0, 10, 0], 0x0000ff)   // Z 轴 - 蓝色（向上）
    
    if (xLabel) scene.add(xLabel)
    if (yLabel) scene.add(yLabel)
    if (zLabel) scene.add(zLabel)

    // 添加网格
    const gridHelper = new THREE.GridHelper(100, 10, 0x444444, 0x222222)
    scene.add(gridHelper)

    // 初始化 PCD 加载器
    loaderRef.current = new PCDLoader()

    // 渲染循环
    const animate = () => {
      requestAnimationFrame(animate)
      controls.update()
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current)
      }
    }
    animate()

    // 窗口大小调整
    const handleResize = () => {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current) return
      cameraRef.current.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight
      cameraRef.current.updateProjectionMatrix()
      rendererRef.current.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight)
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      if (containerRef.current && rendererRef.current?.domElement) {
        containerRef.current.removeChild(rendererRef.current.domElement)
      }
      rendererRef.current?.dispose()
    }
  }, [])

  // 应用过滤器
  const applyFilters = (
    geometry: THREE.BufferGeometry,
    options: typeof filters
  ): THREE.BufferGeometry => {
    if (!options.enabled) {
      return geometry
    }

    const positions = geometry.attributes.position.array
    const colors = geometry.attributes.color?.array
    const intensities = geometry.attributes.intensity?.array

    const newPositions: number[] = []
    const newColors: number[] = []
    const newIntensities: number[] = []

    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i]
      const y = positions[i + 1]
      const z = positions[i + 2]

      // 高度过滤
      if (z < options.minHeight || z > options.maxHeight) {
        continue
      }

      // 距离过滤 (到原点的水平距离)
      const distance = Math.sqrt(x * x + y * y)
      if (distance > options.maxDistance) {
        continue
      }

      // 保留点
      newPositions.push(x, y, z)
      if (colors) {
        newColors.push(colors[i], colors[i + 1], colors[i + 2])
      }
      if (intensities) {
        newIntensities.push(intensities[i / 3])
      }
    }

    const filteredGeometry = new THREE.BufferGeometry()
    filteredGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(newPositions), 3)
    )

    if (newColors.length > 0) {
      filteredGeometry.setAttribute(
        'color',
        new THREE.BufferAttribute(new Float32Array(newColors), 3)
      )
    }

    if (newIntensities.length > 0) {
      filteredGeometry.setAttribute(
        'intensity',
        new THREE.BufferAttribute(new Float32Array(newIntensities), 1)
      )
    }

    return filteredGeometry
  }

  // 重新应用过滤（当过滤参数变化时）
  const reapplyFilters = useCallback(() => {
    if (!pointsRef.current || !sceneRef.current) return

    const currentGeometry = pointsRef.current.geometry
    const filteredGeometry = applyFilters(currentGeometry, filters)

    // 重新计算着色
    const positions = filteredGeometry.attributes.position.array
    const colors = new Float32Array(positions.length)

    let minZ = Infinity, maxZ = -Infinity
    for (let i = 0; i < positions.length; i += 3) {
      minZ = Math.min(minZ, positions[i + 2])
      maxZ = Math.max(maxZ, positions[i + 2])
    }

    const heightRange = maxZ - minZ || 1
    for (let i = 0; i < positions.length; i += 3) {
      const z = positions[i + 2]
      const t = (z - minZ) / heightRange

      let r, g, b
      if (colorMode === 'height') {
        // 彩虹色：蓝→绿→红（与 MapPreview 一致）
        if (t < 0.5) {
          r = 0
          g = t * 2
          b = 1 - t * 2
        } else {
          r = (t - 0.5) * 2
          g = 1 - (t - 0.5) * 2
          b = 0
        }
      } else if (colorMode === 'intensity') {
        // 灰度
        r = g = b = 0.5
      } else {
        // 单色（青色）
        r = 0.2
        g = 0.8
        b = 1.0
      }

      colors[i] = r
      colors[i + 1] = g
      colors[i + 2] = b
    }

    filteredGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    // 更新材质
    const material = new THREE.PointsMaterial({
      size: pointSize,
      sizeAttenuation: true,
      vertexColors: colorMode !== 'single',
      color: 0xffffff,
    })

    // 替换点云
    sceneRef.current.remove(pointsRef.current)
    pointsRef.current.geometry.dispose()
    ;(pointsRef.current.material as THREE.Material).dispose()

    const pointCloud = new THREE.Points(filteredGeometry, material)
    pointsRef.current = pointCloud
    sceneRef.current.add(pointCloud)

    setFilteredPointCount(Math.floor(positions.length / 3))
  }, [filters, colorMode, pointSize])

  // 监听过滤参数变化，自动重新应用
  useEffect(() => {
    if (filters.enabled && pointsRef.current) {
      const debounceTimer = setTimeout(reapplyFilters, 100)
      return () => clearTimeout(debounceTimer)
    }
  }, [filters, reapplyFilters])

  // 加载地图文件列表（PCD 文件）
  const loadMapFiles = useCallback(async () => {
    if (!mapInfo.name) return
    try {
      const response = await fetch(`/api/maps/${encodeURIComponent(mapInfo.name)}/files`, {
        credentials: 'include',
      })
      const data = await response.json()
      if (data.success) {
        // 只保留 PCD 文件，并按名称排序
        const pcdFiles = data.files
          .filter((f: any) => (f.path || f.name).endsWith('.pcd'))
          .sort((a: any, b: any) => {
            // 排序优先级：GlobalMap > map_filter > map_radius_filter > 其他
            const order = ['GlobalMap', 'map_filter', 'map_radius_filter']
            for (const prefix of order) {
              if (a.name.startsWith(prefix) && !b.name.startsWith(prefix)) return -1
              if (!a.name.startsWith(prefix) && b.name.startsWith(prefix)) return 1
            }
            return a.name.localeCompare(b.name)
          })
        setMapFiles(pcdFiles)
        // 如果当前选中文件不在列表中，切换到第一个
        if (pcdFiles.length > 0 && !pcdFiles.find((f: any) => f.path === selectedFile)) {
          setSelectedFile(pcdFiles[0].path)
        }
      }
    } catch (error) {
      console.error('[LocalMapView] 加载地图文件失败:', error)
    }
  }, [mapInfo.name, selectedFile])

  // 加载 PCD 文件
  const loadPCD = useCallback(async () => {
    if (!sceneRef.current || !mapInfo.name || !loaderRef.current) return

    setLoading(true)

    try {
      console.log('[LocalMapView] 开始加载 PCD:', mapInfo.name, '文件:', selectedFile)
      
      // 清理旧点云
      if (pointsRef.current && sceneRef.current) {
        sceneRef.current.remove(pointsRef.current)
        pointsRef.current.geometry.dispose()
        ;(pointsRef.current.material as THREE.Material).dispose()
        pointsRef.current = null
      }

      // 使用 fetch 加载 PCD 文件（支持认证 cookie）
      const pcdUrl = `/api/maps/${encodeURIComponent(mapInfo.name)}/pcd/${encodePathSegments(selectedFile)}`
      console.log('[LocalMapView] 请求 PCD URL:', pcdUrl)
      
      const response = await fetch(pcdUrl, { credentials: 'include' })
      console.log('[LocalMapView] PCD 响应状态:', response.status)
      
      if (!response.ok) {
        throw new Error(`PCD 加载失败：${response.status}`)
      }
      
      const arrayBuffer = await response.arrayBuffer()
      console.log('[LocalMapView] PCD 数据大小:', arrayBuffer.byteLength, 'bytes')
      
      const blob = new Blob([arrayBuffer])
      const blobUrl = URL.createObjectURL(blob)
      console.log('[LocalMapView] Blob URL:', blobUrl)
      
      // 使用 PCDLoader 解析（同步方法）
      const pcd = loaderRef.current.parse(arrayBuffer)
      console.log('[LocalMapView] PCD 解析成功，点数:', pcd.geometry.attributes.position?.count)
      
      // 清理 blob URL
      URL.revokeObjectURL(blobUrl)
      
      if (!pcd.geometry || !pcd.geometry.attributes.position) {
        console.error('[LocalMapView] PCD 几何体无效')
        setLoading(false)
        return
      }
      
      // 坐标转换：PCD (X 前，Y 左，Z 上) → Three.js (X 右，Y 上，Z 前)
      const positions = pcd.geometry.attributes.position.array
      console.log('[LocalMapView] 转换前坐标示例:', positions[0], positions[1], positions[2])
      
      for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i]      // PCD X (前)
        const y = positions[i + 1]  // PCD Y (左)
        const z = positions[i + 2]  // PCD Z (上)
        
        // 转换：
        positions[i] = -y           // PCD Y → Three.js -X
        positions[i + 1] = z        // PCD Z → Three.js Y
        positions[i + 2] = -x       // PCD X → Three.js -Z
      }
      console.log('[LocalMapView] 转换后坐标示例:', positions[0], positions[1], positions[2])
      
      pcd.geometry.attributes.position.needsUpdate = true
      
      // 应用过滤
      const filteredGeometry = applyFilters(pcd.geometry, filters)
      const filteredPositions = filteredGeometry.attributes.position.array
      console.log('[LocalMapView] 过滤后点数:', Math.floor(filteredPositions.length / 3))
      
      // 计算边界
      let minX = Infinity, maxX = -Infinity
      let minY = Infinity, maxY = -Infinity
      let minZ = Infinity, maxZ = -Infinity

      for (let i = 0; i < filteredPositions.length; i += 3) {
        const x = filteredPositions[i]
        const y = filteredPositions[i + 1]
        const z = filteredPositions[i + 2]
        minX = Math.min(minX, x)
        maxX = Math.max(maxX, x)
        minY = Math.min(minY, y)
        maxY = Math.max(maxY, y)
        minZ = Math.min(minZ, z)
        maxZ = Math.max(maxZ, z)
      }
      console.log('[LocalMapView] 边界框:', { minX, maxX, minY, maxY, minZ, maxZ })

      // 根据模式设置颜色
      const colors = new Float32Array(filteredPositions.length)
      const heightRange = maxZ - minZ || 1
      
      for (let i = 0; i < filteredPositions.length; i += 3) {
        const z = filteredPositions[i + 2]
        const t = (z - minZ) / heightRange
        
        let r, g, b
        if (colorMode === 'height') {
          if (t < 0.5) {
            r = 0; g = t * 2; b = 1 - t * 2
          } else {
            r = (t - 0.5) * 2; g = 1 - (t - 0.5) * 2; b = 0
          }
        } else if (colorMode === 'intensity') {
          r = g = b = 0.5
        } else {
          r = 0.2; g = 0.8; b = 1.0
        }
        
        colors[i] = r
        colors[i + 1] = g
        colors[i + 2] = b
      }
      
      filteredGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

      // 创建材质
      const material = new THREE.PointsMaterial({
        size: pointSize,
        sizeAttenuation: true,
        vertexColors: colorMode !== 'single',
        color: 0xffffff,
      })

      const pointCloud = new THREE.Points(filteredGeometry, material)
      pointsRef.current = pointCloud
      sceneRef.current.add(pointCloud)
      console.log('[LocalMapView] 点云已添加到场景')

      setPointCount(Math.floor(filteredPositions.length / 3))
      setFilteredPointCount(Math.floor(filteredPositions.length / 3))
    } catch (error) {
      console.error('[LocalMapView] 异常:', error)
    } finally {
      setLoading(false)
    }
  }, [mapInfo.name, filters, colorMode, pointSize])

  // 更新点云颜色
  const updatePointCloudColor = useCallback(() => {
    if (!pointsRef.current) return

    const geometry = pointsRef.current.geometry
    const positions = geometry.attributes.position.array
    const colors = new Float32Array(positions.length)

    let minZ = Infinity, maxZ = -Infinity
    for (let i = 0; i < positions.length; i += 3) {
      minZ = Math.min(minZ, positions[i + 2])
      maxZ = Math.max(maxZ, positions[i + 2])
    }

    const heightRange = maxZ - minZ || 1
    
    for (let i = 0; i < positions.length; i += 3) {
      const z = positions[i + 2]
      const t = (z - minZ) / heightRange

      let r, g, b
      if (colorMode === 'height') {
        // 彩虹色：蓝→绿→红（与 MapPreview 一致）
        if (t < 0.5) {
          r = 0
          g = t * 2
          b = 1 - t * 2
        } else {
          r = (t - 0.5) * 2
          g = 1 - (t - 0.5) * 2
          b = 0
        }
      } else if (colorMode === 'intensity') {
        // 灰度
        r = g = b = 0.5
      } else {
        // 单色（青色）
        r = 0.2
        g = 0.8
        b = 1.0
      }

      colors[i] = r
      colors[i + 1] = g
      colors[i + 2] = b
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    if (pointsRef.current.material) {
      (pointsRef.current.material as THREE.PointsMaterial).vertexColors = colorMode !== 'single'
    }
  }, [colorMode])

  // 应用过滤
  const applyFiltersUI = useCallback(() => {
    if (!pointsRef.current || !filters.enabled) return
    reapplyFilters()
  }, [filters.enabled, reapplyFilters])

  // 适配视角
  const fitToView = useCallback(() => {
    if (!pointsRef.current || !cameraRef.current || !controlsRef.current) return
    
    const box = new THREE.Box3().setFromObject(pointsRef.current)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    
    const distance = maxDim * 1.5
    cameraRef.current.position.set(center.x + distance, center.y + distance * 0.5, center.z + distance)
    cameraRef.current.lookAt(center)
    controlsRef.current.target.copy(center)
    controlsRef.current.update()
  }, [])

  // 重置视角
  const resetView = useCallback(() => {
    if (!cameraRef.current || !controlsRef.current) return
    
    cameraRef.current.position.set(0, 50, 100)
    cameraRef.current.lookAt(0, 0, 0)
    controlsRef.current.target.set(0, 0, 0)
    controlsRef.current.update()
  }, [])

  // 更新点大小
  useEffect(() => {
    if (pointsRef.current) {
      const material = pointsRef.current.material as THREE.PointsMaterial
      material.size = pointSize
    }
  }, [pointSize])

  // 初始化场景
  useEffect(() => {
    console.log('[LocalMapView] useEffect initScene 调用')
    const cleanup = initScene()
    return cleanup
  }, [initScene])

  // 加载地图文件列表
  useEffect(() => {
    if (mapInfo.name) {
      loadMapFiles()
    }
  }, [mapInfo.name, loadMapFiles])

  // 加载 PCD
  useEffect(() => {
    console.log('[LocalMapView] useEffect loadPCD 检查，has_pcd:', mapInfo.has_pcd)
    if (mapInfo.has_pcd && selectedFile) {
      console.log('[LocalMapView] 调用 loadPCD')
      loadPCD()
    }
  }, [mapInfo.has_pcd, selectedFile, loadPCD])

  // 更新点云颜色
  useEffect(() => {
    updatePointCloudColor()
  }, [colorMode, updatePointCloudColor])

  // 应用过滤
  useEffect(() => {
    applyFiltersUI()
  }, [filters, applyFiltersUI])

  // 处理窗口大小变化
  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current) return

      const width = containerRef.current.clientWidth
      const height = containerRef.current.clientHeight

      cameraRef.current.aspect = width / height
      cameraRef.current.updateProjectionMatrix()
      rendererRef.current.setSize(width, height)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // 全屏切换
  const toggleFullscreen = useCallback(() => {
    if (!fullscreenContainerRef.current) return
    
    if (!isFullscreen) {
      if (fullscreenContainerRef.current.requestFullscreen) {
        fullscreenContainerRef.current.requestFullscreen()
      }
      setIsFullscreen(true)
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen()
      }
      setIsFullscreen(false)
    }
  }, [isFullscreen])

  // 监听全屏状态变化
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [])

  return (
    <div ref={fullscreenContainerRef} style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* 全屏按钮 - 右上角 */}
      <div style={{
        position: 'absolute',
        top: 8,
        right: 8,
        zIndex: 100,
      }}>
        <Button
          type="primary"
          shape="circle"
          size="large"
          icon={isFullscreen ? <FullscreenExitOutlined style={{ fontSize: 18 }} /> : <FullscreenOutlined style={{ fontSize: 18 }} />}
          onClick={toggleFullscreen}
          style={{
            width: 44,
            height: 44,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          }}
          title={isFullscreen ? '退出全屏' : '全屏显示'}
        />
      </div>

      {/* 顶部工具栏 */}
      <div style={{ 
        padding: '8px 12px', 
        background: '#fafafa', 
        borderBottom: '1px solid #f0f0f0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        paddingRight: 60, // 为全屏按钮留空间
      }}>
        <Space size={8}>
          <span style={{ fontSize: 12, color: '#666' }}>点数：{pointCount.toLocaleString()}</span>
          {filteredPointCount > 0 && filters.enabled && (
            <span style={{ fontSize: 12, color: '#52c41a' }}>
              (过滤后：{filteredPointCount.toLocaleString()})
            </span>
          )}
        </Space>
        <Space size={8}>
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={() => loadMapFiles()}
          >
            刷新
          </Button>
          {mapFiles.length > 0 && (
            <Select
              size="small"
              value={selectedFile}
              onChange={(value) => {
                setSelectedFile(value)
              }}
              options={mapFiles.map((f) => ({
                value: f.path,
                label: f.path === f.name ? f.name : `${f.name} (${f.path})`,
              }))}
              style={{ width: 220 }}
              dropdownStyle={{ maxWidth: 300 }}
            />
          )}
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={() => loadPCD()}
            loading={loading}
          >
            刷新点云
          </Button>
          <Button
            size="small"
            icon={<ZoomInOutlined />}
            onClick={fitToView}
          >
            适配
          </Button>
          <Button
            size="small"
            onClick={resetView}
          >
            重置
          </Button>
          <Select
            size="small"
            value={colorMode}
            onChange={setColorMode}
            options={[
              { value: 'height', label: '高度' },
              { value: 'intensity', label: '强度' },
              { value: 'single', label: '单色' },
            ]}
            style={{ width: 100 }}
          />
          <Button
            size="small"
            icon={<FilterOutlined />}
            onClick={() => setFilters({ ...filters, enabled: !filters.enabled })}
            type={filters.enabled ? 'primary' : 'default'}
          >
            过滤
          </Button>
        </Space>
      </div>

      {/* 过滤面板 */}
      {filters.enabled && (
        <div style={{ 
          padding: '12px', 
          background: '#f6ffed', 
          borderBottom: '1px solid #b7eb8f',
        }}>
          <Row gutter={16}>
            <Col span={12}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>
                高度：{filters.minHeight.toFixed(1)}m ~ {filters.maxHeight.toFixed(1)}m
              </div>
              <Slider
                range
                min={-5}
                max={50}
                step={0.5}
                value={[filters.minHeight, filters.maxHeight]}
                onChange={([min, max]) => setFilters({ ...filters, minHeight: min, maxHeight: max })}
                style={{ fontSize: 10 }}
              />
            </Col>
            <Col span={12}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>
                距离：≤ {filters.maxDistance.toFixed(0)}m
              </div>
              <Slider
                min={10}
                max={200}
                step={5}
                value={filters.maxDistance}
                onChange={(val) => setFilters({ ...filters, maxDistance: val })}
              />
            </Col>
          </Row>
        </div>
      )}

      {/* 3D 视图 */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          background: '#1a1a2e',
          position: 'relative',
        }}
      >
        {loading && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 10,
            }}
          >
            <Spin size="large" tip="加载中..." />
          </div>
        )}
      </div>

      {/* 底部说明 */}
      <div style={{ 
        padding: '6px 12px', 
        background: '#fafafa', 
        borderTop: '1px solid #f0f0f0',
        fontSize: 11,
        color: '#999',
        display: 'flex',
        justifyContent: 'space-between',
      }}>
        <span>🖱️ 左键旋转 | Ctrl+ 左键平移 | 右键平移 | 滚轮缩放 • XYZ 全方向</span>
        <span>
          ROS 坐标系：X 前 (红) Y 左 (绿) Z 上 (蓝){isFullscreen && ' • 全屏模式'}
        </span>
      </div>
    </div>
  )
}

export default LocalMapView
