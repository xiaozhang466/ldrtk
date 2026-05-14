/**
 * SimpleMapCanvas - 使用 Canvas 统一渲染的地图组件
 * 
 * 解决浏览器缩放时标记点偏移问题：
 * - 所有元素（地图、路径点、连线）都在同一个 Canvas 上绘制
 * - 缩放/平移在 Canvas 内部统一处理
 * 
 * 坐标系统：
 * - 世界坐标: 基于 map.yaml 的 resolution + origin
 * - Canvas 坐标: 地图在 Canvas 中的显示位置
 * - 屏幕坐标: 容器内的像素位置
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'

// 世界坐标
export interface WorldCoord {
  x: number
  y: number
  z?: number
}

interface Marker {
  id: string
  worldX: number
  worldY: number
  color?: string
  waypointType?: 'waypoint' | 'work' | 'charge'
}

interface MapConfig {
  resolution: number
  origin: [number, number, number]
  width: number
  height: number
}

interface SimpleMapCanvasProps {
  mapName: string
  mapImageUrl: string
  markers?: Marker[]
  mapConfig?: MapConfig
  /** 机器人位置 (世界坐标) */
  robotPosition?: { x: number; y: number; heading?: number }
  /** 地图点击回调 - 返回世界坐标 */
  onMapClick?: (worldCoord: WorldCoord) => void
  /** 标记拖拽回调 - id 为标记ID，worldCoord 为拖拽后的世界坐标 */
  onMarkerDrag?: (id: string, worldCoord: WorldCoord) => void
}

const SimpleMapCanvas: React.FC<SimpleMapCanvasProps> = ({
  mapName,
  mapImageUrl,
  markers = [],
  mapConfig,
  robotPosition,
  onMapClick,
  onMarkerDrag,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // 地图图片
  const [mapImage, setMapImage] = useState<HTMLImageElement | null>(null)
  const [imageLoaded, setImageLoaded] = useState(false)

  // 容器尺寸
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })

  // 缩放/平移状态
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragMode, setDragMode] = useState(false)

  // 机器人闪烁状态
  const [robotBlink, setRobotBlink] = useState(true)

  // 交互状态
  const isPanning = useRef(false)
  const panStart = useRef({ x: 0, y: 0 })
  const panOffsetStart = useRef({ x: 0, y: 0 })
  const draggingMarkerId = useRef<string | null>(null)
  const dragStartWorld = useRef({ x: 0, y: 0 })

  // 预加载地图图片
  useEffect(() => {
    if (!mapImageUrl) return
    
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      setMapImage(img)
      setImageLoaded(true)
    }
    img.onerror = () => {
      console.error('[SimpleMapCanvas] Failed to load map image:', mapImageUrl)
    }
    img.src = mapImageUrl
    
    return () => {
      img.onload = null
      img.onerror = null
    }
  }, [mapImageUrl])

  // 监听容器尺寸变化
  useEffect(() => {
    if (!containerRef.current) return
    
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        if (width > 0 && height > 0) {
          setContainerSize({ width, height })
        }
      }
    })
    
    observer.observe(containerRef.current)
    
    // 初始化尺寸
    const rect = containerRef.current.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) {
      setContainerSize({ width: rect.width, height: rect.height })
    }
    
    return () => observer.disconnect()
  }, [])

  // 计算地图在 Canvas 中的显示区域（保持比例）
  const mapDisplay = useMemo(() => {
    if (!mapConfig || !mapImage || containerSize.width === 0) {
      return { x: 0, y: 0, width: 0, height: 0, scale: 1 }
    }
    
    const imgWidth = mapConfig.width
    const imgHeight = mapConfig.height
    const resolution = mapConfig.resolution
    
    // 计算地图在容器中的显示尺寸（contain 模式）
    const scale = Math.min(
      containerSize.width / imgWidth,
      containerSize.height / imgHeight
    )
    const displayWidth = imgWidth * scale
    const displayHeight = imgHeight * scale
    
    // 居中偏移
    const offsetX = (containerSize.width - displayWidth) / 2
    const offsetY = (containerSize.height - displayHeight) / 2
    
    return { x: offsetX, y: offsetY, width: displayWidth, height: displayHeight, scale }
  }, [mapConfig, mapImage, containerSize])

  // 世界坐标 → Canvas 坐标
  const worldToCanvas = useCallback((worldX: number, worldY: number): { x: number, y: number } | null => {
    if (!mapConfig || !mapDisplay.scale) return null
    
    const { resolution, origin, width: imgWidth, height: imgHeight } = mapConfig
    const originX = origin[0]
    const originY = origin[1]
    
    // 世界坐标 → 像素坐标
    const pixelX = (worldX - originX) / resolution
    const pixelY = imgHeight - (worldY - originY) / resolution  // Y轴翻转
    
    // 像素坐标 → Canvas 坐标（应用 contain 缩放）
    const canvasX = mapDisplay.x + pixelX * mapDisplay.scale
    const canvasY = mapDisplay.y + pixelY * mapDisplay.scale
    
    return { x: canvasX, y: canvasY }
  }, [mapConfig, mapDisplay])

  // Canvas 坐标 → 世界坐标
  const canvasToWorld = useCallback((canvasX: number, canvasY: number): WorldCoord | null => {
    if (!mapConfig || !mapDisplay.scale) return null
    
    const { resolution, origin, width: imgWidth, height: imgHeight } = mapConfig
    const originX = origin[0]
    const originY = origin[1]
    
    // Canvas 坐标 → 像素坐标
    const pixelX = (canvasX - mapDisplay.x) / mapDisplay.scale
    const pixelY = (canvasY - mapDisplay.y) / mapDisplay.scale
    
    // 像素坐标 → 世界坐标（Y轴翻转）
    const worldX = pixelX * resolution + originX
    const worldY = (imgHeight - pixelY) * resolution + originY
    
    return { x: worldX, y: worldY, z: 0 }
  }, [mapConfig, mapDisplay])

  // 屏幕坐标 → Canvas 坐标（应用 zoom + pan）
  const screenToCanvas = useCallback((screenX: number, screenY: number): { x: number, y: number } => {
    const centerX = containerSize.width / 2
    const centerY = containerSize.height / 2
    
    // 逆变换：应用 zoom 和 pan 的逆
    const localX = (screenX - centerX - pan.x) / zoom + centerX
    const localY = (screenY - centerY - pan.y) / zoom + centerY
    
    return { x: localX, y: localY }
  }, [containerSize, zoom, pan])

  // 渲染 Canvas
  const render = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    
    const { width, height } = containerSize
    
    // 清空画布
    ctx.clearRect(0, 0, width, height)
    
    // 保存状态
    ctx.save()
    
    // 应用变换：以容器中心为原点
    ctx.translate(width / 2 + pan.x, height / 2 + pan.y)
    ctx.scale(zoom, zoom)
    ctx.translate(-width / 2, -height / 2)
    
    // 1. 绘制地图背景（深色）
    ctx.fillStyle = '#001529'
    ctx.fillRect(0, 0, width, height)
    
    // 2. 绘制地图图片
    if (mapImage && imageLoaded) {
      ctx.drawImage(
        mapImage,
        mapDisplay.x,
        mapDisplay.y,
        mapDisplay.width,
        mapDisplay.height
      )
    }
    
    // 3. 绘制原点十字（淡色虚线）
    if (mapConfig) {
      const originPos = worldToCanvas(0, 0)
      if (originPos) {
        // 短虚线样式（只在原点附近延伸较短距离）
        ctx.strokeStyle = 'rgba(255, 77, 77, 0.4)'  // 半透明红色
        ctx.lineWidth = 1
        ctx.setLineDash([4, 4])  // 短虚线
        
        const lineLength = 30  // 每侧只延伸30像素
        
        // 水平线
        ctx.beginPath()
        ctx.moveTo(Math.max(0, originPos.x - lineLength), originPos.y)
        ctx.lineTo(Math.min(width, originPos.x + lineLength), originPos.y)
        ctx.stroke()
        
        // 垂直线
        ctx.beginPath()
        ctx.moveTo(originPos.x, Math.max(0, originPos.y - lineLength))
        ctx.lineTo(originPos.x, Math.min(height, originPos.y + lineLength))
        ctx.stroke()
        
        ctx.setLineDash([])  // 恢复实线
        
        // 中心点（稍大一点更明显）
        ctx.fillStyle = 'rgba(255, 77, 77, 0.6)'
        ctx.beginPath()
        ctx.arc(originPos.x, originPos.y, 5, 0, Math.PI * 2)
        ctx.fill()
        
        // 白色中心点
        ctx.fillStyle = 'white'
        ctx.beginPath()
        ctx.arc(originPos.x, originPos.y, 2, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    
    // 4. 绘制路径连线
    if (markers.length >= 2) {
      ctx.strokeStyle = markers[0]?.color || '#1890ff'
      ctx.lineWidth = 2
      ctx.setLineDash([5, 3])
      ctx.beginPath()
      
      markers.forEach((marker, i) => {
        const pos = worldToCanvas(marker.worldX, marker.worldY)
        if (pos) {
          if (i === 0) {
            ctx.moveTo(pos.x, pos.y)
          } else {
            ctx.lineTo(pos.x, pos.y)
          }
        }
      })
      
      ctx.stroke()
      ctx.setLineDash([])
    }
    
    // 5. 绘制路径标记点
    markers.forEach((marker, index) => {
      const pos = worldToCanvas(marker.worldX, marker.worldY)
      if (!pos) return
      
      // 确定颜色
      let color = marker.color || '#1890ff'
      if (index === 0) color = '#52c41a'  // 起点-绿色
      else if (index === markers.length - 1) color = '#f5222d'  // 终点-红色
      
      // 绘制圆形标记
      const radius = draggingMarkerId.current === marker.id ? 8 : 6
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2)
      ctx.fill()
      
      // 白色边框
      ctx.strokeStyle = 'white'
      ctx.lineWidth = 2
      ctx.stroke()
    })

    // 6. 绘制机器人位置闪烁图标
    if (robotPosition) {
      const robotPos = worldToCanvas(robotPosition.x, robotPosition.y)
      if (robotPos) {
        const robotSize = 8  // 缩小标记点

        if (robotBlink) {
          // 外圈 - 红色脉冲扩散动画
          ctx.fillStyle = 'rgba(255, 0, 0, 0.2)'
          ctx.beginPath()
          ctx.arc(robotPos.x, robotPos.y, robotSize + 10, 0, Math.PI * 2)
          ctx.fill()

          ctx.fillStyle = 'rgba(255, 0, 0, 0.3)'
          ctx.beginPath()
          ctx.arc(robotPos.x, robotPos.y, robotSize + 5, 0, Math.PI * 2)
          ctx.fill()
        }

        // 机器人本体 - 红色实心圆
        ctx.fillStyle = '#ff4d4f'
        ctx.beginPath()
        ctx.arc(robotPos.x, robotPos.y, robotSize, 0, Math.PI * 2)
        ctx.fill()

        // 白色边框
        ctx.strokeStyle = 'white'
        ctx.lineWidth = 1.5
        ctx.stroke()

        // 绘制朝向指示线
        if (robotPosition.heading !== undefined) {
          const headingRad = (robotPosition.heading || 0) * Math.PI / 180
          ctx.strokeStyle = '#ff4d4f'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(robotPos.x, robotPos.y)
          ctx.lineTo(
            robotPos.x + Math.cos(headingRad) * (robotSize + 6),
            robotPos.y + Math.sin(headingRad) * (robotSize + 6)
          )
          ctx.stroke()
        }
      }
    }

    // 恢复状态
    ctx.restore()
  }, [containerSize, mapImage, imageLoaded, mapDisplay, mapConfig, markers, zoom, pan, worldToCanvas])

  // 监听状态变化，重新渲染
  useEffect(() => {
    render()
  }, [render, markers, zoom, pan, imageLoaded, robotBlink, robotPosition])

  // 机器人闪烁动画
  useEffect(() => {
    if (!robotPosition) return

    const interval = setInterval(() => {
      setRobotBlink(prev => !prev)
    }, 500) // 每500ms切换一次

    return () => clearInterval(interval)
  }, [robotPosition])

  // 渲染原点和地图
  useEffect(() => {
    if (imageLoaded) {
      render()
    }
  }, [imageLoaded, render])

  // 鼠标滚轮缩放
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    
    // 计算缩放前鼠标在 Canvas 坐标系中的位置
    const beforeZoom = screenToCanvas(mouseX, mouseY)
    
    // 执行缩放
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    const newZoom = Math.min(Math.max(zoom * delta, 0.1), 10)
    setZoom(newZoom)
    
    // 计算缩放后鼠标在 Canvas 坐标系中的位置
    const afterZoom = screenToCanvas(mouseX, mouseY)
    
    // 调整 pan 以保持鼠标位置不变
    setPan(prev => ({
      x: prev.x + (afterZoom.x - beforeZoom.x) * newZoom,
      y: prev.y + (afterZoom.y - beforeZoom.y) * newZoom,
    }))
  }, [zoom, screenToCanvas])

  // 鼠标按下
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return
    
    const rect = containerRef.current.getBoundingClientRect()
    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top
    const canvasPos = screenToCanvas(screenX, screenY)
    
    // 检查是否点击了标记点
    for (const marker of markers) {
      const pos = worldToCanvas(marker.worldX, marker.worldY)
      if (!pos) continue
      
      const dist = Math.sqrt(
        Math.pow(canvasPos.x - pos.x, 2) + Math.pow(canvasPos.y - pos.y, 2)
      )
      
      if (dist <= 10) {
        // 点击了标记点 - 开始拖拽
        if (onMarkerDrag) {
          draggingMarkerId.current = marker.id
          dragStartWorld.current = { x: marker.worldX, y: marker.worldY }
          
          document.addEventListener('mousemove', handleMouseMove)
          document.addEventListener('mouseup', handleMouseUp)
        }
        return
      }
    }
    
    // 拖拽模式或 Ctrl + 左键 - 拖拽地图
    if (dragMode || e.ctrlKey) {
      isPanning.current = true
      panStart.current = { x: e.clientX, y: e.clientY }
      panOffsetStart.current = { x: pan.x, y: pan.y }
      
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    }
  }, [markers, dragMode, pan, onMarkerDrag, screenToCanvas, worldToCanvas])

  // 鼠标移动
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!containerRef.current) return
    
    const rect = containerRef.current.getBoundingClientRect()
    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top
    
    // 处理地图拖拽
    if (isPanning.current) {
      const deltaX = e.clientX - panStart.current.x
      const deltaY = e.clientY - panStart.current.y
      setPan({
        x: panOffsetStart.current.x + deltaX,
        y: panOffsetStart.current.y + deltaY,
      })
      return
    }
    
    // 处理标记拖拽
    if (draggingMarkerId.current && onMarkerDrag) {
      const canvasPos = screenToCanvas(screenX, screenY)
      const worldCoord = canvasToWorld(canvasPos.x, canvasPos.y)
      
      if (worldCoord) {
        onMarkerDrag(draggingMarkerId.current, worldCoord)
      }
    }
  }, [onMarkerDrag, screenToCanvas, canvasToWorld])

  // 鼠标释放
  const handleMouseUp = useCallback(() => {
    isPanning.current = false
    draggingMarkerId.current = null
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  }, [handleMouseMove])

  // 点击地图（添加点）
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current || !onMapClick) return
    
    // 拖拽模式或 Ctrl + 左键不处理点击
    if (dragMode || e.ctrlKey) return
    
    // 如果正在拖拽，不处理
    if (isPanning.current || draggingMarkerId.current) return
    
    const rect = containerRef.current.getBoundingClientRect()
    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top
    const canvasPos = screenToCanvas(screenX, screenY)
    
    // 检查是否点击了标记点（点击标记不添加新点）
    for (const marker of markers) {
      const pos = worldToCanvas(marker.worldX, marker.worldY)
      if (!pos) continue
      
      const dist = Math.sqrt(
        Math.pow(canvasPos.x - pos.x, 2) + Math.pow(canvasPos.y - pos.y, 2)
      )
      
      if (dist <= 10) {
        return  // 点击了标记点，不添加新点
      }
    }
    
    // 转换为世界坐标
    const worldCoord = canvasToWorld(canvasPos.x, canvasPos.y)
    
    if (worldCoord) {
      onMapClick(worldCoord)
    }
  }, [dragMode, markers, onMapClick, screenToCanvas, worldToCanvas, canvasToWorld])

  // 缩放按钮
  const zoomAtCenter = useCallback((delta: number) => {
    setZoom(prev => Math.min(Math.max(prev * delta, 0.1), 10))
  }, [])

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        background: '#001529',
        cursor: dragMode ? 'grab' : (onMapClick ? 'crosshair' : 'default'),
      }}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
    >
      {/* Canvas 渲染层 */}
      <canvas
        ref={canvasRef}
        width={containerSize.width}
        height={containerSize.height}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
        }}
      />

      {/* 加载指示器 */}
      {!imageLoaded && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: '#fff',
            fontSize: 16,
          }}
        >
          加载中...
        </div>
      )}

      {/* 缩放/拖动按钮 */}
      <div
        style={{
          position: 'absolute',
          bottom: 12,
          right: 12,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 4,
          zIndex: 10,
        }}
      >
        {/* 放大按钮 */}
        <button
          onClick={(e) => { e.stopPropagation(); zoomAtCenter(1.2) }}
          style={{
            width: 36,
            height: 36,
            borderRadius: 6,
            background: 'rgba(0,0,0,0.65)',
            border: 'none',
            color: '#fff',
            fontSize: 20,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 1,
          }}
          title="放大"
        >
          +
        </button>

        {/* 拖动模式按钮 */}
        <button
          onClick={(e) => { e.stopPropagation(); setDragMode(!dragMode) }}
          style={{
            width: 36,
            height: 36,
            borderRadius: 6,
            background: dragMode ? 'rgba(24,144,255,0.8)' : 'rgba(0,0,0,0.65)',
            border: 'none',
            color: '#fff',
            fontSize: 16,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title={dragMode ? '退出拖动模式' : '拖动模式'}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 9h4V6h3l-5-5-5 5h3v3zm-1 1H6V7l-5 5 5 5v-3h3v-4zm14 2l-5-5v3h-3v4h3v3l5-5zm-9 3h-4v3H7l5 5 5-5h-3v-3z"/>
          </svg>
        </button>

        {/* 缩小按钮 */}
        <button
          onClick={(e) => { e.stopPropagation(); zoomAtCenter(0.8) }}
          style={{
            width: 36,
            height: 36,
            borderRadius: 6,
            background: 'rgba(0,0,0,0.65)',
            border: 'none',
            color: '#fff',
            fontSize: 20,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 1,
          }}
          title="缩小"
        >
          −
        </button>

        {/* 缩放百分比显示 */}
        <div
          style={{
            background: 'rgba(0,0,0,0.6)',
            borderRadius: 4,
            padding: '2px 6px',
            color: '#fff',
            fontSize: 11,
          }}
        >
          {Math.round(zoom * 100)}%
        </div>
      </div>
    </div>
  )
}

export default SimpleMapCanvas
