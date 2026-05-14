/**
 * 导航控制页面
 * 支持三种地图类型：LOCAL / GPS / FUSION
 * 使用全局 ROS 单例连接真实 ROS 话题
 */

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Card, Button, Space, Row, Col, Statistic, Tag, message, Select, Divider } from 'antd'
import {
  AimOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  StopOutlined,
  WarningOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import SystemHeader from '../components/SystemHeader'
import GPSMapView from '../components/GPSMapView'
import FusionMapView from '../components/FusionMapView'
import SimpleMapCanvas from '../components/SimpleMapCanvas'
import { mapsApi, pathApi } from '../api'
import rosInstance from '../utils/ros'

// 航点类型标签
const WaypointTypeTag = ({ type }) => {
  const colors = {
    waypoint: '#1890ff',
    work: '#fa8c16',
    charge: '#52c41a',
  }
  const labels = {
    waypoint: '途径点',
    work: '作业点',
    charge: '充电点',
  }
  return (
    <Tag color={colors[type] || '#1890ff'} style={{ marginRight: 4 }}>
      {labels[type] || '途径点'}
    </Tag>
  )
}

const NavPage = () => {
  const navigate = useNavigate()

  // ========== 状态定义 ==========
  // 地图相关
  const [maps, setMaps] = useState([])
  const [selectedMap, setSelectedMap] = useState('')
  const [mapConfig, setMapConfig] = useState(null)
  const [mapType, setMapType] = useState('local')
  const [mapConfigLoaded, setMapConfigLoaded] = useState(false)
  const [currentMapName, setCurrentMapName] = useState('')

  // 路径相关
  const [paths, setPaths] = useState([])
  const [selectedPathId, setSelectedPathId] = useState(null)
  const [loadingPaths, setLoadingPaths] = useState(false)

  // 机器人状态
  const [robotPosition, setRobotPosition] = useState({ x: 0, y: 0, z: 0, lat: 0, lng: 0, heading: 0 })
  const [navStatus, setNavStatus] = useState('idle') // idle, running, paused
  const [progress, setProgress] = useState(0)
  const [currentWaypointIdx, setCurrentWaypointIdx] = useState(0)
  const [speed, setSpeed] = useState(0)

  // 订阅管理
  const gpsUnsubRef = useRef(null)
  const headingUnsubRef = useRef(null)
  const odomUnsubRef = useRef(null)
  const navStateUnsubRef = useRef(null)
  const taskPubRef = useRef(null)

  // ========== 加载地图列表 ==========
  const loadMaps = useCallback(async () => {
    try {
      const resp = await mapsApi.getMaps()
      const opts = resp.maps.map(m => ({
        value: m.name,
        label: `${m.name} (${m.map_type || 'local'})`,
        map_type: m.map_type,
      }))
      setMaps(opts)
      
      // 自动加载当前地图
      if (resp.current_map) {
        console.log('[NavPage] 当前地图:', resp.current_map)
        setCurrentMapName(resp.current_map)
        setSelectedMap(resp.current_map)
      } else if (!selectedMap && opts.length > 0) {
        setSelectedMap(opts[0].value)
      }
    } catch (e) {
      console.error('加载地图列表失败:', e)
    }
  }, [selectedMap])

  // ========== 加载地图配置 ==========
  const loadMapConfig = useCallback(async (mapName) => {
    setMapConfigLoaded(false)
    try {
      const resp = await pathApi.getMapConfig(mapName)
      if (resp.success) {
        setMapConfig(resp.config)
        setMapType(resp.config.map_type || 'local')
        setMapConfigLoaded(true)
      }
    } catch (e) {
      console.error('加载地图配置失败:', e)
    }
  }, [])

  // ========== 加载路径 ==========
  const loadPaths = useCallback(async (mapName) => {
    setLoadingPaths(true)
    try {
      const resp = await pathApi.loadPath(mapName)
      if (resp.success) {
        setPaths(resp.paths || [])
        if (resp.paths && resp.paths.length > 0) {
          setSelectedPathId(resp.paths[0].id)
        }
      } else {
        setPaths([])
        setSelectedPathId(null)
      }
    } catch (e) {
      console.error('加载路径失败:', e)
      setPaths([])
      setSelectedPathId(null)
    } finally {
      setLoadingPaths(false)
    }
  }, [])

  // ========== ROS 连接和订阅 ==========
  useEffect(() => {
    // 连接 ROS
    if (!rosInstance.isConnected()) {
      rosInstance.connect().catch(err => {
        console.error('[NavPage] ROS 连接失败:', err)
        message.warning('ROS 连接失败，请检查网络')
      })
    }

    // 订阅导航状态
    navStateUnsubRef.current = rosInstance.subscribe('/navigation/state', (msg) => {
      if (msg) {
        setNavStatus(msg.status || 'idle')
        setProgress(msg.progress || 0)
        setCurrentWaypointIdx(msg.current_waypoint_idx || 0)
      }
    }, 'rtk_interfaces/TaskStatus')

    return () => {
      // 清理订阅
      gpsUnsubRef.current?.()
      odomUnsubRef.current?.()
      navStateUnsubRef.current?.()
    }
  }, [])

  // 根据地图类型订阅不同话题
  useEffect(() => {
    // 清理旧的订阅
    gpsUnsubRef.current?.()
    odomUnsubRef.current?.()

    const useGpsTopics = mapType === 'gps' || !selectedMap

    if (useGpsTopics) {
      // GPS 地图或未选择地图时：订阅 /gps/fix 获取经纬度
      gpsUnsubRef.current = rosInstance.subscribe('/gps/fix', (msg) => {
        if (msg) {
          setRobotPosition(prev => ({
            ...prev,
            lat: msg.latitude || 0,
            lng: msg.longitude || 0,
            alt: msg.altitude || 0,
          }))
        }
      }, 'sensor_msgs/NavSatFix')

      // GPS 地图：订阅 /gps/heading 获取航向
      headingUnsubRef.current = rosInstance.subscribe('/gps/heading', (msg) => {
        if (msg && msg.twist && msg.twist.twist && msg.twist.twist.angular) {
          // angular.z 是航向角（弧度）
          const headingRad = msg.twist.twist.angular.z
          const headingDeg = (headingRad * 180 / Math.PI + 360) % 360
          setRobotPosition(prev => ({
            ...prev,
            heading: headingDeg,
          }))
        }
      }, 'geometry_msgs/TwistWithCovarianceStamped')
    } else {
      // LOCAL/FUSION：订阅 /odom 获取世界坐标（Scout底盘原始里程计）
      odomUnsubRef.current = rosInstance.subscribe('/odom', (msg) => {
        if (msg && msg.pose && msg.pose.pose) {
          const pos = msg.pose.pose.position
          const ori = msg.pose.pose.orientation
          // 四元数转航向角（与 ros2d.js 的 rosQuaternionToGlobalTheta 一致）
          const heading = (-Math.atan2(
            2 * (ori.w * ori.z + ori.x * ori.y),
            1 - 2 * (ori.y * ori.y + ori.z * ori.z)
          ) * 180 / Math.PI)

          setRobotPosition(prev => ({
            ...prev,
            x: pos.x || 0,
            y: pos.y || 0,
            z: pos.z || 0,
            heading: heading,
          }))
        }
      }, 'nav_msgs/Odometry')
    }
  }, [mapType, selectedMap])

  // ========== 地图切换处理 ==========
  const handleMapChange = useCallback((mapName) => {
    setSelectedMap(mapName)
    setSelectedPathId(null)
    setPaths([])
    loadMapConfig(mapName)
    loadPaths(mapName)
  }, [loadMapConfig, loadPaths])

  // ========== 初始化加载 ==========
  useEffect(() => {
    loadMaps()
  }, [])

  useEffect(() => {
    if (selectedMap) {
      loadMapConfig(selectedMap)
      loadPaths(selectedMap)
    }
  }, [selectedMap, loadMapConfig, loadPaths])

  // ========== 导航控制 ==========
  const handleStart = useCallback(() => {
    const selectedPath = paths.find(p => p.id === selectedPathId)
    if (!selectedPath || !selectedPath.points || selectedPath.points.length === 0) {
      message.warning('请先选择有路径点的路径')
      return
    }

    // 构建导航任务 - 使用世界坐标 (x, y, z)
    const task = {
      header: {
        stamp: { secs: Math.floor(Date.now() / 1000), nsecs: 0 },
        frame_id: 'map',
      },
      repeat: false,
      taskid: `nav_${Date.now()}`,
      type: 'path_following',
      name: selectedPath.name,
      nodes: selectedPath.points.map((pt, idx) => ({
        nodetype: pt.waypointType === 'work' ? 'work_point' : 'waypoint',
        pose: {
          position: { x: pt.x || 0, y: pt.y || 0, z: pt.z || 0 },
          orientation: { x: 0, y: 0, z: 0, w: 1 },
        },
        distance_error: 0.5,
        yaw_error: 0.1,
        uniform_speed: 0,
      })),
    }

    // 发布导航任务
    if (taskPubRef.current) {
      taskPubRef.current.publish(task)
      message.success('导航任务已下发')
      setNavStatus('running')
      setProgress(0)
    } else {
      // 兼容：如果没有创建 publisher，使用 rosInstance 直接发布
      rosInstance.publish('/task', task, 'rtk_interfaces/Task')
      message.success('导航任务已下发 (兼容模式)')
      setNavStatus('running')
      setProgress(0)
    }
  }, [paths, selectedPathId])

  const handlePause = useCallback(() => {
    const task = {
      header: {
        stamp: { secs: Math.floor(Date.now() / 1000), nsecs: 0 },
        frame_id: 'map',
      },
      repeat: false,
      taskid: '',
      type: 'pause',
      name: '',
      nodes: [],
    }
    rosInstance.publish('/task', task, 'rtk_interfaces/Task')
    setNavStatus('paused')
    message.info('导航已暂停')
  }, [])

  const handleResume = useCallback(() => {
    const task = {
      header: {
        stamp: { secs: Math.floor(Date.now() / 1000), nsecs: 0 },
        frame_id: 'map',
      },
      repeat: false,
      taskid: '',
      type: 'resume',
      name: '',
      nodes: [],
    }
    rosInstance.publish('/task', task, 'rtk_interfaces/Task')
    setNavStatus('running')
    message.info('导航继续')
  }, [])

  const handleStop = useCallback(() => {
    const task = {
      header: {
        stamp: { secs: Math.floor(Date.now() / 1000), nsecs: 0 },
        frame_id: 'map',
      },
      repeat: false,
      taskid: '',
      type: 'stop',
      name: '',
      nodes: [],
    }
    rosInstance.publish('/task', task, 'rtk_interfaces/Task')
    setNavStatus('idle')
    setProgress(0)
    setCurrentWaypointIdx(0)
    message.warning('导航已停止')
  }, [])

  const handleEmergencyStop = useCallback(() => {
    // 发送急停指令
    const task = {
      header: {
        stamp: { secs: Math.floor(Date.now() / 1000), nsecs: 0 },
        frame_id: 'map',
      },
      repeat: false,
      taskid: '',
      type: 'abort',
      name: '',
      nodes: [],
    }
    rosInstance.publish('/task', task, 'rtk_interfaces/Task')
    setNavStatus('idle')
    setProgress(0)
    message.error('🛑 急停已触发！')
  }, [])

  // ========== 渲染地图 ==========
  const selectedPath = paths.find(p => p.id === selectedPathId)
  const pathPoints = selectedPath?.points || []

  const renderMap = () => {
    if (!selectedMap) {
      return (
        <GPSMapView
          mapInfo={{}}
          mode="preview"
          pathPoints={[]}
          robotPosition={{ lat: robotPosition.lat, lng: robotPosition.lng, heading: robotPosition.heading }}
          currentWaypointIdx={-1}
          emptyMessage="当前仅显示在线天地图底图；创建或选择 GPS 地图后显示地图原点和路径"
        />
      )
    }

    if (!mapConfigLoaded || !mapConfig) {
      return (
        <div style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#001529',
          color: '#fff',
          fontSize: 16,
        }}>
          加载地图配置中...
        </div>
      )
    }

    switch (mapType) {
      case 'local':
        return (
          <SimpleMapCanvas
            mapName={selectedMap}
            mapImageUrl={`/api/maps/${selectedMap}/map.png`}
            markers={pathPoints.map((pt, idx) => {
              let color = '#1890ff'
              if (pt.waypointType === 'work') color = '#fa8c16'
              else if (pt.waypointType === 'charge') color = '#52c41a'
              if (idx === 0) color = '#52c41a'
              else if (idx === pathPoints.length - 1) color = '#f5222d'
              return {
                id: pt.id,
                worldX: pt.x || 0,
                worldY: pt.y || 0,
                color,
                waypointType: pt.waypointType || 'waypoint'
              }
            })}
            mapConfig={mapConfig}
            robotPosition={{ x: robotPosition.x, y: robotPosition.y, heading: robotPosition.heading }}
            onMapClick={() => {}}
            onMarkerDrag={() => {}}
          />
        )
      case 'gps':
        return (
          <GPSMapView
            mapInfo={mapConfig}
            mode="planning"
            pathPoints={pathPoints.map(pt => ({
              id: pt.id,
              lat: pt.lat || 0,
              lng: pt.lng || 0,
              alt: pt.alt || 0,
              x: pt.x || 0,
              y: pt.y || 0,
              z: pt.z || 0,
              waypointType: pt.waypointType || 'waypoint',
            }))}
            onPathPointsChange={() => {}}
            robotPosition={{ lat: robotPosition.lat, lng: robotPosition.lng, heading: robotPosition.heading }}
            currentWaypointIdx={currentWaypointIdx}
          />
        )
      case 'fusion':
        return (
          <FusionMapView
            mapInfo={mapConfig}
            mode="planning"
            pathPoints={pathPoints.map(pt => ({
              id: pt.id,
              x: pt.x || 0,
              y: pt.y || 0,
              z: pt.z || 0,
              lat: pt.lat,
              lng: pt.lng,
              alt: pt.alt,
              waypointType: pt.waypointType || 'waypoint',
            }))}
            onPathPointsChange={() => {}}
          />
        )
      default:
        return (
          <div style={{
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#001529',
            color: '#fff',
          }}>
            未知地图类型: {mapType}
          </div>
        )
    }
  }

  // ========== 获取状态显示 ==========
  const getStatusTag = () => {
    switch (navStatus) {
      case 'running':
        return <Tag color="green">▶ 运行中</Tag>
      case 'paused':
        return <Tag color="orange">⏸ 已暂停</Tag>
      default:
        return <Tag color="default">⏹ 待机</Tag>
    }
  }

  const getPositionDisplay = () => {
    if (mapType === 'gps') {
      return `(${robotPosition.lat.toFixed(6)}, ${robotPosition.lng.toFixed(6)})`
    }
    return `(${(robotPosition.x || 0).toFixed(2)}, ${(robotPosition.y || 0).toFixed(2)}, ${(robotPosition.z || 0).toFixed(2)})`
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)' }}>
      {/* 顶部导航栏 */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#fff',
          padding: '12px 24px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
          zIndex: 1000,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <Button icon={<AimOutlined />} onClick={() => navigate('/')}>
            返回首页
          </Button>
          <span style={{ fontSize: 20, fontWeight: 600, color: '#262626' }}>
            🧭 导航控制
          </span>
          {getStatusTag()}
        </div>
        <SystemHeader showROS showBattery showGPS showMode />
      </div>

      {/* 主内容区 */}
      <div style={{ paddingTop: 80, paddingBottom: 80 }}>
        {/* 地图和状态区域 */}
        <div style={{
          maxWidth: 1600,
          margin: '0 auto',
          padding: '0 24px',
          display: 'flex',
          gap: 16,
        }}>
          {/* 地图区域 */}
          <div style={{
            flex: 1,
            background: '#fff',
            borderRadius: 8,
            overflow: 'hidden',
            minHeight: 0,
            height: 'calc(100vh - 160px)',
          }}>
            {renderMap()}
          </div>

          {/* 右侧面板 */}
          <div style={{
            width: 340,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            maxHeight: 'calc(100vh - 60px)',
            overflowY: 'auto',
            position: 'relative',
            zIndex: 1001,
          }}>
            {/* 地图与路径选择 */}
            <Card
              size="small"
              title="🗺️ 地图与路径"
              extra={
                <Tag color={mapType === 'local' ? 'blue' : mapType === 'gps' ? 'green' : 'purple'} style={{ fontSize: 11 }}>
                  {mapType === 'local' ? '本地' : mapType === 'gps' ? 'GPS' : '融合'}
                </Tag>
              }
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <span style={{ fontSize: 12, color: '#666', marginRight: 8 }}>选择地图:</span>
                  <Select
                    value={selectedMap}
                    onChange={handleMapChange}
                    options={maps}
                    style={{ width: '100%' }}
                    placeholder="选择地图"
                    size="small"
                  />
                </div>
                <div>
                  <span style={{ fontSize: 12, color: '#666', marginRight: 8 }}>选择路径:</span>
                  <Select
                    value={selectedPathId}
                    onChange={setSelectedPathId}
                    options={paths.map(p => ({
                      value: p.id,
                      label: `${p.name} (${p.points?.length || 0} 点)`,
                    }))}
                    style={{ width: '100%' }}
                    placeholder="选择路径"
                    disabled={!selectedMap}
                    size="small"
                  />
                </div>
                <Button
                  icon={<ReloadOutlined />}
                  onClick={() => selectedMap && loadPaths(selectedMap)}
                  loading={loadingPaths}
                  size="small"
                  block
                >
                  刷新路径
                </Button>
              </div>
            </Card>
            {/* 实时状态 */}
            <Card size="small" title="📊 实时状态">
              <Row gutter={[8, 8]}>
                <Col span={12}>
                  <Statistic
                    title="进度"
                    value={progress}
                    suffix="%"
                    precision={1}
                    valueStyle={{ fontSize: 18 }}
                  />
                </Col>
                <Col span={12}>
                  <Statistic
                    title="当前航点"
                    value={`${currentWaypointIdx + 1}/${pathPoints.length || 0}`}
                    valueStyle={{ fontSize: 18 }}
                  />
                </Col>
                <Col span={12}>
                  <Statistic
                    title="速度"
                    value={speed}
                    suffix="m/s"
                    precision={2}
                    valueStyle={{ fontSize: 18 }}
                  />
                </Col>
                <Col span={12}>
                  <Statistic
                    title="航向"
                    value={robotPosition.heading}
                    suffix="°"
                    precision={1}
                    valueStyle={{ fontSize: 18 }}
                  />
                </Col>
              </Row>
              <Divider style={{ margin: '12px 0' }} />
              <div style={{ fontSize: 12, color: '#666' }}>
                <div style={{ marginBottom: 4 }}>
                  <span style={{ fontWeight: 500 }}>📍 位置:</span>
                </div>
                <div style={{ fontSize: 11, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {getPositionDisplay()}
                </div>
              </div>
            </Card>

            {/* 控制面板 */}
            <Card size="small" title="🎮 控制面板">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <Button
                    danger
                    size="large"
                    icon={<WarningOutlined />}
                    onClick={handleEmergencyStop}
                    style={{ minWidth: 90, height: 48, fontSize: 14, fontWeight: 600 }}
                  >
                    🛑 急停
                  </Button>
                  <Button
                    type="primary"
                    size="large"
                    icon={<PlayCircleOutlined />}
                    onClick={handleStart}
                    disabled={navStatus === 'running' || !selectedPathId}
                    style={{ minWidth: 80, height: 48, fontSize: 14 }}
                  >
                    开始
                  </Button>
                  {navStatus === 'running' ? (
                    <Button
                      size="large"
                      icon={<PauseCircleOutlined />}
                      onClick={handlePause}
                      style={{ minWidth: 80, height: 48, fontSize: 14 }}
                    >
                      暂停
                    </Button>
                  ) : navStatus === 'paused' ? (
                    <Button
                      size="large"
                      icon={<PlayCircleOutlined />}
                      onClick={handleResume}
                      style={{ minWidth: 80, height: 48, fontSize: 14 }}
                    >
                      继续
                    </Button>
                  ) : null}
                  <Button
                    size="large"
                    icon={<StopOutlined />}
                    onClick={handleStop}
                    disabled={navStatus === 'idle'}
                    style={{ minWidth: 80, height: 48, fontSize: 14 }}
                  >
                    停止
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* 底部状态栏 */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          background: 'rgba(0, 0, 0, 0.85)',
          padding: '8px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 12,
          color: '#aaa',
          zIndex: 1000,
        }}
      >
        <Space size={24}>
          <span>路径: <strong style={{ color: '#fff' }}>{paths.length}</strong> 条</span>
          <span>选中路径: <strong style={{ color: '#fff' }}>{selectedPath?.name || '无'}</strong></span>
          <span>路径点数: <strong style={{ color: '#fff' }}>{pathPoints.length}</strong></span>
        </Space>
        <Space>
          <span>地图类型: <strong style={{ color: '#fff' }}>
            {mapType === 'local' ? '本地地图' : mapType === 'gps' ? 'GPS 地图' : '融合地图'}
          </strong></span>
        </Space>
      </div>
    </div>
  )
}

export default NavPage
