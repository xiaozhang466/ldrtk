import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Card, Empty, Spin, Tag, Space, Button, Tooltip } from 'antd'
import { CheckCircleOutlined, ExclamationCircleOutlined, ReloadOutlined, FullscreenOutlined, FullscreenExitOutlined } from '@ant-design/icons'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { useRos } from '../hooks/useRos'

interface MappingPreviewProps {
  mapName?: string
  lastLog?: string  // 最新日志
}

interface PointCloudData {
  positions: Float32Array
  colors?: Float32Array
  pointCount: number
}

const MappingPreview: React.FC<MappingPreviewProps> = ({ mapName, lastLog }) => {
  // 使用全局 ROS 实例 (单例共享)
  const { ros, connected } = useRos()
  
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const pointsRef = useRef<THREE.Points | null>(null)

  const [pointCount, setPointCount] = useState(0)
  const [frameRate, setFrameRate] = useState(0)
  const [loading, setLoading] = useState(false)
  const [heightFilter, setHeightFilter] = useState<number | null>(null)  // 高度过滤阈值（米）
  
  // 使用全局连接状态
  const rosConnected = connected
  
  // 最大点数限制（防止内存溢出）
  const MAX_POINTS = 10000000  // 单帧最多显示 1000 万点
  
  // 点云渲染参数（与 RViz 一致）
  const DEFAULT_POINT_SIZE = 0.01  // 默认点大小：0.01（与 RViz 一致）
  
  // 相机是否已手动调整过
  const cameraAdjusted = useRef(false)
  
  // 全屏状态
  const [isFullscreen, setIsFullscreen] = useState(false)
  const fullscreenContainerRef = useRef<HTMLDivElement>(null)

  const resizeRendererToContainer = useCallback(() => {
    const container = containerRef.current
    const camera = cameraRef.current
    const renderer = rendererRef.current
    if (!container || !camera || !renderer) return

    const width = Math.max(container.clientWidth, 1)
    const height = Math.max(container.clientHeight, 1)

    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setSize(width, height)
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    renderer.domElement.style.display = 'block'
  }, [])

  const fitCameraToGeometry = useCallback((geometry: THREE.BufferGeometry) => {
    if (!cameraRef.current) return

    resizeRendererToContainer()

    const positionsAttribute = geometry.getAttribute('position')
    if (!positionsAttribute) return

    const box = new THREE.Box3().setFromBufferAttribute(positionsAttribute)
    if (box.isEmpty()) return

    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    const fov = cameraRef.current.fov * (Math.PI / 180)
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2))
    cameraZ = Math.max(cameraZ * 1.5, 50)

    cameraRef.current.position.set(center.x, center.y + cameraZ, center.z + cameraZ * 0.5)
    cameraRef.current.lookAt(center.x, center.y, center.z)
    controlsRef.current?.target.copy(center)
    controlsRef.current?.update()
    cameraAdjusted.current = true

    console.log('[MappingPreview] 调整相机视角:', {
      size: maxDim.toFixed(1),
      cameraZ: cameraZ.toFixed(1),
    })
  }, [resizeRendererToContainer])

  // 初始化 Three.js 场景
  const initScene = useCallback(() => {
    if (!containerRef.current) return

    // 创建场景
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x1a1a2e)
    sceneRef.current = scene

    const initialWidth = Math.max(containerRef.current.clientWidth, 1)
    const initialHeight = Math.max(containerRef.current.clientHeight, 1)

    // 创建相机（等轴测视角 - Y 轴垂直向上，XZ 为地面）
    const camera = new THREE.PerspectiveCamera(
      60,
      initialWidth / initialHeight,
      0.1,
      2000
    )
    // 相机位置：斜向观察，Y 轴为垂直高度
    // Three.js 坐标系：X 右，Y 上，Z 前（右手定则）
    camera.position.set(50, 80, 50)  // Y 轴为垂直高度
    camera.lookAt(0, 0, 0)
    cameraRef.current = camera

    // 创建渲染器
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(initialWidth, initialHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))  // 限制像素比，提升性能
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    renderer.domElement.style.display = 'block'
    containerRef.current.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // 添加轨道控制（全方向旋转）
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

    // 添加网格
    const gridHelper = new THREE.GridHelper(100, 20, 0x444444, 0x222222)
    scene.add(gridHelper)

    // 添加坐标轴（带标签）- ROS 坐标系：X 前，Y 左，Z 上 ⭐ 修复
    const axesHelper = new THREE.AxesHelper(5)
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
    
    // 添加坐标轴标签 (ROS 标准坐标系：X 前，Y 左，Z 上)
    // 与点云转换后的坐标系一致，显示 ROS 方向
    const xLabel = createAxisLabel('X', [0, 0, -6], 0xff0000)  // X 轴 - 红色（向前，Three.js -Z 方向）
    const yLabel = createAxisLabel('Y', [-6, 0, 0], 0x00ff00)  // Y 轴 - 绿色（向左，Three.js -X 方向）
    const zLabel = createAxisLabel('Z', [0, 6, 0], 0x0000ff)   // Z 轴 - 蓝色（向上，Three.js Y 方向）
    
    if (xLabel) scene.add(xLabel)
    if (yLabel) scene.add(yLabel)
    if (zLabel) scene.add(zLabel)

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
    const handleResize = () => resizeRendererToContainer()
    window.addEventListener('resize', handleResize)
    const resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(containerRef.current)
    requestAnimationFrame(handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      resizeObserver.disconnect()
      if (containerRef.current && rendererRef.current?.domElement) {
        containerRef.current.removeChild(rendererRef.current.domElement)
      }
      rendererRef.current?.dispose()
    }
  }, [resizeRendererToContainer])

  // 实时点云显示：每次 ROS 消息替换当前帧，不在前端拼接地图。
  
  // 限制最大点数（后端已降采样，这里仅作为安全限制）
  const limitMaxPoints = useCallback((positions: Float32Array, maxPoints: number = 5000): Float32Array => {
    const totalPoints = positions.length / 3
    
    if (totalPoints <= maxPoints) {
      return positions
    }

    // 简单随机采样（仅作为最后的安全限制）
    const sampleRate = maxPoints / totalPoints
    const newPositions: number[] = []

    for (let i = 0; i < positions.length; i += 3) {
      if (Math.random() < sampleRate) {
        newPositions.push(positions[i], positions[i + 1], positions[i + 2])
      }
      if (newPositions.length >= maxPoints * 3) {
        break
      }
    }

    return new Float32Array(newPositions)
  }, [])

  // 处理 ROS 点云消息
  const handlePointCloudMessage = useCallback((msg: any) => {
    if (!sceneRef.current) return

    setLoading(true)

    try {
      // 解析点云数据（ROS sensor_msgs/PointCloud2 格式）
      const width = msg.width
      const height = msg.height
      const fields = msg.fields
      
      // roslibjs 返回的 data 是数组，需要转换为 Uint8Array
      // 注意：rosbridge 可能返回 base64 编码或数组
      let data: Uint8Array
      if (typeof msg.data === 'string') {
        // base64 编码，需要解码
        const binaryString = atob(msg.data)
        data = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) {
          data[i] = binaryString.charCodeAt(i)
        }
      } else if (Array.isArray(msg.data)) {
        // 数组格式
        data = new Uint8Array(msg.data)
      } else {
        data = new Uint8Array(msg.data)
      }
      
      if (width === 0 || data.length === 0) {
        console.warn('[MappingPreview] 空点云数据，跳过渲染')
        setLoading(false)
        return
      }

      // 查找位置字段偏移
      let xOffset = 0, yOffset = 4, zOffset = 8
      for (let i = 0; i < fields.length; i++) {
        if (fields[i].name === 'x') xOffset = fields[i].offset
        if (fields[i].name === 'y') yOffset = fields[i].offset
        if (fields[i].name === 'z') zOffset = fields[i].offset
      }

      // 提取点云位置
      const newPoints: number[] = []
      const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength)
      const pointStep = msg.point_step || 16  // 默认 16 字节（x,y,z,intensity）
      
      for (let i = 0; i < width; i++) {
        const offset = i * pointStep
        
        // 检查边界
        if (offset + zOffset + 4 > data.byteLength) break
        
        // 读取 XYZ 坐标（小端序）- ROS 坐标系：X 前，Y 左，Z 上
        const px = dataView.getFloat32(offset + xOffset, true)
        const py = dataView.getFloat32(offset + yOffset, true)
        const pz = dataView.getFloat32(offset + zOffset, true)

        // 过滤无效点
        if (!isFinite(px) || !isFinite(py) || !isFinite(pz)) continue
        
        // 坐标转换：ROS (X 前，Y 左，Z 上) → Three.js (X 右，Y 上，Z 前) ⭐ 修复
        // ROS 标准坐标系：右手定则，X 前，Y 左，Z 上
        // Three.js 坐标系：右手定则，X 右，Y 上，Z 前（屏幕外）
        //
        // 转换方法：绕 X 轴旋转 -90 度
        // 目标：
        // - ROS X (前) → Three.js -Z (屏幕内/前)
        // - ROS Y (左) → Three.js -X (左)
        // - ROS Z (上) → Three.js Y (上) ✅
        //
        // 转换公式:
        const x = -py     // ROS Y (左) → Three.js -X (左)
        const y = pz      // ROS Z (上) → Three.js Y (上) ✅
        const z = -px     // ROS X (前) → Three.js -Z (屏幕内/前)

        // 高度过滤（过滤掉 Y 坐标高于阈值的点，用于去除屋顶）
        // Three.js 中 Y 轴为垂直方向，0 为地面
        if (heightFilter !== null && y > heightFilter) continue
        
        newPoints.push(x, y, z)
      }

      const positions = new Float32Array(newPoints)

      // 限制最大点数（安全限制）
      const limited = limitMaxPoints(positions, MAX_POINTS)
      const finalPointCount = limited.length / 3

      // 清除旧点云
      if (pointsRef.current && sceneRef.current) {
        sceneRef.current.remove(pointsRef.current)
        pointsRef.current.geometry.dispose()
        ;(pointsRef.current.material as THREE.Material).dispose()
      }

      // 创建新点云
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(limited, 3))

      // 自动调整相机视角（只在首次加载时）
      if (finalPointCount > 0 && !cameraAdjusted.current) {
        fitCameraToGeometry(geometry)
      }

      // 创建材质（绿色点云）- 与 RViz 一致
      const material = new THREE.PointsMaterial({
        size: DEFAULT_POINT_SIZE,  // 0.01（与 RViz 一致）
        sizeAttenuation: true,
        color: 0x52c41a,
        transparent: true,
        opacity: 0.85,
      })

      const pointCloud = new THREE.Points(geometry, material)
      pointsRef.current = pointCloud
      sceneRef.current.add(pointCloud)

      setPointCount(finalPointCount)
    } catch (error) {
      console.error('解析点云失败:', error)
    } finally {
      setLoading(false)
    }
  }, [fitCameraToGeometry, heightFilter, limitMaxPoints])

  // 初始化 ROS 订阅 (连接由 RosProvider 全局管理)
  useEffect(() => {
    console.log('[MappingPreview] 初始化...')
    
    // 场景初始化
    const cleanup = initScene()

    // 订阅点云话题 (ROS 已全局连接)
    let unsubscribe: (() => void) | null = null
    let retryTimer: NodeJS.Timeout | null = null
    
    const subscribeToTopic = () => {
      try {
        console.log('[MappingPreview] 检查 ROS 连接状态:', connected, 'ros:', !!ros)
        if (connected && ros && typeof ros.subscribe === 'function') {
          console.log('[MappingPreview] 订阅实时点云话题：/cloud_registered')
          unsubscribe = ros.subscribe('/cloud_registered', (msg: any) => {
            try {
              handlePointCloudMessage(msg)
            } catch (error) {
              console.error('[MappingPreview] 处理点云消息失败:', error)
            }
          }, 'sensor_msgs/PointCloud2')  // 指定正确的点云消息类型
        } else {
          console.log('[MappingPreview] ROS 未连接，等待 1 秒后重试...')
          retryTimer = setTimeout(subscribeToTopic, 1000)
        }
      } catch (error) {
        console.error('[MappingPreview] 订阅话题失败:', error)
        retryTimer = setTimeout(subscribeToTopic, 1000)
      }
    }
    
    // 延迟订阅，确保 ROS 已连接
    const initTimer = setTimeout(subscribeToTopic, 500)

    return () => {
      console.log('[MappingPreview] 清理...')
      if (initTimer) clearTimeout(initTimer)
      if (retryTimer) clearTimeout(retryTimer)
      cleanup()
      if (unsubscribe) {
        try {
          unsubscribe()
        } catch (error) {
          console.error('[MappingPreview] 取消订阅失败:', error)
        }
      }
      // 重置相机调整标记和全屏状态
      cameraAdjusted.current = false
      setIsFullscreen(false)
      // 不断开 ROS 连接，由 RosProvider 统一管理
    }
  }, [connected, handlePointCloudMessage, ros])

  // 全屏切换函数
  const toggleFullscreen = useCallback(() => {
    if (!fullscreenContainerRef.current) return
    
    if (!isFullscreen) {
      // 进入全屏
      if (fullscreenContainerRef.current.requestFullscreen) {
        fullscreenContainerRef.current.requestFullscreen()
      }
      setIsFullscreen(true)
    } else {
      // 退出全屏
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
      requestAnimationFrame(resizeRendererToContainer)
    }
    
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [resizeRendererToContainer])

  return (
    <div ref={fullscreenContainerRef} style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* 顶部状态栏 */}
      <div style={{ 
        padding: '8px 12px', 
        background: '#fafafa', 
        borderBottom: '1px solid #f0f0f0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
      }}>
        <Space size={8} style={{ minWidth: 0, flex: 1 }}>
          {rosConnected ? (
            <Tag color="green" icon={<CheckCircleOutlined />}>
              实时点云
            </Tag>
          ) : (
            <Tag color="default" icon={<ExclamationCircleOutlined />}>
              等待数据
            </Tag>
          )}
          {frameRate > 0 && (
            <Tag color="blue">{frameRate} FPS</Tag>
          )}
          {/* 显示最新日志 */}
          {lastLog && (
            <Tag color="default" style={{ fontSize: 11, maxWidth: 300 }}>
              <span style={{ color: '#666' }}>{lastLog}</span>
            </Tag>
          )}
        </Space>
        <Space size={8} style={{ flexShrink: 0 }}>
          <div style={{ fontSize: 12, color: '#999' }}>
            点数：{pointCount.toLocaleString()}
          </div>
          {/* 高度过滤滑块 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 11, color: '#666' }}>高度过滤:</span>
            <input
              type="range"
              min="0"
              max="20"
              step="0.5"
              value={heightFilter ?? 20}
              onChange={(e) => {
                const value = parseFloat(e.target.value)
                setHeightFilter(value >= 20 ? null : value)
                setPointCount(0)
                cameraAdjusted.current = false
              }}
              style={{ width: 100, cursor: 'pointer' }}
              title={heightFilter !== null ? `过滤 Z > ${heightFilter}m 的点` : '不过滤'}
            />
            <span style={{ fontSize: 11, color: heightFilter !== null ? '#1890ff' : '#999', minWidth: 35 }}>
              {heightFilter !== null ? `${heightFilter}m` : 'OFF'}
            </span>
          </div>
          {/* 重置视角按钮 */}
          <Button 
            size="small" 
            onClick={() => {
              if (pointsRef.current) {
                fitCameraToGeometry(pointsRef.current.geometry)
              }
            }}
            style={{ fontSize: 11 }}
          >
            重置视角
          </Button>
          <Tooltip title={isFullscreen ? '退出全屏' : '全屏显示'}>
            <Button
              size="small"
              shape="circle"
              icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? '退出全屏' : '全屏显示'}
            />
          </Tooltip>
        </Space>
      </div>

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
            <Spin size="small" tip="更新中..." />
          </div>
        )}

        {!rosConnected && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 10,
            }}
          >
            <Empty 
              description={
                <div style={{ fontSize: 12, color: '#999' }}>
                  <div>等待点云数据</div>
                  <div>请启动建图任务</div>
                </div>
              } 
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              style={{ margin: 0 }}
            />
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
          ROS 坐标系：X 前 (红) Y 左 (绿) Z 上 (蓝) • XY 为地面 • 已转换
          {isFullscreen && ' • 全屏模式'}
          {heightFilter !== null && ` • 高度过滤 Z>${heightFilter}m`}
          {' • 实时帧：/cloud_registered'}
        </span>
      </div>
    </div>
  )
}

export default MappingPreview
