/**
 * 导航服务控制 Tab
 * 启动/停止导航服务（ROS 节点组）
 */

import React, { useState, useEffect, useCallback } from 'react'
import { Card, Button, Space, Tag, message, Select, Divider, Alert, Descriptions, Statistic, Row, Col } from 'antd'
import {
  PlayCircleOutlined,
  StopOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ClockCircleOutlined,
  WifiOutlined,
  AimOutlined,
} from '@ant-design/icons'
import { navigationApi, mapsApi } from '../../api'

const NavigationTab = () => {
  const [status, setStatus] = useState(null)
  const [maps, setMaps] = useState([])
  const [selectedMap, setSelectedMap] = useState('睿程佑')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(false)

  // 加载地图列表
  const loadMaps = useCallback(async () => {
    try {
      const resp = await mapsApi.getMaps()
      setMaps(resp.maps || [])
      if (resp.maps && resp.maps.length > 0 && !selectedMap) {
        setSelectedMap(resp.maps[0].name)
      }
    } catch (error) {
      console.error('加载地图列表失败:', error)
    }
  }, [selectedMap])

  useEffect(() => {
    loadMaps()
    // 定期检查导航状态
    const interval = setInterval(checkStatus, 5000)
    return () => clearInterval(interval)
  }, [])

  // 检查导航状态
  const checkStatus = useCallback(async () => {
    try {
      const resp = await navigationApi.getStatus()
      if (resp.success) {
        setStatus(resp.status)
      }
    } catch (error) {
      console.error('获取导航状态失败:', error)
    }
  }, [])

  // 启动导航服务
  const handleStart = async () => {
    if (!selectedMap) {
      message.error('请先选择地图')
      return
    }
    setLoading(true)
    try {
      const resp = await navigationApi.startNavigation(selectedMap)
      if (resp.success) {
        message.success(`导航服务启动中：${selectedMap}`)
        await checkStatus()
      } else {
        message.error(resp.error || '启动失败')
      }
    } catch (error) {
      message.error(`启动失败：${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  // 停止导航服务
  const handleStop = async () => {
    setLoading(true)
    try {
      const resp = await navigationApi.stopNavigation()
      if (resp.success) {
        message.success('导航服务已停止')
        await checkStatus()
      } else {
        message.error(resp.error || '停止失败')
      }
    } catch (error) {
      message.error(`停止失败：${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  // 手动刷新状态
  const handleRefresh = async () => {
    setChecking(true)
    await checkStatus()
    setChecking(false)
  }

  // 获取状态配置
  const getStatusConfig = (s) => {
    switch (s) {
      case 'running':
        return { color: '#52c41a', text: '运行中', icon: <CheckCircleOutlined /> }
      case 'starting':
        return { color: '#faad14', text: '启动中', icon: <ClockCircleOutlined /> }
      case 'stopping':
        return { color: '#faad14', text: '停止中', icon: <ClockCircleOutlined /> }
      case 'error':
        return { color: '#ff4d4f', text: '错误', icon: <ExclamationCircleOutlined /> }
      default:
        return { color: '#d9d9d9', text: '空闲', icon: <ClockCircleOutlined /> }
    }
  }

  const statusConfig = status ? getStatusConfig(status.status) : getStatusConfig('idle')
  const isRunning = status?.status === 'running'
  const isTransitioning = ['starting', 'stopping'].includes(status?.status)

  // 格式化时长
  const formatDuration = (seconds) => {
    if (!seconds) return '00:00:00'
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div style={{ padding: 0 }}>
      {/* 状态卡片 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={16} align="middle">
          <Col span={6}>
            <Statistic
              title="导航服务状态"
              value={statusConfig.text}
              prefix={statusConfig.icon}
              valueStyle={{ color: statusConfig.color }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="当前地图"
              value={status?.map_name || '—'}
              prefix={<AimOutlined />}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="定位状态"
              value={status?.localization_status === 'ok' ? '已定位' : status?.localization_status === 'initializing' ? '定位中' : '未定位'}
              prefix={<WifiOutlined />}
              valueStyle={{ color: status?.localization_status === 'ok' ? '#52c41a' : status?.localization_status === 'initializing' ? '#faad14' : '#d9d9d9' }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="运行时长"
              value={formatDuration(status?.duration_seconds)}
              prefix={<ClockCircleOutlined />}
            />
          </Col>
        </Row>
      </Card>

      {/* 互斥警告 */}
      {status?.status !== 'idle' && (
        <Alert
          type="info"
          message="导航服务运行中，请前往导航页面进行路径规划与任务执行。"
          style={{ marginBottom: 16 }}
          showIcon
        />
      )}

      {/* 控制面板 */}
      <Card size="small" title="导航服务控制">
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {/* 地图选择 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 500 }}>选择地图：</span>
            <Select
              value={selectedMap}
              onChange={setSelectedMap}
              style={{ width: 200 }}
              disabled={isRunning || isTransitioning}
            >
              {maps.map(m => (
                <Select.Option key={m.name} value={m.name}>{m.name}</Select.Option>
              ))}
            </Select>
          </div>

          <Divider style={{ margin: '8px 0' }} />

          {/* 操作按钮 */}
          <Space>
            {isRunning ? (
              <Button
                danger
                type="primary"
                icon={<StopOutlined />}
                onClick={handleStop}
                loading={loading}
                size="large"
              >
                停止导航服务
              </Button>
            ) : (
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={handleStart}
                loading={loading}
                disabled={isTransitioning || !selectedMap}
                size="large"
              >
                启动导航服务
              </Button>
            )}
            <Button
              icon={<ClockCircleOutlined />}
              onClick={handleRefresh}
              loading={checking}
            >
              刷新状态
            </Button>
          </Space>
        </Space>
      </Card>

      {/* 说明 */}
      <Alert
        type="warning"
        message="注意"
        description="建图服务与导航服务互斥，不可同时运行。启动导航服务前请确保已停止建图服务。"
        style={{ marginTop: 16 }}
        showIcon
      />
    </div>
  )
}

export default NavigationTab
