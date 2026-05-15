import React, { useState, useEffect } from 'react'
import { Row, Col, Tag, Space, Divider } from 'antd'
import {
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  WifiOutlined,
  ThunderboltOutlined,
  SignalFilled,
  DashboardOutlined,
} from '@ant-design/icons'
import rosInstance from '../utils/ros'

interface SystemHeaderProps {
  showROS?: boolean
  showBattery?: boolean
  showGPS?: boolean
  showMode?: boolean
}

const SystemHeader: React.FC<SystemHeaderProps> = ({
  showROS = true,
  showBattery = true,
  showGPS = true,
  showMode = true,
}) => {
  const [rosConnected, setRosConnected] = useState(false)
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null)
  const [gpsSignal, setGpsSignal] = useState<'excellent' | 'good' | 'poor' | 'none'>('none')
  const [starCount, setStarCount] = useState<number>(0)
  const [vehicleMode, setVehicleMode] = useState<'auto' | 'manual'>('auto')

  // ROS 连接状态
  useEffect(() => {
    const handleStatusChange = (status: { connected: boolean }) => {
      try {
        setRosConnected(status.connected)
      } catch (error) {
        console.error('[SystemHeader] 更新 ROS 状态失败:', error)
      }
    }
    
    // 注册状态回调
    rosInstance.registerStatusCallback(handleStatusChange)
    
    // 如果未连接，尝试连接
    if (!rosInstance.isConnected()) {
      rosInstance.connect().catch((error) => {
        console.error('[SystemHeader] ROS 连接失败:', error)
      })
    }
    
    // 清理回调
    return () => {
      try {
        rosInstance.unregisterStatusCallback(handleStatusChange)
      } catch (error) {
        console.error('[SystemHeader] 清理回调失败:', error)
      }
    }
  }, [])

  // 订阅 ROS 话题获取真实数据
  useEffect(() => {
    console.log('[SystemHeader] useEffect triggered, rosConnected:', rosConnected)
    
    if (!rosConnected) {
      console.log('[SystemHeader] Skipping subscription: not connected')
      return
    }

    // 延迟执行订阅，确保 ROS 状态已更新
    const unsubs: Array<(() => void) | null> = []
    const timer = setTimeout(() => {
      if (!rosConnected) return

      const updateBatteryLevel = (msg: any) => {
        const value = msg?.SOC ?? msg?.percentage ?? msg?.data
        const numericValue = Number(value)
        if (Number.isFinite(numericValue)) {
          setBatteryLevel(Math.round(numericValue))
        }
      }
      
      // 订阅电量话题
      try {
        unsubs.push(rosInstance.subscribe('/battery_state', updateBatteryLevel, 'ranger_msgs/RangerBmsStatus'))
        unsubs.push(rosInstance.subscribe('/battery_status', updateBatteryLevel, 'std_msgs/Float32'))
      } catch (error) {
        console.error('[SystemHeader] Battery subscription error:', error)
      }

      // 订阅 GPS 话题获取定位状态
      try {
        unsubs.push(rosInstance.subscribe('/gps/fix', (msg: any) => {
          if (msg?.status?.status === 2) {
            setGpsSignal('excellent')
          } else if (msg?.status?.status === 1) {
            setGpsSignal('good')
          } else if (msg?.status?.status === 0) {
            setGpsSignal('poor')
          } else {
            setGpsSignal('none')
          }
        }, 'sensor_msgs/NavSatFix'))
      } catch (error) {
        console.error('[SystemHeader] GPS fix subscription error:', error)
      }

      // 订阅星数话题
      try {
        unsubs.push(rosInstance.subscribe('/gps/satellites', (msg: any) => {
          if (msg?.data != null) {
            setStarCount(msg.data)
          }
        }, 'std_msgs/UInt16'))
      } catch (error) {
        console.error('[SystemHeader] Satellites subscription error:', error)
      }
    }, 100)

    return () => {
      clearTimeout(timer)
      unsubs.forEach((unsub) => {
        if (unsub) unsub()
      })
      console.log('[SystemHeader] Timer cleared')
    }
  }, [rosConnected])

  const getSignalColor = (signal: string) => {
    switch (signal) {
      case 'excellent': return '#52c41a'
      case 'good': return '#1890ff'
      case 'poor': return '#faad14'
      default: return '#d9d9d9'
    }
  }

  const getSignalIcon = (signal: string) => {
    return <SignalFilled style={{ color: getSignalColor(signal) }} />
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginLeft: 24 }}>
      <Row gutter={16} align="middle">
        {/* ROS 连接状态 */}
        {showROS && (
          <Col>
            <Space>
              {rosConnected ? (
                <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 18 }} />
              ) : (
                <ExclamationCircleOutlined style={{ color: '#faad14', fontSize: 18 }} />
              )}
              <span style={{ fontSize: 14, fontWeight: 500 }}>
                ROS: {rosConnected ? '已连接' : '未连接'}
              </span>
            </Space>
            <Divider type="vertical" style={{ height: 24 }} />
          </Col>
        )}

        {/* 电量显示 */}
        {showBattery && (
          <Col>
            <Space>
              <ThunderboltOutlined style={{ fontSize: 16, color: batteryLevel === null ? '#8c8c8c' : batteryLevel > 50 ? '#52c41a' : batteryLevel > 30 ? '#faad14' : '#ff4d4f' }} />
              <span style={{ fontSize: 14 }}>
                电量：{batteryLevel !== null ? `${Math.round(batteryLevel)}%` : '--'}
              </span>
            </Space>
            <Divider type="vertical" style={{ height: 24 }} />
          </Col>
        )}

        {/* GPS 信号 */}
        {showGPS && (
          <Col>
            <Space>
              {getSignalIcon(gpsSignal)}
              <span style={{ fontSize: 14 }}>
                GPS: {gpsSignal === 'excellent' ? '优' : gpsSignal === 'good' ? '良' : gpsSignal === 'poor' ? '差' : '无'}
              </span>
              <span style={{ fontSize: 12, color: '#888' }}>
                ⭐ {starCount}
              </span>
            </Space>
            <Divider type="vertical" style={{ height: 24 }} />
          </Col>
        )}

        {/* 车辆模式 */}
        {showMode && (
          <Col>
            <Space>
              <DashboardOutlined style={{ fontSize: 16, color: '#1890ff' }} />
              <span style={{ fontSize: 14 }}>
                模式：{vehicleMode === 'auto' ? '自动' : '手动'}
              </span>
            </Space>
          </Col>
        )}
      </Row>
    </div>
  )
}

export default SystemHeader
