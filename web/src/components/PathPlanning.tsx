import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Card, Button, Input, Space, message, Divider, Tooltip, Badge } from 'antd'
import {
  PlusOutlined, DeleteOutlined, SaveOutlined, ReloadOutlined,
  UndoOutlined, RedoOutlined, EditOutlined, CheckOutlined, CloseOutlined,
  AimOutlined,
} from '@ant-design/icons'
import { Select } from 'antd'
import type { WaypointType } from '../api'
import { pathApi, mapsApi, type MapConfig, type WorldCoord, type PathsData, type PathItem, type PathPoint } from '../api'
import SimpleMapCanvas from './SimpleMapCanvas'
import LocalMapView from './LocalMapView'
import GPSMapView from './GPSMapView'
import FusionMapView from './FusionMapView'

interface PathPlanningProps {
  mapName?: string
  onMapChange?: (mapName: string) => void
}

const PATH_COLORS = ['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2']

// 撤销历史栈
interface HistoryState {
  paths: PathItem[]
  selectedPathId: string | null
  selectedPointId: string | null
}

const PathPlanning: React.FC<PathPlanningProps> = ({ mapName, onMapChange }) => {
  const [maps, setMaps] = useState<{ value: string; label: string }[]>([])
  const [selectedMap, setSelectedMap] = useState<string>(mapName || '')
  const [mapConfig, setMapConfig] = useState<MapConfig | null>(null)
  const [loading, setLoading] = useState(false)
  const [mapType, setMapType] = useState<'local' | 'gps' | 'fusion'>('local')
  const [mapConfigLoaded, setMapConfigLoaded] = useState(false)  // 地图配置加载状态

  // 多路径状态
  const [paths, setPaths] = useState<PathItem[]>([])
  const [selectedPathId, setSelectedPathId] = useState<string | null>(null)
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null)

  // 撤销/还原
  const [undoStack, setUndoStack] = useState<HistoryState[]>([])
  const [redoStack, setRedoStack] = useState<HistoryState[]>([])

  // 点编辑
  const [editingPointId, setEditingPointId] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<{ x: number; y: number; z: number } | null>(null)
  const [editWaypointType, setEditWaypointType] = useState<WaypointType>('waypoint')

  // 重命名
  const [renamingPathId, setRenamingPathId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const mapImageUrl = selectedMap ? `/api/maps/${selectedMap}/map.png` : ''

  // 选中路径对象
  const selectedPath = paths.find(p => p.id === selectedPathId) || null

  // 推送历史
  const pushHistory = useCallback((pathsCopy: PathItem[], selPathId: string | null, selPtId: string | null) => {
    const state: HistoryState = {
      paths: JSON.parse(JSON.stringify(pathsCopy)),
      selectedPathId: selPathId,
      selectedPointId: selPtId,
    }
    setUndoStack(prev => [...prev.slice(-19), state])
    setRedoStack([])
  }, [])

  // 加载地图列表
  const loadMaps = async () => {
    try {
      const response = await mapsApi.getMaps()
      const opts = response.maps.map(m => ({
        value: m.name,
        label: `${m.name} (${m.map_type || 'local'})`,
      }))
      setMaps(opts)
      if (!selectedMap && opts.length > 0) setSelectedMap(opts[0].value)
    } catch (e: any) {
      console.error('加载地图列表失败:', e)
    }
  }

  // 加载多路径
  const loadPaths = async (map: string) => {
    setLoading(true)
    try {
      const resp: PathsData = await pathApi.loadPath(map)
      if (resp.success) {
        setPaths(resp.paths || [])
        if (resp.paths && resp.paths.length > 0) {
          setSelectedPathId(resp.paths[0].id)
        }
        message.success(`加载 ${resp.paths?.length || 0} 条路径`)
      } else {
        setPaths([])
        setSelectedPathId(null)
      }
    } catch (e: any) {
      if (!e.message?.includes('没有保存的路径')) {
        message.error(`加载失败: ${e.message}`)
      }
      setPaths([])
      setSelectedPathId(null)
    } finally {
      setLoading(false)
    }
  }

  // 加载地图配置
  const loadMapConfig = async (map: string) => {
    setMapConfigLoaded(false)  // 重置加载状态
    try {
      const resp = await pathApi.getMapConfig(map)
      if (resp.success) {
        setMapConfig(resp.config)
        setMapType(resp.config.map_type)
        setMapConfigLoaded(true)  // 配置加载完成
      }
    } catch (e) {
      console.error('加载地图配置失败:', e)
    }
  }

  // 保存路径
  const handleSave = async () => {
    if (!selectedMap) { message.warning('请先选择地图'); return }
    setLoading(true)
    try {
      await pathApi.savePath(selectedMap, paths)
      message.success('路径已保存')
    } catch (e: any) {
      message.error(`保存失败: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  // 新建路径
  const handleNewPath = () => {
    pushHistory(paths, selectedPathId, selectedPointId)
    const id = `path-${Date.now()}`
    const idx = paths.length + 1
    const newPath: PathItem = { id, name: `路径${idx}`, points: [] }
    setPaths(prev => [...prev, newPath])
    setSelectedPathId(id)
    setSelectedPointId(null)
  }

  // 删除路径
  const handleDeletePath = (id: string) => {
    pushHistory(paths, selectedPathId, selectedPointId)
    const newPaths = paths.filter(p => p.id !== id)
    setPaths(newPaths)
    if (selectedPathId === id) {
      setSelectedPathId(newPaths.length > 0 ? newPaths[0].id : null)
    }
    setSelectedPointId(null)
  }

  // 开始重命名
  const handleStartRename = (path: PathItem) => {
    setRenamingPathId(path.id)
    setRenameValue(path.name)
  }

  // 确认重命名
  const handleConfirmRename = () => {
    if (!renamingPathId) return
    pushHistory(paths, selectedPathId, selectedPointId)
    setPaths(prev => prev.map(p => p.id === renamingPathId ? { ...p, name: renameValue } : p))
    setRenamingPathId(null)
    setRenameValue('')
  }

  // 撤销 - 修复：prev 是 HistoryState，不能直接访问 .paths
  const handleUndo = () => {
    if (undoStack.length === 0) return
    const prevState = undoStack[undoStack.length - 1] // prevState 是 HistoryState
    const current: HistoryState = {
      paths: JSON.parse(JSON.stringify(paths)),
      selectedPathId,
      selectedPointId,
    }
    // 使用不同的参数名避免混淆
    setUndoStack(s => s.slice(0, -1))
    setRedoStack(s => [...s, current])
    setPaths(JSON.parse(JSON.stringify(prevState.paths)))
    setSelectedPathId(prevState.selectedPathId)
    setSelectedPointId(prevState.selectedPointId)
  }

  // 还原 - 修复：使用 nextState 而非 next 避免混淆
  const handleRedo = () => {
    if (redoStack.length === 0) return
    const nextState = redoStack[redoStack.length - 1] // nextState 是 HistoryState
    const current: HistoryState = {
      paths: JSON.parse(JSON.stringify(paths)),
      selectedPathId,
      selectedPointId,
    }
    setRedoStack(s => s.slice(0, -1))
    setUndoStack(s => [...s, current])
    setPaths(JSON.parse(JSON.stringify(nextState.paths)))
    setSelectedPathId(nextState.selectedPathId)
    setSelectedPointId(nextState.selectedPointId)
  }

  // 地图点击添加点 - 默认类型为途径点
  const handleMapPointClick = useCallback((worldCoord: WorldCoord) => {
    if (!selectedPathId) {
      message.warning('请先选择或新建路径')
      return
    }
    pushHistory(paths, selectedPathId, selectedPointId)
    const ptId = `wp-${Date.now()}`
    const newPt: PathPoint = { id: ptId, x: worldCoord.x, y: worldCoord.y, z: worldCoord.z, waypointType: 'waypoint' }
    setPaths(prev => prev.map(p =>
      p.id === selectedPathId ? { ...p, points: [...p.points, newPt] } : p
    ))
    setSelectedPointId(ptId)
  }, [selectedPathId, selectedPointId, paths, pushHistory])

  // 标记拖拽
  const handleMarkerMove = useCallback((id: string, worldCoord: WorldCoord) => {
    if (!selectedPathId) return
    setPaths(prev => prev.map(p =>
      p.id === selectedPathId
        ? { ...p, points: p.points.map(pt => pt.id === id ? { ...pt, x: worldCoord.x, y: worldCoord.y, z: worldCoord.z } : pt) }
        : p
    ))
  }, [selectedPathId])

  // 选中点 - 同时设置当前航点类型
  const handlePointSelect = (ptId: string) => {
    const pt = selectedPath?.points.find(p => p.id === ptId)
    setSelectedPointId(ptId)
    setEditingPointId(null)
    setEditValues(null)
    if (pt) {
      setEditWaypointType(pt.waypointType || 'waypoint')
    }
  }

  // 开始编辑点 - 同时记录航点类型
  const handleStartEdit = (pt: PathPoint) => {
    pushHistory(paths, selectedPathId, selectedPointId)
    setEditingPointId(pt.id)
    setEditValues({ x: pt.x, y: pt.y, z: pt.z })
    setEditWaypointType(pt.waypointType || 'waypoint')
    setSelectedPointId(pt.id)
  }

  // 保存编辑 - 同时保存航点类型
  const handleSaveEdit = () => {
    if (!editingPointId || !editValues) return
    setPaths(prev => prev.map(p =>
      p.id === selectedPathId
        ? { ...p, points: p.points.map(pt => pt.id === editingPointId ? { ...pt, ...editValues, waypointType: editWaypointType } : pt) }
        : p
    ))
    setEditingPointId(null)
    setEditValues(null)
  }

  // 取消编辑
  const handleCancelEdit = () => {
    setEditingPointId(null)
    setEditValues(null)
    setEditWaypointType('waypoint')
  }

  // 删除点
  const handleDeletePoint = (ptId: string) => {
    pushHistory(paths, selectedPathId, selectedPointId)
    setPaths(prev => prev.map(p =>
      p.id === selectedPathId ? { ...p, points: p.points.filter(pt => pt.id !== ptId) } : p
    ))
    if (selectedPointId === ptId) setSelectedPointId(null)
  }

  // 处理地图变化
  const handleMapChange = (value: string) => {
    setSelectedMap(value)
    onMapChange?.(value)
    setSelectedPointId(null)
    setEditingPointId(null)
    setUndoStack([])
    setRedoStack([])
    setMapType('local') // 重置地图类型，等待加载配置后更新
    loadPaths(value)
    loadMapConfig(value)
  }

  // 初始化
  useEffect(() => { loadMaps() }, [])

  useEffect(() => {
    if (selectedMap) { loadPaths(selectedMap); loadMapConfig(selectedMap) }
  }, [selectedMap])

  // 构建画布标记 - 根据航点类型设置不同颜色
  const canvasMarkers = selectedPath?.points.map((pt, idx) => {
    let color = '#1890ff'
    // 根据航点类型设置颜色：途径点=蓝色，作业点=橙色，充电点=绿色
    if (pt.waypointType === 'work') color = '#fa8c16'
    else if (pt.waypointType === 'charge') color = '#52c41a'
    // 起点和终点特殊处理
    if (idx === 0) color = '#52c41a'
    else if (idx === selectedPath.points.length - 1) color = '#f5222d'
    return { id: pt.id, worldX: pt.x, worldY: pt.y, color, waypointType: pt.waypointType || 'waypoint' }
  }) || []

  // 将路径点转换为 GPS 坐标格式（用于 GPSMapView）
  const gpsPathPoints = selectedPath?.points.map(pt => ({
    id: pt.id,
    lat: pt.lat ?? 0,
    lng: pt.lng ?? 0,
    alt: pt.alt,
    x: pt.x,
    y: pt.y,
    z: pt.z,
    waypointType: pt.waypointType,
  })).filter(pt => pt.lat !== undefined && pt.lng !== undefined) || []

  // 将路径点转换为融合地图坐标格式（世界坐标，用于 FusionMapView）
  const fusionPathPoints = selectedPath?.points.map(pt => ({
    id: pt.id,
    x: pt.x,
    y: pt.y,
    z: pt.z,
    waypointType: pt.waypointType,
  })).filter(pt => pt.x !== undefined && pt.y !== undefined) || []

  // GPS 地图的路径点变化回调（同时保存 GPS 坐标和世界坐标）
  const handleGpsPathPointsChange = useCallback((newPoints: Array<{ id: string; lat: number; lng: number; alt?: number; x?: number; y?: number; z?: number; waypointType?: 'waypoint' | 'work' | 'charge' }>) => {
    if (!selectedPathId) {
      message.warning('请先选择或新建路径')
      return
    }
    pushHistory(paths, selectedPathId, selectedPointId)
    // 取最后一个点作为新添加的点（保留 GPS 坐标和世界坐标）
    const lastPoint = newPoints[newPoints.length - 1]
    if (lastPoint) {
      const newPt: PathPoint = {
        id: `wp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        lat: lastPoint.lat,
        lng: lastPoint.lng,
        alt: lastPoint.alt,
        x: lastPoint.x ?? 0,
        y: lastPoint.y ?? 0,
        z: lastPoint.z ?? 0,
        waypointType: lastPoint.waypointType || 'waypoint',
      }
      setPaths(prev => prev.map(p =>
        p.id === selectedPathId ? { ...p, points: [...p.points, newPt] } : p
      ))
      setSelectedPointId(newPt.id)
    }
  }, [selectedPathId, selectedPointId, paths, pushHistory])

  // 融合地图的路径点变化回调（使用世界坐标）
  const handleFusionPathPointsChange = useCallback((newPoints: Array<{ x: number; y: number; z?: number; lat?: number; lng?: number; alt?: number; waypointType?: 'waypoint' | 'work' | 'charge' }>) => {
    if (!selectedPathId) {
      message.warning('请先选择或新建路径')
      return
    }
    pushHistory(paths, selectedPathId, selectedPointId)
    // 将世界坐标保存到路径点
    const convertedPoints = newPoints.map(pt => ({
      id: pt.id || `wp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      x: pt.x,
      y: pt.y,
      z: pt.z,
      lat: pt.lat,
      lng: pt.lng,
      alt: pt.alt,
      waypointType: pt.waypointType || 'waypoint',
    }))
    // 取最后一个点作为新添加的点
    const lastPoint = convertedPoints[convertedPoints.length - 1]
    if (lastPoint) {
      setPaths(prev => prev.map(p =>
        p.id === selectedPathId ? { ...p, points: [...p.points, lastPoint] } : p
      ))
      setSelectedPointId(lastPoint.id)
    }
  }, [selectedPathId, selectedPointId, paths, pushHistory])

  // 选中的点
  const selectedPoint = selectedPath?.points.find(p => p.id === selectedPointId) || null

  // 点坐标判断
  const getPointTypeLabel = (path: PathItem, ptId: string) => {
    const idx = path.points.findIndex(p => p.id === ptId)
    if (idx === 0) return '起点'
    if (idx === path.points.length - 1) return '终点'
    return `中间点 ${idx + 1}`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', inset: 0 }}>
      {/* 地图容器 - 使用 position absolute 填充整个对话框 */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0, height: '100%', paddingBottom: 48 }}>
        {/* 根据地图类型渲染不同组件 */}
        {!mapConfigLoaded ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: '#001529', color: '#fff' }}>
            加载地图配置中...
          </div>
        ) : mapType === 'local' && mapImageUrl ? (
          <SimpleMapCanvas
            mapName={selectedMap}
            mapImageUrl={mapImageUrl}
            markers={canvasMarkers}
            mapConfig={mapConfig}
            onMapClick={handleMapPointClick}
            onMarkerDrag={handleMarkerMove}
          />
        ) : mapType === 'gps' ? (
          <GPSMapView
            mapInfo={mapConfig}
            mode="planning"
            pathPoints={gpsPathPoints}
            onPathPointsChange={handleGpsPathPointsChange}
          />
        ) : mapType === 'fusion' ? (
          <FusionMapView
            mapInfo={mapConfig}
            mode="planning"
            pathPoints={fusionPathPoints}
            onPathPointsChange={handleFusionPathPointsChange}
          />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: '#001529', color: '#fff' }}>
            {selectedMap ? '加载中...' : '请先选择地图'}
          </div>
        )}

        {/* ========== 浮动图层 ========== */}

        {/* 路径列表 (左上) */}
        <div style={{
          position: 'absolute', top: 16, left: 16, zIndex: 10,
          background: 'rgba(0,0,0,0.75)', borderRadius: 8, padding: 12,
          minWidth: 200, maxWidth: 280,
        }}>
          <div style={{ color: '#fff', fontSize: 12, marginBottom: 8, opacity: 0.7 }}>📋 路径管理</div>

          <Space style={{ width: '100%' }}>
            <Tooltip title="新建路径"><Button size="small" icon={<PlusOutlined />} onClick={handleNewPath} /></Tooltip>
            <Tooltip title="保存"><Button size="small" type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={loading} /></Tooltip>
            <Tooltip title="刷新"><Button size="small" icon={<ReloadOutlined />} onClick={() => selectedMap && loadPaths(selectedMap)} /></Tooltip>
          </Space>

          {/* 路径操作列表 */}
          <Divider style={{ margin: '8px 0', borderColor: '#333' }} />
          {paths.map((p, i) => (
            <div key={p.id} style={{
              display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4,
              padding: '2px 4px', borderRadius: 4,
              background: selectedPathId === p.id ? 'rgba(24,144,255,0.2)' : 'transparent',
            }}>
              <span style={{ color: PATH_COLORS[i % PATH_COLORS.length], fontWeight: 'bold', fontSize: 14 }}>
                {p.points.length > 0
                  ? (p.points[0] ? '🟢' : '⚪')
                  : '⚪'}
              </span>
              {renamingPathId === p.id ? (
                <Input
                  size="small"
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onPressEnter={handleConfirmRename}
                  onBlur={handleConfirmRename}
                  autoFocus
                  style={{ flex: 1 }}
                />
              ) : (
                <span
                  style={{ flex: 1, color: '#fff', fontSize: 13, cursor: 'pointer' }}
                  onClick={() => { setSelectedPathId(p.id); setSelectedPointId(null) }}
                >
                  {p.name}
                </span>
              )}
              <Button size="small" type="text" icon={<EditOutlined />} style={{ color: '#aaa', padding: '0 2px' }}
                onClick={() => handleStartRename(p)} />
              <Button size="small" type="text" icon={<DeleteOutlined />} style={{ color: '#f5222d', padding: '0 2px' }}
                onClick={() => handleDeletePath(p.id)} />
            </div>
          ))}
          {paths.length === 0 && (
            <div style={{ color: '#888', fontSize: 12, textAlign: 'center', padding: '8px 0' }}>
              暂无路径，点击 + 新建
            </div>
          )}
        </div>

        {/* 工具栏 (右上) (P0-3: 使用浅色背景确保按钮图标可见) */}
        <div style={{
          position: 'absolute', top: 16, right: 16, zIndex: 10,
          background: 'rgba(255,255,255,0.92)', borderRadius: 8, padding: '6px 12px',
          display: 'flex', alignItems: 'center', gap: 6,
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        }}>
          <div style={{ color: '#333', fontSize: 12, marginRight: 4, fontWeight: 500 }}>工具</div>
          <Tooltip title="撤销 (Ctrl+Z)">
            <Button size="small" icon={<UndoOutlined />} onClick={handleUndo} disabled={undoStack.length === 0} />
          </Tooltip>
          <Tooltip title="还原 (Ctrl+Y)">
            <Button size="small" icon={<RedoOutlined />} onClick={handleRedo} disabled={redoStack.length === 0} />
          </Tooltip>
          <Divider type="vertical" style={{ margin: '0 4px', borderColor: '#ccc' }} />
          <span style={{ color: '#666', fontSize: 12 }}>
            地图: <span style={{ color: '#333', fontWeight: 500 }}>{selectedMap}</span>
          </span>
        </div>

        {/* 点编辑浮动条 (底部) - 包含航点类型选择 */}
        {selectedPoint && (
          <div style={{
            position: 'absolute', bottom: 60, left: '50%', transform: 'translateX(-50%)',
            zIndex: 10, background: 'rgba(0,0,0,0.85)', borderRadius: 8, padding: '10px 20px',
            display: 'flex', alignItems: 'center', gap: 16, minWidth: 500,
          }}>
            <div style={{ color: '#888', fontSize: 12 }}>
              <AimOutlined /> {selectedPath ? getPointTypeLabel(selectedPath, selectedPoint.id) : '点'}
            </div>

            {editingPointId === selectedPoint.id && editValues ? (
              <>
                {/* 航点类型选择 - 编辑模式下 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: '#fff', fontSize: 12 }}>类型:</span>
                  <Select
                    size="small"
                    value={editWaypointType}
                    onChange={setEditWaypointType}
                    style={{ width: 100 }}
                    options={[
                      { value: 'waypoint', label: '途径点' },
                      { value: 'work', label: '作业点' },
                      { value: 'charge', label: '充电点' },
                    ]}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ color: '#fff', fontSize: 12 }}>X:</span>
                  <Input
                    size="small" type="number" style={{ width: 80 }}
                    value={editValues.x}
                    onChange={e => setEditValues({ ...editValues, x: parseFloat(e.target.value) || 0 })}
                    step={0.1}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ color: '#fff', fontSize: 12 }}>Y:</span>
                  <Input
                    size="small" type="number" style={{ width: 80 }}
                    value={editValues.y}
                    onChange={e => setEditValues({ ...editValues, y: parseFloat(e.target.value) || 0 })}
                    step={0.1}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ color: '#fff', fontSize: 12 }}>Z:</span>
                  <Input
                    size="small" type="number" style={{ width: 80 }}
                    value={editValues.z}
                    onChange={e => setEditValues({ ...editValues, z: parseFloat(e.target.value) || 0 })}
                    step={0.1}
                  />
                </div>
                <Button size="small" type="primary" icon={<CheckOutlined />} onClick={handleSaveEdit}>保存</Button>
                <Button size="small" icon={<CloseOutlined />} onClick={handleCancelEdit}>取消</Button>
              </>
            ) : (
              <>
                <div style={{ color: '#fff', fontSize: 13 }}>
                  {selectedPoint && selectedPoint.lat !== undefined && selectedPoint.lng !== undefined
                    ? `GPS: (${selectedPoint.lat.toFixed(6)}, ${selectedPoint.lng.toFixed(6)}, ${selectedPoint.alt?.toFixed(2) || 0})`
                    : selectedPoint
                      ? `坐标：(${(selectedPoint.x ?? 0).toFixed(3)}, ${(selectedPoint.y ?? 0).toFixed(3)}, ${(selectedPoint.z ?? 0).toFixed(3)})`
                      : '无坐标'
                  }
                </div>
                {/* 航点类型选择 - 非编辑模式下也可快速切换 */}
                <Select
                  size="small"
                  value={selectedPoint.waypointType || 'waypoint'}
                  onChange={(val) => {
                    pushHistory(paths, selectedPathId, selectedPointId)
                    setPaths(prev => prev.map(p =>
                      p.id === selectedPathId
                        ? { ...p, points: p.points.map(pt => pt.id === selectedPointId ? { ...pt, waypointType: val } : pt) }
                        : p
                    ))
                  }}
                  style={{ width: 100 }}
                  options={[
                    { value: 'waypoint', label: '途径点' },
                    { value: 'work', label: '作业点' },
                    { value: 'charge', label: '充电点' },
                  ]}
                />
                <Button size="small" icon={<EditOutlined />} onClick={() => handleStartEdit(selectedPoint)}>编辑</Button>
                <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDeletePoint(selectedPoint.id)}>删除</Button>
              </>
            )}
          </div>
        )}
      </div>

      {/* 底部状态栏 - 固定在页面底部 */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.85)', padding: '6px 24px',
        display: 'flex', alignItems: 'center', gap: 24, fontSize: 12, color: '#aaa',
      }}>
        <span>路径: <strong style={{ color: '#fff' }}>{paths.length}</strong> 条</span>
        <span>选中路径: <strong style={{ color: '#fff' }}>{selectedPath?.name || '无'}</strong></span>
        <span>路径点数: <strong style={{ color: '#fff' }}>{selectedPath?.points.length || 0}</strong></span>
        <span>选中点: <strong style={{ color: '#fff' }}>{selectedPointId && selectedPoint ? `${getPointTypeLabel(selectedPath!, selectedPointId)} (${selectedPoint.lat !== undefined && selectedPoint.lng !== undefined ? `${selectedPoint.lat.toFixed(6)}, ${selectedPoint.lng.toFixed(6)}` : `${(selectedPoint.x ?? 0).toFixed(2)}, ${(selectedPoint.y ?? 0).toFixed(2)}`})` : '无'}</strong></span>
      </div>
    </div>
  )
}

export default PathPlanning
