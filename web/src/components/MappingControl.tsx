import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Card, Button, Space, Statistic, Progress, Timeline, Tag, Divider, message, Alert, Row, Col, Empty, Select, Modal } from 'antd'
import { useSearchParams } from 'react-router-dom'
import {
  PlayCircleOutlined,
  StopOutlined,
  ReloadOutlined,
  WifiOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ClockCircleOutlined,
  DashboardOutlined,
  LineChartOutlined,
  SaveOutlined,
  ClearOutlined,
  AppstoreOutlined,
  CloseOutlined,
} from '@ant-design/icons'
import { mappingApi, mapsApi, type MappingStatus } from '../api'
import { useRos } from '../hooks/useRos'
import MappingPreview from './MappingPreview'

interface MappingControlProps {
  mapName?: string
  onClose?: () => void  // 关闭回调，由父组件控制
}

const { Option } = Select

const MappingControl: React.FC<MappingControlProps> = ({ mapName, onClose }) => {
  const [searchParams] = useSearchParams()
  const urlMapName = searchParams.get('map')
  const effectiveMapName = urlMapName || mapName
  
  // 调试日志
  useEffect(() => {
    console.log('MappingControl: mapName prop =', mapName)
    console.log('MappingControl: urlMapName =', urlMapName)
    console.log('MappingControl: effectiveMapName =', effectiveMapName)
  }, [mapName, urlMapName])
  
  // ROS 连接只影响实时点云预览；建图启动由后端 API 执行
  const { connected: rosConnected } = useRos()
  
  const [status, setStatus] = useState<MappingStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [frameRate, setFrameRate] = useState(0)
  const [logs, setLogs] = useState<Array<{ time: string; message: string; type: 'info' | 'success' | 'warning' | 'error' }>>([])
  const logsEndRef = useRef<HTMLDivElement>(null)
  
  // 状态读取和地图冲突
  const [statusError, setStatusError] = useState<string | null>(null)
  const [mapConflict, setMapConflict] = useState<string | null>(null)  // 其他地图在建图
  
  // 地图列表状态
  const [maps, setMaps] = useState<Array<{name: string}>>([])
  const [selectedMap, setSelectedMap] = useState<string>(effectiveMapName || 'test_map')
  const [mapsLoading, setMapsLoading] = useState(false)
  
  // 加载地图列表
  const loadMaps = useCallback(async () => {
    setMapsLoading(true)
    try {
      const response = await mapsApi.getMaps()
      setMaps(response.maps || [])
      // 如果没有选中地图，默认选择第一个
      if (!selectedMap && response.maps && response.maps.length > 0) {
        setSelectedMap(response.maps[0].name)
      }
    } catch (error: any) {
      console.error('加载地图列表失败:', error)
    } finally {
      setMapsLoading(false)
    }
  }, [selectedMap])
  
  useEffect(() => {
    loadMaps()
  }, [loadMaps])

  // 添加日志
  const addLog = useCallback((messageText: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    const now = new Date().toLocaleTimeString('zh-CN')
    setLogs((prev) => [...prev, { time: now, message: messageText, type }].slice(-100))
  }, [])

  // 清空日志
  const clearLogs = () => {
    setLogs([])
    message.success('日志已清空')
  }

  // 开始建图
  const handleStart = async () => {
    const mapToUse = selectedMap || effectiveMapName
    console.log('handleStart: selectedMap =', selectedMap)
    console.log('handleStart: effectiveMapName =', effectiveMapName)
    console.log('handleStart: mapToUse =', mapToUse)
    
    if (!mapToUse) {
      message.error('请先选择地图！')
      return
    }

    setLoading(true)
    addLog(`正在启动建图：${mapToUse}...`, 'info')
    
    try {
      console.log('调用 API 开始建图:', mapToUse)
      await mappingApi.startMapping(mapToUse)
      message.success(`建图启动中：${mapToUse}`)
      addLog('启动请求已发送：先启动雷达和 IMU，稳定后启动建图', 'info')
    } catch (error: any) {
      console.error('建图启动失败:', error)
      message.error(`启动失败：${error.message}`)
      addLog(`启动失败：${error.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  // 停止建图
  const handleStop = async () => {
    setLoading(true)
    try {
      await mappingApi.stopMapping()
      message.success('建图任务已停止')
      addLog('建图任务已停止', 'warning')
    } catch (error: any) {
      message.error(`停止失败：${error.message}`)
      addLog(`停止失败：${error.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  // 保存地图
  const handleSave = async () => {
    setLoading(true)
    try {
      await mappingApi.saveMap()
      message.success('地图已保存')
      addLog('地图已保存', 'success')
    } catch (error: any) {
      message.error(`保存失败：${error.message}`)
      addLog(`保存失败：${error.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  // 后端状态轮询：后端负责启动雷达、IMU 和 FAST-LIVO2
  useEffect(() => {
    let cancelled = false
    let lastStatus: string | null = null
    
    const loadStatus = async () => {
      try {
        const response = await mappingApi.getStatus()
        if (cancelled) return

        const state = response.status
        setStatusError(null)

        if (
          ['starting', 'running', 'stopping'].includes(state.status)
          && state.map_name
          && effectiveMapName
          && state.map_name !== effectiveMapName
        ) {
          setMapConflict(state.map_name)
        } else {
          setMapConflict(null)
        }

        setStatus(state)

        if (state.status !== lastStatus) {
          if (state.status === 'starting') {
            addLog('正在启动雷达和 IMU...', 'info')
          } else if (state.status === 'running') {
            addLog('建图任务已开始', 'success')
          } else if (state.status === 'completed') {
            addLog('建图完成，数据已保存', 'success')
          } else if (state.status === 'error') {
            addLog(state.error_message || '建图出错', 'error')
          } else if (state.status === 'idle' && lastStatus === 'running') {
            addLog('建图任务已停止', 'warning')
          }
          lastStatus = state.status
        }
      } catch (error: any) {
        if (cancelled) return
        setStatusError(`建图状态读取失败：${error.message}`)
      }
    }

    loadStatus()
    const timer = setInterval(loadStatus, 1500)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [effectiveMapName, addLog])

  // 自动滚动日志到底部
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  // 格式化时长
  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  // 获取状态配置
  const getStatusConfig = (s: string) => {
    switch (s) {
      case 'running':
        return { color: '#52c41a', text: '建图中', icon: <CheckCircleOutlined /> }
      case 'saving':
        return { color: '#1890ff', text: '保存地图', icon: <SaveOutlined /> }
      case 'saved':
        return { color: '#1890ff', text: '已保存', icon: <SaveOutlined /> }
      case 'converting':
        return { color: '#722ed1', text: '栅格化', icon: <DashboardOutlined /> }
      case 'completed':
        return { color: '#13c2c2', text: '已完成', icon: <CheckCircleOutlined /> }
      case 'error':
        return { color: '#ff4d4f', text: '错误', icon: <ExclamationCircleOutlined /> }
      case 'starting':
        if (status?.phase === 'starting_lidar') return { color: '#faad14', text: '启动雷达', icon: <ClockCircleOutlined /> }
        if (status?.phase === 'starting_imu') return { color: '#faad14', text: '启动 IMU', icon: <ClockCircleOutlined /> }
        if (status?.phase === 'starting_mapping') return { color: '#faad14', text: '启动建图', icon: <ClockCircleOutlined /> }
        return { color: '#faad14', text: '启动中', icon: <ClockCircleOutlined /> }
      default:
        return { color: '#d9d9d9', text: '空闲', icon: <ClockCircleOutlined /> }
    }
  }

  const statusConfig = status ? getStatusConfig(status.status) : getStatusConfig('idle')

  // 是否正在建图或处理中（保存/栅格化）
  const isProcessing = ['starting', 'running', 'saving', 'saved', 'converting', 'stopping'].includes(status?.status || '')

  // 停止建图确认
  const handleStopWithConfirm = () => {
    Modal.confirm({
      title: '停止建图',
      content: '是否保存本次建图数据？保存将覆盖原有地图数据。',
      okText: '保存',
      cancelText: '不保存',
      okType: 'primary',
      onOk: async () => {
        try {
          await mappingApi.stopMapping()
          message.success('建图任务已停止')
          addLog('建图任务已停止', 'warning')
          await mappingApi.saveMap()
          message.success('地图已保存')
          addLog('地图已保存', 'success')
        } catch (error: any) {
          message.error(`停止或保存失败：${error.message}`)
          addLog(`停止或保存失败：${error.message}`, 'error')
        }
      },
      onCancel: () => {
        // 直接停止，不保存
        handleStop()
      },
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 中间：点云实时预览 - 最大化显示 */}
      <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        <MappingPreview 
          mapName={effectiveMapName} 
          lastLog={logs.length > 0 ? logs[logs.length - 1].message : undefined}
        />
      </div>

      {/* 底部：状态数据 + 开始/停止按钮 + 关闭按钮 */}
      <div style={{ 
        padding: '12px 16px', 
        borderTop: '1px solid #f0f0f0',
        background: '#fafafa',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
      }}>
        {/* 左侧：状态数据 */}
        <Space size={16} wrap style={{ flex: 1 }}>
          {/* 点数 */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <DashboardOutlined style={{ color: '#666', fontSize: 16 }} />
            <div>
              <div style={{ fontSize: 11, color: '#999' }}>点数</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#333' }}>
                {status?.frame_count || 0}
                {frameRate > 0 && <span style={{ fontSize: 11, color: '#52c41a', marginLeft: 4 }}>({frameRate} FPS)</span>}
              </div>
            </div>
          </div>
          
          {/* 轨迹点 */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <LineChartOutlined style={{ color: '#666', fontSize: 16 }} />
            <div>
              <div style={{ fontSize: 11, color: '#999' }}>轨迹点</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#333' }}>{status?.trajectory_points || 0}</div>
            </div>
          </div>
          
          {/* 时长 */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <ClockCircleOutlined style={{ color: '#666', fontSize: 16 }} />
            <div>
              <div style={{ fontSize: 11, color: '#999' }}>时长</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#333' }}>{formatDuration(status?.duration_seconds || 0)}</div>
            </div>
          </div>

          {/* 建图状态 */}
          {statusError ? (
            <Tag color="red">⚠️ {statusError}</Tag>
          ) : mapConflict ? (
            <Tag color="orange">⚠️ {mapConflict} 正在建图</Tag>
          ) : (
            <Tag color={statusConfig.color} style={{ marginLeft: 8 }}>
              {statusConfig.text}
            </Tag>
          )}
          {!rosConnected && (
            <Tag color="orange">点云预览未连接 ROS</Tag>
          )}
        </Space>

        {/* 右侧：操作按钮 */}
        <Space size={8}>
          {/* 开始/停止 建图按钮 */}
          {isProcessing ? (
            <Button
              danger
              icon={<StopOutlined />}
              onClick={handleStopWithConfirm}
              loading={loading}
              disabled={loading}
              style={{ height: 36 }}
            >
              停止建图
            </Button>
          ) : (
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={handleStart}
              loading={loading}
              disabled={loading || !!mapConflict}
              style={{ height: 36 }}
            >
              开始建图
            </Button>
          )}
          
          {/* 关闭按钮 - 处理中禁用 */}
          <Button
            icon={<CloseOutlined />}
            onClick={onClose}
            disabled={isProcessing}
            style={{ 
              height: 36,
              opacity: isProcessing ? 0.5 : 1,
            }}
          >
            关闭
          </Button>
        </Space>
      </div>
    </div>
  )
}

export default MappingControl
