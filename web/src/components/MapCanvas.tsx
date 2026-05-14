import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Spin, message } from 'antd'
import { pathApi, type MapConfig, type WorldCoord } from '../api'

interface Marker {
  id: string
  worldX: number
  worldY: number
  pixelX?: number
  pixelY?: number
  color?: string
}

interface PathLine {
  id: string
  points: { worldX: number; worldY: number }[]
}

interface MapCanvasProps {
  mapName: string
  mapType?: 'local' | 'gps' | 'fusion'
  mapImageUrl: string
  onPointClick?: (worldCoord: WorldCoord, pixelCoord: { x: number; y: number }) => void
  onMarkerMove?: (id: string, worldCoord: WorldCoord, pixelCoord: { x: number; y: number }) => void
  onMarkerSelect?: (id: string | null) => void
  markers?: Marker[]
  selectedMarkerId?: string | null
  paths?: PathLine[]
}

const MapCanvas: React.FC<MapCanvasProps> = ({
  mapName,
  mapImageUrl,
  onPointClick,
  onMarkerMove,
  onMarkerSelect,
  markers = [],
  selectedMarkerId = null,
  paths = [],
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)

  const [loading, setLoading] = useState(true)
  const [config, setConfig] = useState<MapConfig | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [imageLoaded, setImageLoaded] = useState(false)

  // 缩放和拖拽状态
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [lastOffset, setLastOffset] = useState({ x: 0, y: 0 })


  // 标记拖拽状态
  const [draggingMarker, setDraggingMarker] = useState<string | null>(null)
  const [dragMarkerStart, setDragMarkerStart] = useState({ x: 0, y: 0 })

  // 加载地图配置
  const loadMapConfig = useCallback(async () => {
    try {
      const response = await pathApi.getMapConfig(mapName)
      if (response.success) {
        setConfig(response.config)
      } else {
        setError('加载地图配置失败')
      }
    } catch (err: any) {
      setError(`加载地图配置失败: ${err.message}`)
    }
  }, [mapName])

  useEffect(() => {
    loadMapConfig()
  }, [loadMapConfig])

  // 加载图片
  useEffect(() => {
    if (!mapImageUrl) {
      setLoading(false)
      return
    }

    setLoading(true)
    setImageLoaded(false)

    const img = new Image()
    // 确保 imageRef 立即设置
    imageRef.current = img
    img.onload = () => {
      console.log('Image loaded:', img.width, img.height)
      setImageLoaded(true)
      setLoading(false)
    }
    // 如果图片已经在缓存中，手动触发
    if (img.complete && img.naturalWidth > 0) {
      console.log('Image already loaded from cache')
      setImageLoaded(true)
      setLoading(false)
    }

    img.onerror = () => {
      setError('加载地图图片失败')
      setLoading(false)
    }

    img.src = mapImageUrl

    return () => {
      img.onload = null
      img.onerror = null
    }
  }, [mapImageUrl])

  // 当图片或配置加载完成时重绘
  useEffect(() => {
    console.log('useEffect: imageLoaded=', imageLoaded, 'config=', !!config, 'img=', !!imageRef.current)
    if (imageLoaded && config && imageRef.current && containerRef.current) {
      console.log('useEffect: will draw')
      // 居中到原点
      const canvas = canvasRef.current
      const originPxX = worldToPixel_static(0, 'x', config)
      const originPxY = worldToPixel_static(0, 'y', config)
      setOffset({ x: canvas.width / 2 - originPxX, y: canvas.height / 2 - originPxY })
      drawCanvas()
    }
  }, [imageLoaded, config])

  // 静态工具函数（不依赖 config 状态）
  const worldToPixel_static = (worldVal: number, axis: 'x' | 'y', cfg: MapConfig): number => {
    const { resolution, origin, height } = cfg
    if (axis === 'x') {
      return (worldVal - origin[0]) / resolution
    } else {
      return height - (worldVal - origin[1]) / resolution
    }
  }

  // 世界坐标转像素坐标
  const worldToPixel = useCallback((worldVal: number, axis: 'x' | 'y'): number => {
    if (!config) return 0
    return worldToPixel_static(worldVal, axis, config)
  }, [config])

  // 像素坐标转世界坐标
  const pixelToWorld = useCallback((pixelX: number, pixelY: number): WorldCoord | null => {
    if (!config) return null
    const { resolution, origin, height } = config
    const worldX = pixelX * resolution + origin[0]
    const worldY = (height - pixelY) * resolution + origin[1]
    return { x: worldX, y: worldY, z: origin[2] }
  }, [config])

  // 绘制画布
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    const img = imageRef.current
    if (!canvas || !container) {
      console.log('drawCanvas: missing canvas or container')
      return
    }
    if (!img) {
      console.log('drawCanvas: missing img')
      return
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      console.log('No 2d context!')
      return
    }

    // 设置 canvas 尺寸
    const rect = container.getBoundingClientRect()
    canvas.width = rect.width
    canvas.height = rect.height

    console.log('=== drawCanvas ===')
    console.log('Canvas:', canvas.width, 'x', canvas.height)
    console.log('Image:', img.width, 'x', img.height)
    console.log('Offset:', offset.x, offset.y)

    // 测试：画一个亮色矩形覆盖整个 canvas
    ctx.fillStyle = '#ff8800'  // 橙色
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // 绘制文字测试
    ctx.fillStyle = '#000000'
    ctx.font = 'bold 24px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('CANVAS TEST', canvas.width / 2, canvas.height / 2)
    ctx.font = '16px Arial'
    ctx.fillText(`Canvas: ${canvas.width} x ${canvas.height}`, canvas.width / 2, canvas.height / 2 + 30)
    ctx.fillText(`Image: ${img.width} x ${img.height}`, canvas.width / 2, canvas.height / 2 + 60)

    console.log('Drew orange background with text')

    if (config) {
      drawOriginMarker(ctx, img.width, img.height)

      // 绘制其他路径的连线（灰色半透明）
      paths.forEach(path => {
        if (path.points.length < 2) return
        ctx.beginPath()
        const startPx = worldToPixel_static(path.points[0].worldX, 'x', config)
        const startPy = worldToPixel_static(path.points[0].worldY, 'y', config)
        ctx.moveTo(startPx, startPy)
        for (let i = 1; i < path.points.length; i++) {
          const px = worldToPixel_static(path.points[i].worldX, 'x', config)
          const py = worldToPixel_static(path.points[i].worldY, 'y', config)
          ctx.lineTo(px, py)
        }
        ctx.strokeStyle = 'rgba(100,100,100,0.5)'
        ctx.lineWidth = 1.5 / scale
        ctx.setLineDash([4 / scale, 4 / scale])
        ctx.stroke()
        ctx.setLineDash([])
      })

      // 绘制当前路径的连线
      if (markers.length >= 2) {
        ctx.beginPath()
        const firstPx = markers[0].pixelX ?? worldToPixel(markers[0].worldX, 'x')
        const firstPy = markers[0].pixelY ?? worldToPixel(markers[0].worldY, 'y')
        ctx.moveTo(firstPx, firstPy)
        for (let i = 1; i < markers.length; i++) {
          const px = markers[i].pixelX ?? worldToPixel(markers[i].worldX, 'x')
          const py = markers[i].pixelY ?? worldToPixel(markers[i].worldY, 'y')
          ctx.lineTo(px, py)
        }
        ctx.strokeStyle = 'rgba(24,144,255,0.7)'
        ctx.lineWidth = 2 / scale
        ctx.stroke()
      }

      // 绘制所有标记
      markers.forEach(marker => {
        const pixelX = marker.pixelX ?? worldToPixel(marker.worldX, 'x')
        const pixelY = marker.pixelY ?? worldToPixel(marker.worldY, 'y')

        if (pixelX >= -50 && pixelY >= -50 && pixelX <= img.width + 50 && pixelY <= img.height + 50) {
          const isSelected = marker.id === selectedMarkerId
          drawWaypointMarker(ctx, pixelX, pixelY, marker.color || '#1890ff', isSelected, marker.id === draggingMarker)
        }
      })
    } else {
      // config 未加载时只绘制图片
      markers.forEach(marker => {
        const pixelX = marker.worldX
        const pixelY = marker.worldY
        if (pixelX >= -50 && pixelY >= -50 && pixelX <= img.width + 50 && pixelY <= img.height + 50) {
          drawWaypointMarker(ctx, pixelX, pixelY, marker.color || '#1890ff', marker.id === selectedMarkerId, marker.id === draggingMarker)
        }
      })
    }

    ctx.restore()

    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(10, canvas.height - 40, 100, 30)
    ctx.fillStyle = '#fff'
    ctx.font = '12px Arial'
    ctx.fillText(`缩放: ${(scale * 100).toFixed(0)}%`, 18, canvas.height - 18)
  }, [config, markers, scale, offset, draggingMarker, selectedMarkerId, paths, worldToPixel])

  // ResizeObserver to handle container size changes
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver(() => {
      if (imageLoaded && config) drawCanvas()
    })

    observer.observe(container)
    return () => observer.disconnect()
  }, [imageLoaded, config])

  // 当地图配置加载后居中到原点（独立效应，不调用drawCanvas）
  useEffect(() => {
    if (!config || !imageRef.current || !canvasRef.current) return
    const canvas = canvasRef.current
    const originPxX = worldToPixel_static(0, 'x', config)
    const originPxY = worldToPixel_static(0, 'y', config)
    setOffset({ x: canvas.width / 2 - originPxX, y: canvas.height / 2 - originPxY })
  }, [config])

  // 绘制原点标记
  const drawOriginMarker = (ctx: CanvasRenderingContext2D, imgWidth: number, imgHeight: number) => {
    if (!config) return
    const { resolution, origin, height } = config
    const originPixelX = -origin[0] / resolution
    const originPixelY = height + origin[1] / resolution

    ctx.strokeStyle = '#ff4d4f'
    ctx.lineWidth = 2

    const size = 10
    ctx.beginPath()
    ctx.moveTo(originPixelX - size, originPixelY)
    ctx.lineTo(originPixelX + size, originPixelY)
    ctx.moveTo(originPixelX, originPixelY - size)
    ctx.lineTo(originPixelX, originPixelY + size)
    ctx.stroke()

    ctx.beginPath()
    ctx.arc(originPixelX, originPixelY, size * 0.8, 0, 2 * Math.PI)
    ctx.stroke()

    ctx.fillStyle = '#ff4d4f'
    ctx.font = '12px Arial'
    ctx.fillText('原点', originPixelX + size, originPixelY - size)
  }

  // 绘制路径点标记
  const drawWaypointMarker = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    color: string,
    isSelected: boolean,
    isDragging: boolean
  ) => {
    const baseRadius = 4
    const baseCrossSize = 6
    const scaleFactor = Math.min(Math.max(scale, 0.5), 1.5)

    const radius = baseRadius * scaleFactor
    const crossSize = baseCrossSize * scaleFactor

    // 外发光（选中时）
    if (isSelected || isDragging) {
      ctx.beginPath()
      ctx.arc(x, y, radius + 4, 0, 2 * Math.PI)
      ctx.fillStyle = isDragging ? 'rgba(255,77,77,0.3)' : 'rgba(24,144,255,0.3)'
      ctx.fill()
    }

    // 圆形
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, 2 * Math.PI)
    ctx.fillStyle = isDragging ? '#ff4d4f' : color
    ctx.fill()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 1.5
    ctx.stroke()

    // 十字
    ctx.beginPath()
    ctx.moveTo(x - crossSize, y)
    ctx.lineTo(x + crossSize, y)
    ctx.moveTo(x, y - crossSize)
    ctx.lineTo(x, y + crossSize)
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.stroke()
  }

  // 检查是否点击在标记上
  const hitTestMarker = (clickX: number, clickY: number): Marker | null => {
    const img = imageRef.current
    if (!img || !config) return null
    const canvas = canvasRef.current
    if (!canvas) return null

    const rect = canvas.getBoundingClientRect()
    const canvasCenterX = canvas.width / 2 + offset.x
    const canvasCenterY = canvas.height / 2 + offset.y

    const imgX = (clickX - rect.left - canvasCenterX) / scale + img.width / 2
    const imgY = (clickY - rect.top - canvasCenterY) / scale + img.height / 2

    const hitRadius = 12 / scale

    for (let i = markers.length - 1; i >= 0; i--) {
      const marker = markers[i]
      const pixelX = marker.pixelX ?? worldToPixel(marker.worldX, 'x')
      const pixelY = marker.pixelY ?? worldToPixel(marker.worldY, 'y')
      const dist = Math.sqrt((imgX - pixelX) ** 2 + (imgY - pixelY) ** 2)
      if (dist < hitRadius) return marker
    }
    return null
  }

  // 鼠标滚轮缩放
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setScale(s => Math.min(Math.max(s * delta, 0.1), 10))
  }

  // 鼠标按下
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 0) {
      const hitMarker = hitTestMarker(e.clientX, e.clientY)
      if (hitMarker) {
        setDraggingMarker(hitMarker.id)
        setDragMarkerStart({ x: e.clientX, y: e.clientY })
      } else {
        setIsPanning(true)
        setDragStart({ x: e.clientX, y: e.clientY })
        setLastOffset({ ...offset })
      }
    }
  }

  // 鼠标移动
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (draggingMarker) {
      const dx = e.clientX - dragMarkerStart.x
      const dy = e.clientY - dragMarkerStart.y

      const img = imageRef.current
      const canvas = canvasRef.current
      if (!img || !canvas || !config) return

      const marker = markers.find(m => m.id === draggingMarker)
      if (!marker) return

      const currentPixelX = marker.pixelX ?? worldToPixel(marker.worldX, 'x')
      const currentPixelY = marker.pixelY ?? worldToPixel(marker.worldY, 'y')
      const newPixelX = currentPixelX + dx / scale
      const newPixelY = currentPixelY + dy / scale

      const worldCoord = pixelToWorld(newPixelX, newPixelY)
      if (worldCoord) onMarkerMove?.(draggingMarker, worldCoord, { x: newPixelX, y: newPixelY })

      setDragMarkerStart({ x: e.clientX, y: e.clientY })
    } else if (isPanning) {
      const dx = e.clientX - dragStart.x
      const dy = e.clientY - dragStart.y
      setOffset({ x: lastOffset.x + dx, y: lastOffset.y + dy })
    }
  }

  // 鼠标释放
  const handleMouseUp = () => {
    setIsPanning(false)
    setDraggingMarker(null)
  }

  // 点击事件 - 只有在没有拖拽/平移时才触发
  const handleCanvasClick = async (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (draggingMarker) return

    const canvas = canvasRef.current
    const container = containerRef.current
    const img = imageRef.current
    if (!canvas || !container || !img || !config) return

    const rect = canvas.getBoundingClientRect()
    const canvasCenterX = canvas.width / 2 + offset.x
    const canvasCenterY = canvas.height / 2 + offset.y

    const clickX = (e.clientX - rect.left - canvasCenterX) / scale + img.width / 2
    const clickY = (e.clientY - rect.top - canvasCenterY) / scale + img.height / 2

    // 先检查是否点到了标记
    const hitMarker = hitTestMarker(e.clientX, e.clientY)
    if (hitMarker) {
      onMarkerSelect?.(hitMarker.id)
      return
    }

    // 允许点击地图任意位置，API 会处理越界情况
    const pixelX = Math.round(clickX)
    const pixelY = Math.round(clickY)

    try {
      const response = await pathApi.pixelToWorld(mapName, pixelX, pixelY)
      if (response.success) {
        onPointClick?.(response.world, { x: pixelX, y: pixelY })
      }
    } catch (err: any) {
      message.error(`坐标转换失败: ${err.message}`)
    }
  }

  const handleReset = () => {
    if (config && imageRef.current) {
      const canvas = canvasRef.current
      if (canvas) {
        const originPxX = worldToPixel_static(0, 'x', config)
        const originPxY = worldToPixel_static(0, 'y', config)
        setOffset({ x: canvas.width / 2 - originPxX, y: canvas.height / 2 - originPxY })
      }
    }
    setScale(1)
  }

  useEffect(() => {
    if (imageLoaded && config) drawCanvas()
  }, [markers, imageLoaded, config, scale, offset, draggingMarker, selectedMarkerId, drawCanvas])

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <Spin tip="加载地图..." />
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: 20, color: '#ff4d4f', textAlign: 'center' }}>
        {error}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        background: '#ffffff',  // 白色背景
        borderRadius: 8,
        zIndex: 1,
      }}
    >
      <canvas
        ref={canvasRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleCanvasClick}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          cursor: draggingMarker ? 'grabbing' : isPanning ? 'grabbing' : 'crosshair',
        }}
      />
      <button
        onClick={handleReset}
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          background: 'rgba(0,0,0,0.6)',
          color: '#fff',
          border: 'none',
          borderRadius: 4,
          padding: '4px 8px',
          fontSize: 12,
          cursor: 'pointer',
        }}
        title="重置视图(居中原点)"
      >
        重置
      </button>
      {config && (
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            left: 8,
            background: 'rgba(0,0,0,0.6)',
            color: '#fff',
            padding: '4px 8px',
            borderRadius: 4,
            fontSize: 12,
          }}
        >
          分辨率: {config.resolution.toFixed(4)} m/px | 类型: {config.map_type}
        </div>
      )}
    </div>
  )
}

export default MapCanvas
