import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Card, Col, Empty, Row, Space, Statistic, Tag, Timeline, message } from 'antd'
import {
  AimOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  StopOutlined,
} from '@ant-design/icons'
import { alignmentApi, type AlignmentStatus } from '../api'

interface AlignmentControlProps {
  mapName: string
}

const formatMetric = (value?: number | null, suffix = '') => {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return '--'
  return `${Number(value).toFixed(2)}${suffix}`
}

const AlignmentControl: React.FC<AlignmentControlProps> = ({ mapName }) => {
  const [status, setStatus] = useState<AlignmentStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [logs, setLogs] = useState<Array<{ time: string; message: string; type: 'info' | 'success' | 'warning' | 'error' }>>([])
  const logKeyRef = useRef('')

  const addLog = useCallback((text: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    const time = new Date().toLocaleTimeString('zh-CN')
    setLogs((prev) => [...prev, { time, message: text, type }].slice(-80))
  }, [])

  const loadStatus = useCallback(async () => {
    if (!mapName) return
    try {
      const response = await alignmentApi.getStatus(mapName)
      setStatus(response.status)
      setStatusError(null)

      const logText = `${response.status.calibration_log || ''}\n${response.status.runtime_log || ''}`.trim()
      if (logText && logText !== logKeyRef.current) {
        logKeyRef.current = logText
        const lastLine = logText.split('\n').filter(Boolean).slice(-1)[0]
        if (lastLine) addLog(lastLine, response.status.status === 'aligned' ? 'success' : 'info')
      }
    } catch (error: any) {
      setStatusError(error.message)
    }
  }, [addLog, mapName])

  useEffect(() => {
    loadStatus()
    const timer = setInterval(loadStatus, 2000)
    return () => clearInterval(timer)
  }, [loadStatus])

  const result = status?.result
  const isCalibrating = status?.calibration_running
  const isRuntime = status?.runtime_running
  const canStartRuntime = !!status?.has_alignment && !isRuntime

  const statusTag = useMemo(() => {
    if (isCalibrating) return <Tag color="processing" icon={<ClockCircleOutlined />}>采集中</Tag>
    if (isRuntime) return <Tag color="blue" icon={<PlayCircleOutlined />}>验证运行中</Tag>
    if (status?.has_alignment) return <Tag color="green" icon={<CheckCircleOutlined />}>已对齐</Tag>
    return <Tag color="default">未对齐</Tag>
  }, [isCalibrating, isRuntime, status?.has_alignment])

  const handleStart = async () => {
    setLoading(true)
    try {
      await alignmentApi.startCalibration(mapName)
      message.success('坐标对齐采集已开始')
      addLog('坐标对齐采集已开始', 'info')
      await loadStatus()
    } catch (error: any) {
      message.error(`启动失败：${error.message}`)
      addLog(`启动失败：${error.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleStop = async () => {
    setLoading(true)
    try {
      await alignmentApi.stopCalibration(mapName)
      message.success('坐标对齐采集已停止')
      addLog('坐标对齐采集已停止，正在读取标定结果', 'warning')
      await loadStatus()
    } catch (error: any) {
      message.error(`停止失败：${error.message}`)
      addLog(`停止失败：${error.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleStartRuntime = async () => {
    setLoading(true)
    try {
      await alignmentApi.startRuntime(mapName)
      message.success('对齐验证已启动')
      addLog('对齐验证已启动：发布 map->camera_init 和 /odometry/lidar_in_rtk', 'success')
      await loadStatus()
    } catch (error: any) {
      message.error(`启动验证失败：${error.message}`)
      addLog(`启动验证失败：${error.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleStopRuntime = async () => {
    setLoading(true)
    try {
      await alignmentApi.stopRuntime(mapName)
      message.success('对齐验证已停止')
      addLog('对齐验证已停止', 'warning')
      await loadStatus()
    } catch (error: any) {
      message.error(`停止验证失败：${error.message}`)
      addLog(`停止验证失败：${error.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: 16, gap: 12, overflow: 'hidden' }}>
      <Card size="small">
        <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
          <Space>
            <AimOutlined />
            <span style={{ fontWeight: 600 }}>RTK-LiDAR 坐标对齐</span>
            {statusTag}
          </Space>
          <Space wrap>
            <Button icon={<ReloadOutlined />} onClick={loadStatus} loading={loading}>
              刷新
            </Button>
            {isCalibrating ? (
              <Button danger icon={<StopOutlined />} onClick={handleStop} loading={loading}>
                停止并计算
              </Button>
            ) : (
              <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleStart} loading={loading}>
                开始采集
              </Button>
            )}
            {isRuntime ? (
              <Button danger icon={<StopOutlined />} onClick={handleStopRuntime} loading={loading}>
                停止验证
              </Button>
            ) : (
              <Button icon={<PlayCircleOutlined />} onClick={handleStartRuntime} disabled={!canStartRuntime} loading={loading}>
                启动验证
              </Button>
            )}
          </Space>
        </Space>
      </Card>

      {statusError && <Alert type="error" showIcon message="坐标对齐状态读取失败" description={statusError} />}

      <Row gutter={[12, 12]}>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="采样点数" value={result?.num_pairs ?? 0} suffix="/ 30" />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="轨迹覆盖" value={formatMetric(result?.spatial_spread_m, 'm')} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="RMSE" value={formatMetric(result?.rmse_m, 'm')} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="航向检查误差" value={formatMetric(result?.yaw_check_error_deg, '°')} />
          </Card>
        </Col>
      </Row>

      <Card size="small" title="标定结果" style={{ flexShrink: 0 }}>
        {result ? (
          <Space size={16} wrap>
            <span>TF: {result.parent_frame || 'map'} -&gt; {result.child_frame || 'camera_init'}</span>
            <span>yaw: {formatMetric(result.rotation?.yaw_deg, '°')}</span>
            <span>x: {formatMetric(result.translation?.x, 'm')}</span>
            <span>y: {formatMetric(result.translation?.y, 'm')}</span>
            <span>max: {formatMetric(result.max_error_m, 'm')}</span>
          </Space>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚未生成 rtk_lidar.yaml" />
        )}
      </Card>

      <Card size="small" title="日志" style={{ flex: 1, minHeight: 0, overflow: 'hidden' }} bodyStyle={{ height: '100%', overflow: 'auto' }}>
        <Timeline
          items={logs.map((item) => ({
            color: item.type === 'error' ? 'red' : item.type === 'success' ? 'green' : item.type === 'warning' ? 'orange' : 'blue',
            children: (
              <span>
                <span style={{ color: '#999', marginRight: 8 }}>{item.time}</span>
                {item.message}
              </span>
            ),
          }))}
        />
      </Card>
    </div>
  )
}

export default AlignmentControl
