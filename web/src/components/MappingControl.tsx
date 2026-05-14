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
  
  // 使用全局 ROS 实例 (单例共享)
  const { ros, connected: rosConnected } = useRos()
  
  const [status, setStatus] = useState<MappingStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [frameRate, setFrameRate] = useState(0)
  const [logs, setLogs] = useState<Array<{ time: string; message: string; type: 'info' | 'success' | 'warning' | 'error' }>>([])
  const logsEndRef = useRef<HTMLDivElement>(null)
  
  // ROS 连接状态
  const [rosError, setRosError] = useState<string | null>(null)  // ROS 断开错误
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
      addLog(`建图请求已发送，等待 ROS 状态更新...`, 'info')
      
      // 等待 ROS 状态变化为 running（最多等待 30 秒）
      // 状态更新通过 ROS 订阅自动完成，这里用定时器检查
      let waitTime = 0
      const checkInterval = setInterval(() => {
        waitTime += 500
        console.log('[handleStart] 检查状态...', status?.status, waitTime)
        
        if (status?.status === 'running') {
          clearInterval(checkInterval)
          message.success(`建图任务已启动：${mapToUse}`)
          addLog(`建图任务已开始`, 'success')
          setLoading(false)
        } else if (waitTime >= 30000) {
          clearInterval(checkInterval)
          message.warning('建图启动超时，请检查 ROS 状态')
          addLog('建图启动超时', 'warning')
          setLoading(false)
        }
      }, 500)
      
    } catch (error: any) {
      console.error('建图启动失败:', error)
      message.error(`启动失败：${error.message}`)
      addLog(`启动失败：${error.message}`, 'error')
    }
  }

  // 停止建图
  const handleStop = async () => {
    setLoading(true)
    try {
      await mappingApi.stopMapping()
      message.success('建图任务已停止')
      addLog('建图任务已停止', 'warning')
      // 状态通过 ROS 订阅自动更新，无需轮询
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

  // ROS 订阅唯一数据源（无 HTTP 轮询）
  useEffect(() => {
    console.log('[MappingControl] ROS 订阅 effect: rosConnected=', rosConnected)
    
    let stateUnsubscribe: (() => void) | null = null
    let lastStatus: string | null = null
    
    const subscribeToState = () => {
      if (!rosConnected || !ros || typeof ros.subscribe !== 'function') {
        console.log('[MappingControl] ROS 未连接，显示错误')
        setRosError('ROS 连接断开，请等待...')
        setStatus(null)
        // 等待 1 秒重试
        setTimeout(subscribeToState, 1000)
        return
      }
      
      // ROS 已连接，清除错误
      setRosError(null)
      console.log('[MappingControl] 订阅状态话题：/mapping/state_unavailable')
      
      stateUnsubscribe = ros.subscribe('/mapping/state_unavailable', (msg: any) => {
        console.log('[MappingControl] 收到状态:', msg.data)
        
        // ROS 恢复连接，清除错误
        if (rosError) {
          setRosError(null)
          addLog('ROS 连接已恢复', 'success')
        }
        
        try {
          const state = JSON.parse(msg.data)
          
          // 检查地图冲突：其他地图正在建图
          if (state.status === 'running' && state.map_name && state.map_name !== effectiveMapName) {
            setMapConflict(state.map_name)
            setStatus(state)
            return
          }
          
          // 本地图在建图或有数据，清除冲突
          setMapConflict(null)
          setStatus(state)
          
          // 状态变化日志
          if (state.status === 'running' && lastStatus !== 'running') {
            addLog('建图任务已开始', 'success')
          } else if (state.status === 'saving') {
            addLog('正在保存地图...', 'info')
          } else if (state.status === 'saved') {
            addLog('地图已保存', 'info')
          } else if (state.status === 'converting') {
            addLog('正在生成栅格地图...', 'info')
          } else if (state.status === 'completed' && lastStatus !== 'completed') {
            addLog('✅ 建图完成！地图已保存，栅格地图已生成', 'success')
          } else if (state.status === 'error' && lastStatus !== 'error') {
            addLog(state.error_message || '建图出错', 'error')
          } else if (state.status === 'idle' && lastStatus === 'running') {
            addLog('建图任务已停止', 'warning')
          }
          
          lastStatus = state.status
        } catch (error) {
          console.error('[MappingControl] 解析状态消息失败:', error)
        }
      })
    }
    
    // 延迟订阅确保 ROS 连接稳定
    setTimeout(subscribeToState, 500)

    return () => {
      if (stateUnsubscribe) {
        stateUnsubscribe()
      }
    }
  }, [rosConnected, ros, effectiveMapName, addLog, rosError])

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
        return { color: '#faad14', text: '启动中', icon: <ClockCircleOutlined /> }
      default:
        return { color: '#d9d9d9', text: '空闲', icon: <ClockCircleOutlined /> }
    }
  }

  const statusConfig = status ? getStatusConfig(status.status) : getStatusConfig('idle')

  // 是否正在建图或处理中（保存/栅格化）
  const isProcessing = ['running', 'saving', 'saved', 'converting'].includes(status?.status || '')

  // 停止建图确认
  const handleStopWithConfirm = () => {
    Modal.confirm({
      title: '停止建图',
      content: '是否保存本次建图数据？保存将覆盖原有地图数据。',
      okText: '保存',
      cancelText: '不保存',
      okType: 'primary',
      onOk: async () => {
        // 保存并停止
        try {
          await mappingApi.saveMap()
          message.success('地图已保存')
          addLog('地图已保存', 'success')
        } catch (error: any) {
          message.error(`保存失败：${error.message}`)
          addLog(`保存失败：${error.message}`, 'error')
        }
        // 执行停止
        handleStop()
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
          {rosError ? (
            <Tag color="red">⚠️ {rosError}</Tag>
          ) : mapConflict ? (
            <Tag color="orange">⚠️ {mapConflict} 正在建图</Tag>
          ) : (
            <Tag color={statusConfig.color} style={{ marginLeft: 8 }}>
              {statusConfig.text}
            </Tag>
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
              disabled={loading || !!rosError}
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
              disabled={loading || !!rosError || !!mapConflict}
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
