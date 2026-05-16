import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Card, Col, Row, Space, Statistic, Tag, Timeline, Typography, message } from 'antd'
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  PlayCircleOutlined,
  RadarChartOutlined,
  ReloadOutlined,
  StopOutlined,
} from '@ant-design/icons'
import { lidarLocalizationApi, type LidarLocalizationStatus } from '../api'

interface LidarLocalizationControlProps {
  mapName: string
}

const phaseText: Record<string, string> = {
  idle: '空闲',
  queued: '等待启动',
  starting_lidar: '启动雷达',
  starting_imu: '启动 IMU',
  starting_localization: '启动定位',
  running: '运行中',
  stopping: '停止中',
  error: '异常',
}

const LidarLocalizationControl: React.FC<LidarLocalizationControlProps> = ({ mapName }) => {
  const [status, setStatus] = useState<LidarLocalizationStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [logs, setLogs] = useState<Array<{ time: string; message: string; type: 'info' | 'success' | 'warning' | 'error' }>>([])
  const logKeyRef = useRef('')

  const addLog = useCallback((text: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    const time = new Date().toLocaleTimeString('zh-CN')
    setLogs((prev) => [...prev, { time, message: text, type }].slice(-100))
  }, [])

  const loadStatus = useCallback(async () => {
    if (!mapName) return
    try {
      const response = await lidarLocalizationApi.getStatus(mapName)
      setStatus(response.status)
      setStatusError(null)

      const logText = (response.status.log || '').trim()
      if (logText && logText !== logKeyRef.current) {
        logKeyRef.current = logText
        const lastLine = logText.split('\n').filter(Boolean).slice(-1)[0]
        if (lastLine) addLog(lastLine, response.status.status === 'error' ? 'error' : 'info')
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

  const isStarting = status?.status === 'starting'
  const isRunning = status?.status === 'running'
  const isStopping = status?.status === 'stopping'
  const canStart = !!status?.has_lidar_map && !isStarting && !isRunning && !isStopping

  const statusTag = useMemo(() => {
    if (isRunning) return <Tag color="green" icon={<CheckCircleOutlined />}>定位运行中</Tag>
    if (isStarting || isStopping) return <Tag color="processing" icon={<ClockCircleOutlined />}>{phaseText[status?.phase || ''] || '处理中'}</Tag>
    if (status?.status === 'error') return <Tag color="red">异常</Tag>
    return <Tag color="default">未启动</Tag>
  }, [isRunning, isStarting, isStopping, status?.phase, status?.status])

  const handleStart = async () => {
    setLoading(true)
    try {
      await lidarLocalizationApi.start(mapName)
      message.success('雷达定位启动请求已发送')
      addLog('雷达定位启动请求已发送', 'info')
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
      await lidarLocalizationApi.stop()
      message.success('雷达定位已停止')
      addLog('雷达定位已停止', 'warning')
      await loadStatus()
    } catch (error: any) {
      message.error(`停止失败：${error.message}`)
      addLog(`停止失败：${error.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: 16, gap: 12, overflow: 'hidden' }}>
      <Card size="small">
        <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
          <Space>
            <RadarChartOutlined />
            <span style={{ fontWeight: 600 }}>雷达定位</span>
            {statusTag}
          </Space>
          <Space wrap>
            <Button icon={<ReloadOutlined />} onClick={loadStatus} loading={loading}>
              刷新
            </Button>
            {isRunning || isStarting || isStopping ? (
              <Button danger icon={<StopOutlined />} onClick={handleStop} loading={loading || isStopping}>
                停止定位
              </Button>
            ) : (
              <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleStart} disabled={!canStart} loading={loading}>
                启动定位
              </Button>
            )}
          </Space>
        </Space>
      </Card>

      {!status?.has_lidar_map && (
        <Alert
          type="warning"
          showIcon
          message="该地图还没有可用于雷达定位的 LiDAR 地图"
          description="需要先完成雷达建图并保存，生成 lidar/pose.json 和 lidar/pcd/ 后才能启动定位。"
        />
      )}

      {statusError && <Alert type="error" showIcon message="雷达定位状态读取失败" description={statusError} />}
      {status?.error_message && <Alert type="error" showIcon message="雷达定位异常" description={status.error_message} />}

      <Row gutter={[12, 12]}>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="雷达" value={status?.lidar_ready || status?.lidar_running ? '已就绪' : '未就绪'} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="IMU" value={status?.imu_ready || status?.imu_running ? '已就绪' : '未就绪'} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="/Odometry" value={status?.localization_ready ? '有输出' : '无输出'} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="运行时长" value={status?.duration_seconds || 0} suffix="s" />
          </Card>
        </Col>
      </Row>

      <Card size="small" title="输入地图" style={{ flexShrink: 0 }}>
        <Typography.Text code>{status?.map_file_path || '--'}</Typography.Text>
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

export default LidarLocalizationControl
