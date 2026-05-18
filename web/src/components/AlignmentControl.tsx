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
import { useRos } from '../hooks/useRos'

interface AlignmentControlProps {
  mapName: string
}

interface OdomSample {
  topic: string
  x: number
  y: number
  z: number
  yawDeg: number | null
  stampText: string
  receivedAt: number
}

interface VerificationSnapshot {
  rtk: OdomSample | null
  lidar: OdomSample | null
  now: number
}

const formatMetric = (value?: number | null, suffix = '') => {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return '--'
  return `${Number(value).toFixed(2)}${suffix}`
}

const formatCoord = (value?: number | null) => {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return '--'
  return Number(value).toFixed(2)
}

const formatAge = (sample: OdomSample | null, now: number) => {
  if (!sample) return '--'
  return `${Math.max(0, (now - sample.receivedAt) / 1000).toFixed(1)}s`
}

const normalizeDeg = (deg: number) => {
  let value = deg
  while (value > 180) value -= 360
  while (value < -180) value += 360
  return value
}

const yawFromQuaternion = (orientation: any): number | null => {
  if (!orientation) return null
  const x = Number(orientation.x || 0)
  const y = Number(orientation.y || 0)
  const z = Number(orientation.z || 0)
  const w = Number(orientation.w || 1)
  const norm = Math.sqrt(x * x + y * y + z * z + w * w)
  if (norm < 0.5) return null
  const nx = x / norm
  const ny = y / norm
  const nz = z / norm
  const nw = w / norm
  const sinyCosp = 2 * (nw * nz + nx * ny)
  const cosyCosp = 1 - 2 * (ny * ny + nz * nz)
  return normalizeDeg(Math.atan2(sinyCosp, cosyCosp) * 180 / Math.PI)
}

const stampToText = (stamp: any) => {
  const secs = Number(stamp?.secs ?? stamp?.sec ?? 0)
  const nsecs = Number(stamp?.nsecs ?? stamp?.nanosec ?? 0)
  if (!secs && !nsecs) return '--'
  return `${secs}.${String(Math.floor(nsecs / 1000000)).padStart(3, '0')}`
}

const odomToSample = (topic: string, msg: any): OdomSample | null => {
  const pose = msg?.pose?.pose
  const position = pose?.position
  if (!position) return null
  const x = Number(position.x)
  const y = Number(position.y)
  const z = Number(position.z || 0)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return {
    topic,
    x,
    y,
    z,
    yawDeg: yawFromQuaternion(pose.orientation),
    stampText: stampToText(msg?.header?.stamp),
    receivedAt: Date.now(),
  }
}

const AlignmentControl: React.FC<AlignmentControlProps> = ({ mapName }) => {
  const { ros, connected: rosConnected } = useRos()
  const [status, setStatus] = useState<AlignmentStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [logs, setLogs] = useState<Array<{ time: string; message: string; type: 'info' | 'success' | 'warning' | 'error' }>>([])
  const [verification, setVerification] = useState<VerificationSnapshot>({ rtk: null, lidar: null, now: Date.now() })
  const logKeyRef = useRef('')
  const latestRtkRef = useRef<OdomSample | null>(null)
  const latestLidarRef = useRef<OdomSample | null>(null)

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

  useEffect(() => {
    if (!rosConnected) {
      latestRtkRef.current = null
      latestLidarRef.current = null
      setVerification({ rtk: null, lidar: null, now: Date.now() })
      return
    }

    const unsubscribeRtk = ros.subscribe('/odometry/rtk', (msg: any) => {
      latestRtkRef.current = odomToSample('/odometry/rtk', msg)
    }, 'nav_msgs/Odometry')

    const unsubscribeLidar = ros.subscribe('/odometry/lidar_in_rtk', (msg: any) => {
      latestLidarRef.current = odomToSample('/odometry/lidar_in_rtk', msg)
    }, 'nav_msgs/Odometry')

    const timer = setInterval(() => {
      setVerification({
        rtk: latestRtkRef.current,
        lidar: latestLidarRef.current,
        now: Date.now(),
      })
    }, 500)

    return () => {
      unsubscribeRtk?.()
      unsubscribeLidar?.()
      clearInterval(timer)
    }
  }, [ros, rosConnected])

  const result = status?.result
  const coordinateSystem = result?.coordinate_system || status?.requirements
  const isCalibrating = status?.calibration_running
  const isRuntime = status?.runtime_running
  const canStartRuntime = !!status?.has_alignment && !isRuntime
  const rtkSample = verification.rtk
  const lidarSample = verification.lidar
  const verificationDelta = useMemo(() => {
    if (!rtkSample || !lidarSample) return null
    const dx = lidarSample.x - rtkSample.x
    const dy = lidarSample.y - rtkSample.y
    const dz = lidarSample.z - rtkSample.z
    const yawError = rtkSample.yawDeg !== null && lidarSample.yawDeg !== null
      ? normalizeDeg(lidarSample.yawDeg - rtkSample.yawDeg)
      : null
    return {
      dx,
      dy,
      dz,
      distance: Math.hypot(dx, dy),
      yawError,
    }
  }, [rtkSample, lidarSample])
  const yawErrorAbs = verificationDelta?.yawError == null ? null : Math.abs(verificationDelta.yawError)

  const isFresh = (sample: OdomSample | null) => !!sample && verification.now - sample.receivedAt < 3000

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
            <span style={{ fontWeight: 600 }}>RTK-LiDAR 坐标对齐（UTM）</span>
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
      <Alert
        type="info"
        showIcon
        message="当前流程使用 RTK UTM 作为对齐基准"
        description="请先在已有 GPS 地图中完成建图并保存点云。采集会使用 /odometry/rtk 与 /Odometry 计算 LiDAR 到 UTM 的变换，验证时发布 /odometry/lidar_in_rtk。"
      />

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
            <span>目标: {(coordinateSystem?.type || coordinateSystem?.target_coordinate_system || 'UTM').toString().toUpperCase()}</span>
            <span>yaw: {formatMetric(result.rotation?.yaw_deg, '°')}</span>
            <span>UTM x: {formatMetric(result.translation?.x, 'm')}</span>
            <span>UTM y: {formatMetric(result.translation?.y, 'm')}</span>
            <span>max: {formatMetric(result.max_error_m, 'm')}</span>
          </Space>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚未生成 rtk_lidar.yaml" />
        )}
      </Card>

      <Card
        size="small"
        title={
          <Space>
            <span>实时验证</span>
            <Tag color={rosConnected ? 'green' : 'orange'}>{rosConnected ? 'ROS 已连接' : 'ROS 未连接'}</Tag>
            {isRuntime && <Tag color="blue">验证运行中</Tag>}
          </Space>
        }
        style={{ flexShrink: 0 }}
      >
        <Row gutter={[12, 12]}>
          <Col xs={24} md={8}>
            <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 12, minHeight: 118 }}>
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 600 }}>/odometry/rtk</span>
                <Tag color={isFresh(rtkSample) ? 'green' : 'default'}>
                  {isFresh(rtkSample) ? '有数据' : '无数据'}
                </Tag>
              </Space>
              <div style={{ marginTop: 10, fontSize: 13, color: '#555', lineHeight: 1.8 }}>
                <div>x: {formatCoord(rtkSample?.x)} m</div>
                <div>y: {formatCoord(rtkSample?.y)} m</div>
                <div>yaw: {formatMetric(rtkSample?.yawDeg, '°')}</div>
                <div style={{ color: '#999' }}>延迟: {formatAge(rtkSample, verification.now)} | stamp: {rtkSample?.stampText || '--'}</div>
              </div>
            </div>
          </Col>

          <Col xs={24} md={8}>
            <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 12, minHeight: 118 }}>
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 600 }}>/odometry/lidar_in_rtk</span>
                <Tag color={isFresh(lidarSample) ? 'green' : 'default'}>
                  {isFresh(lidarSample) ? '有数据' : '无数据'}
                </Tag>
              </Space>
              <div style={{ marginTop: 10, fontSize: 13, color: '#555', lineHeight: 1.8 }}>
                <div>x: {formatCoord(lidarSample?.x)} m</div>
                <div>y: {formatCoord(lidarSample?.y)} m</div>
                <div>yaw: {formatMetric(lidarSample?.yawDeg, '°')}</div>
                <div style={{ color: '#999' }}>延迟: {formatAge(lidarSample, verification.now)} | stamp: {lidarSample?.stampText || '--'}</div>
              </div>
            </div>
          </Col>

          <Col xs={24} md={8}>
            <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 12, minHeight: 118 }}>
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 600 }}>对比误差</span>
                <Tag color={verificationDelta ? (verificationDelta.distance <= 1.0 ? 'green' : 'orange') : 'default'}>
                  {verificationDelta ? '已计算' : '等待数据'}
                </Tag>
              </Space>
              <div style={{ marginTop: 10, fontSize: 13, color: '#555', lineHeight: 1.8 }}>
                <div>平面距离: {formatMetric(verificationDelta?.distance, 'm')}</div>
                <div>dx: {formatMetric(verificationDelta?.dx, 'm')} | dy: {formatMetric(verificationDelta?.dy, 'm')}</div>
                <div>航向差: {formatMetric(yawErrorAbs, '°')}</div>
                <div style={{ color: '#999' }}>LiDAR 转换后应与 RTK 同为 UTM 坐标</div>
              </div>
            </div>
          </Col>
        </Row>
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
