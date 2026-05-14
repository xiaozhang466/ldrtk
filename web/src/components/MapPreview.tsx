import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Card, Select, Button, Space, Slider, message, Spin, Alert, Row, Col, Statistic, Divider } from 'antd'
import { useSearchParams } from 'react-router-dom'
import {
  ReloadOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
  FullscreenOutlined,
  DownloadOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  FilterOutlined,
} from '@ant-design/icons'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { PCDLoader } from 'three/examples/jsm/loaders/PCDLoader'
import { mapsApi } from '../api'
import rosInstance from '../utils/ros'

interface MapPreviewProps {
  mapName?: string
  onMapChange?: (mapName: string) => void
}

interface MapFile {
  name: string
  size: number
  path: string
}

const MapPreview: React.FC<MapPreviewProps> = ({ mapName, onMapChange }) => {
  const [searchParams] = useSearchParams()
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const pointsRef = useRef<THREE.Points | null>(null)
  const loaderRef = useRef<PCDLoader | null>(null)

  const [maps, setMaps] = useState<{ value: string; label: string }[]>([])
  // 优先使用 URL 参数，其次使用 props
  const urlMapName = searchParams.get('map')
  const [selectedMap, setSelectedMap] = useState<string>(urlMapName || mapName || '')
  const [mapFiles, setMapFiles] = useState<MapFile[]>([])
  const [selectedFile, setSelectedFile] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [pointCount, setPointCount] = useState(0)
  const [filteredPointCount, setFilteredPointCount] = useState(0)
  const [pointSize, setPointSize] = useState(0.01)  // 与 RViz 一致
  const [colorMode, setColorMode] = useState<'height' | 'intensity' | 'single'>('height')
  const [rosConnected, setRosConnected] = useState(false)
  const [frameRate, setFrameRate] = useState(0)
  const [bounds, setBounds] = useState<{ minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number } | null>(null)
  const [fileSize, setFileSize] = useState<string>('')
  
  // 过滤配置
  const [filters, setFilters] = useState({
    enabled: false,
    minHeight: -2,
    maxHeight: 20,
    maxDistance: 100,
  })

  // 初始化 Three.js 场景
  const initScene = useCallback(() => {
    if (!containerRef.current) return

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

    // 添加轨道控制（与 MappingPreview 一致）
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.maxPolarAngle = Math.PI * 0.95  // 允许几乎 360 度旋转
    controls.minPolarAngle = 0.05
    controls.enableZoom = true
    controls.enablePan = true  // 允许平移
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
        controls.mouseButtons.LEFT = THREE.MOUSE.PAN  // 左键切换为平移
        domElement.style.cursor = 'move'
      }
    })
    
    domElement.addEventListener('keyup', (event) => {
      if (event.key === 'Control' && ctrlLeftActive) {
        ctrlLeftActive = false
        controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE  // 恢复旋转
        domElement.style.cursor = 'default'
      }
    })
    
    // 鼠标离开时也恢复（防止 Ctrl 键松开事件丢失）
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

  // 加载地图列表
  const loadMaps = async () => {
    try {
      const response = await mapsApi.getMaps()
      const mapOptions = response.maps.map((m) => ({
        value: m.name,
        label: m.name,
      }))
      setMaps(mapOptions)
      if (!selectedMap && mapOptions.length > 0) {
        setSelectedMap(mapOptions[0].value)
      }
    } catch (error) {
      console.error('加载地图列表失败:', error)
      message.error('加载地图列表失败')
    }
  }

  // 加载地图文件列表
  const loadMapFiles = async (map: string) => {
    try {
      const response = await fetch(`/api/maps/${map}/files`, {
        credentials: 'include',
      })
      const data = await response.json()
      if (data.success) {
        const mapFiles = data.files.filter((f: any) => f.name.endsWith('.pcd'))
        setMapFiles(mapFiles)
        if (mapFiles.length > 0) {
          // 优先选择 GlobalMap.pcd
          const globalMap = mapFiles.find((f: any) => f.name === 'GlobalMap.pcd')
          setSelectedFile(globalMap ? globalMap.name : mapFiles[0].name)
        } else {
          setSelectedFile('')
          message.info('该地图下没有地图文件')
        }
      }
    } catch (error) {
      console.error('加载地图文件失败:', error)
    }
  }

  // 适配视角
  const fitToView = () => {
    if (!bounds || !cameraRef.current || !controlsRef.current) return
    
    const centerX = (bounds.minX + bounds.maxX) / 2
    const centerY = (bounds.minY + bounds.maxY) / 2
    const centerZ = (bounds.minZ + bounds.maxZ) / 2
    
    const sizeX = bounds.maxX - bounds.minX
    const sizeY = bounds.maxY - bounds.minY
    const sizeZ = bounds.maxZ - bounds.minZ
    const maxDim = Math.max(sizeX, sizeY, sizeZ)
    
    const distance = maxDim * 1.5
    cameraRef.current.position.set(centerX + distance, centerY + distance * 0.5, centerZ + distance)
    cameraRef.current.lookAt(centerX, centerY, centerZ)
    controlsRef.current.target.set(centerX, centerY, centerZ)
    controlsRef.current.update()
    
    message.success('已适配视角')
  }

  // 重置视角
  const resetView = () => {
    if (!cameraRef.current || !controlsRef.current) return
    
    cameraRef.current.position.set(0, 50, 100)
    cameraRef.current.lookAt(0, 0, 0)
    controlsRef.current.target.set(0, 0, 0)
    controlsRef.current.update()
    
    message.success('已重置视角')
  }

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
        if (t < 0.5) {
          r = 0
          g = t * 2
          b = 1 - t * 2
        } else {
          r = (t - 0.5) * 2
          g = 1 - (t - 0.5) * 2
          b = 0
        }
      } else {
        r = g = b = 1
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

  // 加载点云
  const loadPointCloud = async (map: string, filename: string) => {
    if (!filename || !loaderRef.current || !sceneRef.current) return
    
    setLoading(true)
    setProgress(0)
    
    try {
      const response = await fetch(`/api/maps/${map}/pcd/${filename}`, {
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error(`加载失败：${response.status}`)
      }

      // 获取总大小
      const totalSize = parseInt(response.headers.get('content-length') || '0')
      const file = mapFiles.find(f => f.name === filename)
      const fileSize = file ? file.size : totalSize
      
      if (fileSize) {
        setFileSize((fileSize / (1024 * 1024)).toFixed(2) + ' MB')
      }

      // 流式读取以显示进度
      const reader = response.body?.getReader()
      if (!reader) {
        // 回退到传统方式
        const arrayBuffer = await response.arrayBuffer()
        const blob = new Blob([arrayBuffer])
        const url = URL.createObjectURL(blob)
        
        loaderRef.current.load(
          url,
          (pcd) => {
            URL.revokeObjectURL(url)

          // 清除旧点云
          if (pointsRef.current && sceneRef.current) {
            sceneRef.current.remove(pointsRef.current)
            pointsRef.current.geometry.dispose()
            (pointsRef.current.material as THREE.Material).dispose()
          }

          // 应用过滤并创建点云
          const filteredGeometry = applyFilters(pcd.geometry, filters)
          
          // 坐标转换：PCD (X 前，Y 左，Z 上) → Three.js (X 右，Y 上，Z 前)
          // 与 MappingPreview 保持一致
          const positions = filteredGeometry.attributes.position.array
          for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i]      // PCD X
            const y = positions[i + 1]  // PCD Y
            const z = positions[i + 2]  // PCD Z (高度)
            
            // 转换：Z 轴向上 → Y 轴向上
            positions[i] = -y           // PCD Y (左) → Three.js -X (左)
            positions[i + 1] = z        // PCD Z (上) → Three.js Y (上)
            positions[i + 2] = -x       // PCD X (前) → Three.js -Z (前)
          }
          filteredGeometry.attributes.position.needsUpdate = true
          
          // 计算边界和着色
          const colors = new Float32Array(positions.length)
          
          let minX = Infinity, maxX = -Infinity
          let minY = Infinity, maxY = -Infinity
          let minZ = Infinity, maxZ = -Infinity

          for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i]
            const y = positions[i + 1]
            const z = positions[i + 2]
            minX = Math.min(minX, x)
            maxX = Math.max(maxX, x)
            minY = Math.min(minY, y)
            maxY = Math.max(maxY, y)
            minZ = Math.min(minZ, z)
            maxZ = Math.max(maxZ, z)
          }
          
          // 根据模式设置颜色
          const heightRange = maxZ - minZ || 1
          for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i]
            const y = positions[i + 1]
            const z = positions[i + 2]
            
            let r, g, b
            if (colorMode === 'height') {
              const t = (z - minZ) / heightRange
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
              const intensity = filteredGeometry.attributes.intensity?.array[i / 3] || 0
              const t = Math.min(intensity / 255, 1)
              r = g = b = t
            } else {
              r = g = b = 1
            }
            
            colors[i] = r
            colors[i + 1] = g
            colors[i + 2] = b
          }
          
          filteredGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
          
          const material = new THREE.PointsMaterial({
            size: pointSize,
            sizeAttenuation: true,
            vertexColors: colorMode !== 'single',
            color: 0xffffff,
          })

          const pointCloud = new THREE.Points(filteredGeometry, material)
          pointsRef.current = pointCloud
          sceneRef.current!.add(pointCloud)

          setBounds({ minX, maxX, minY, maxY, minZ, maxZ })
          setPointCount(Math.floor(positions.length / 3))
          setFilteredPointCount(Math.floor(positions.length / 3))

          // 自动适配视角
          setTimeout(fitToView, 100)
        },
        undefined,
        (error) => {
          console.error('加载 PCD 失败:', error)
          message.error('加载 PCD 文件失败')
          setLoading(false)
        }
      )}
    } catch (error) {
      console.error('加载点云失败:', error)
      message.error('加载失败')
    } finally {
      setLoading(false)
    }
  }

  // 更新点大小
  useEffect(() => {
    if (pointsRef.current) {
      const material = pointsRef.current.material as THREE.PointsMaterial
      material.size = pointSize
    }
  }, [pointSize])

  // 初始化 ROS 连接
  useEffect(() => {
    rosInstance.onStatusChange = (status: { connected: boolean }) => {
      setRosConnected(status.connected)
    }

    let lastFrameCount = 0
    let lastTime = Date.now()
    rosInstance.onMessage = (msg: any) => {
      const now = Date.now()
      const delta = now - lastTime
      if (delta >= 1000) {
        const fps = Math.round((msg.frameCount - lastFrameCount) * 1000 / delta)
        setFrameRate(fps)
        lastFrameCount = msg.frameCount
        lastTime = now
      }
    }

    rosInstance.connect().catch(console.error)

    return () => {
      rosInstance.disconnect()
    }
  }, [])

  // 初始化
  useEffect(() => {
    const cleanup = initScene()
    loadMaps()

    return cleanup
  }, [initScene])

  // 加载选中的地图文件列表
  useEffect(() => {
    if (selectedMap) {
      setMapFiles([])
      setSelectedFile('')
      loadMapFiles(selectedMap)
      onMapChange?.(selectedMap)
    }
  }, [selectedMap])

  // 加载选中的 PCD 文件
  useEffect(() => {
    if (selectedMap && selectedFile) {
      loadPointCloud(selectedMap, selectedFile)
    }
  }, [selectedMap, selectedFile, colorMode])

  // 处理地图变化
  const handleMapChange = (value: string) => {
    setSelectedMap(value)
  }

  return (
    <div>
      {/* 控制栏 */}
      <Card
        style={{ marginBottom: 16, borderRadius: 8, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
      >
        <Space wrap size={16}>
          <span style={{ fontWeight: 500 }}>地图:</span>
          <Select
            value={selectedMap}
            onChange={handleMapChange}
            options={maps}
            style={{ width: 200 }}
            loading={loading}
            size="large"
          />
          {mapFiles.length > 0 && (
            <>
              <span style={{ fontWeight: 500 }}>地图文件:</span>
              <Select
                value={selectedFile}
                onChange={setSelectedFile}
                options={mapFiles.map((f) => ({ value: f.name, label: f.name }))}
                style={{ width: 250 }}
                size="large"
              />
            </>
          )}
          <Button
            icon={<ReloadOutlined />}
            onClick={() => selectedMap && selectedFile && loadPointCloud(selectedMap, selectedFile)}
            loading={loading}
            size="large"
          >
            刷新
          </Button>
          <Button icon={<ZoomInOutlined />} onClick={fitToView} size="large" disabled={!bounds}>
            适配
          </Button>
          <Button icon={<FullscreenOutlined />} onClick={resetView} size="large">
            重置
          </Button>
          <Divider type="vertical" style={{ height: 32 }} />
          <span style={{ fontWeight: 500 }}>着色:</span>
          <Select
            value={colorMode}
            onChange={setColorMode}
            options={[
              { value: 'height', label: '按高度' },
              { value: 'intensity', label: '按强度' },
              { value: 'single', label: '单色' },
            ]}
            style={{ width: 120 }}
            size="large"
          />
          <Button
            icon={filters.enabled ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : undefined}
            onClick={() => setFilters({ ...filters, enabled: !filters.enabled })}
            size="large"
            type={filters.enabled ? 'primary' : 'default'}
          >
            过滤
          </Button>
        </Space>

        <Divider style={{ margin: '16px 0' }} />

        {/* 点云统计 */}
        <Row gutter={[24, 16]}>
          <Col span={6}>
            <Statistic
              title="原始点数"
              value={pointCount}
              suffix="个"
              valueStyle={{ fontSize: 20, color: '#1890ff' }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="过滤后点数"
              value={filteredPointCount || pointCount}
              suffix="个"
              valueStyle={{ fontSize: 20, color: filters.enabled ? '#52c41a' : '#8c8c8c' }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="文件大小"
              value={fileSize || '-'}
              valueStyle={{ fontSize: 20, color: '#52c41a' }}
            />
          </Col>
          <Col span={6}>
            <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 4 }}>点大小：{pointSize.toFixed(3)}</div>
            <Slider
              value={pointSize}
              onChange={setPointSize}
              min={0.005}
              max={0.5}
              step={0.005}
              style={{ maxWidth: 300 }}
            />
          </Col>
        </Row>

        {/* 过滤面板 */}
        {filters.enabled && (
          <>
            <Divider style={{ margin: '16px 0' }} />
            <Row gutter={[24, 16]}>
              <Col span={24}>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: '#262626' }}>
                  📏 点云过滤
                </div>
              </Col>
              
              {/* 高度过滤 */}
              <Col span={12}>
                <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 8 }}>
                  高度范围 (Z 轴): {filters.minHeight.toFixed(1)}m ~ {filters.maxHeight.toFixed(1)}m
                </div>
                <Slider
                  range
                  min={-5}
                  max={50}
                  step={0.5}
                  value={[filters.minHeight, filters.maxHeight]}
                  onChange={([min, max]) => setFilters({ ...filters, minHeight: min, maxHeight: max })}
                  marks={{
                    '-5': '-5m',
                    '0': '0m',
                    '10': '10m',
                    '20': '20m',
                    '50': '50m',
                  }}
                />
              </Col>
              
              {/* 距离过滤 */}
              <Col span={12}>
                <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 8 }}>
                  最大距离：{filters.maxDistance.toFixed(0)}m
                </div>
                <Slider
                  min={10}
                  max={200}
                  step={5}
                  value={filters.maxDistance}
                  onChange={(val) => setFilters({ ...filters, maxDistance: val })}
                  marks={{
                    '10': '10m',
                    '50': '50m',
                    '100': '100m',
                    '200': '200m',
                  }}
                />
              </Col>
              
              {/* 过滤统计 */}
              {filteredPointCount > 0 && (
                <Col span={24}>
                  <div style={{ 
                    padding: '12px 16px', 
                    background: '#f6ffed', 
                    borderRadius: 6,
                    border: '1px solid #b7eb8f',
                    marginTop: 8,
                  }}>
                    <Space size="large">
                      <span style={{ fontSize: 13, color: '#52c41a' }}>
                        ✅ 已过滤 {(pointCount - filteredPointCount).toLocaleString()} 个点
                      </span>
                      <span style={{ fontSize: 13, color: '#52c41a' }}>
                        保留率：{((filteredPointCount / pointCount) * 100).toFixed(1)}%
                      </span>
                    </Space>
                  </div>
                </Col>
              )}
            </Row>
          </>
        )}

        {bounds && (
          <>
            <Divider style={{ margin: '16px 0' }} />
            <Row gutter={24}>
              <Col span={8}>
                <div style={{ fontSize: 13, color: '#8c8c8c' }}>X 轴范围</div>
                <div style={{ fontSize: 15, fontWeight: 500, color: '#262626' }}>
                  {bounds.minX.toFixed(2)} ~ {bounds.maxX.toFixed(2)} m
                </div>
              </Col>
              <Col span={8}>
                <div style={{ fontSize: 13, color: '#8c8c8c' }}>Y 轴范围</div>
                <div style={{ fontSize: 15, fontWeight: 500, color: '#262626' }}>
                  {bounds.minY.toFixed(2)} ~ {bounds.maxY.toFixed(2)} m
                </div>
              </Col>
              <Col span={8}>
                <div style={{ fontSize: 13, color: '#8c8c8c' }}>Z 轴范围</div>
                <div style={{ fontSize: 15, fontWeight: 500, color: '#262626' }}>
                  {bounds.minZ.toFixed(2)} ~ {bounds.maxZ.toFixed(2)} m
                </div>
              </Col>
            </Row>
          </>
        )}
      </Card>

      {/* 3D 视图 */}
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '600px',
          background: '#1a1a2e',
          borderRadius: 8,
          overflow: 'hidden',
          position: 'relative',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
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
            <Spin size="large" tip="加载点云中..." />
          </div>
        )}
      </div>

      {/* 操作说明 */}
      <Card style={{ marginTop: 16, borderRadius: 8, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }} size="small">
        <Space split={<span style={{ color: '#d9d9d9' }}>|</span>}>
          <span>🖱️ 左键旋转</span>
          <span>Ctrl+ 左键平移</span>
          <span>🖱️ 右键平移</span>
          <span>🖱️ 滚轮缩放</span>
          <span>ROS 坐标系：X 前 (红) Y 左 (绿) Z 上 (蓝)</span>
        </Space>
      </Card>
    </div>
  )
}

export default MapPreview
