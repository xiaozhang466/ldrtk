import React, { useState, useEffect } from 'react'
import { Card, Row, Col, Button, Progress, Divider, Tag } from 'antd'
import { 
  WifiOutlined, ThunderboltOutlined, CloudOutlined, RobotOutlined,
  AppstoreOutlined, CompassOutlined, LogoutOutlined, SettingOutlined,
  CheckCircleOutlined, ExclamationCircleOutlined
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useRos } from '../hooks/useRos'
import logoImg from '../assets/logo.png'

const Home = () => {
  const navigate = useNavigate()
  const { ros, connected: rosConnected } = useRos()
  
  // 系统状态
  const [battery, setBattery] = useState('--')
  const [gpsFixed, setGpsFixed] = useState(false)
  const [workMode, setWorkMode] = useState('待机')

  // 订阅电池状态
  useEffect(() => {
    const unsub = ros.subscribe('/battery_status', (msg) => {
      setBattery(Math.round(msg.data))
    }, 'std_msgs/Float32')
    return () => { if (unsub) unsub() }
  }, [ros])

  // 订阅 GPS 状态
  useEffect(() => {
    const unsub = ros.subscribe('/gps/fix', (msg) => {
      setGpsFixed(msg.status?.status >= 1)
    }, 'sensor_msgs/NavSatFix')
    return () => { if (unsub) unsub() }
  }, [ros])

  // 订阅工作模式（暂无真实话题，暂用--）
  useEffect(() => {
    // TODO: 工作模式话题（如果有的话）
  }, [])
  
  // 系统信息
  const systemInfo = {
    deviceModel: '耘小智 02',
    deviceName: '履带式果园巡检机器人',
    chassisModel: '履带通用底盘C系列',
    softwareVersion: 'v2.0.0',
    rosVersion: 'ROS1 Noetic',
    workspace: '/home/ros/ZMG/sigu/rtk',
    lastUpdate: '2026-04-14',
  }

  // 退出登录
  const handleLogout = () => {
    localStorage.removeItem('isLoggedIn')
    localStorage.removeItem('username')
    navigate('/login')
  }

  // 状态卡片配置
  const statusCards = [
    {
      title: 'ROS 连接',
      value: rosConnected ? '已连接' : '连接中',
      status: rosConnected ? 'success' : 'warning',
      icon: <WifiOutlined />,
      color: '#1890ff',
      bgColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    },
    {
      title: '电池电量',
      value: `${battery}%`,
      status: (typeof battery === 'number' && battery > 30) ? 'success' : 'warning',
      icon: <ThunderboltOutlined />,
      color: typeof battery === 'number' ? (battery > 50 ? '#52c41a' : battery > 30 ? '#faad14' : '#ff4d4f') : '#8c8c8c',
      bgColor: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
      progress: typeof battery === 'number' ? battery : 0,
    },
    {
      title: 'GPS 状态',
      value: gpsFixed ? '已定位' : '搜索中',
      status: gpsFixed ? 'success' : 'warning',
      icon: <CloudOutlined />,
      color: '#722ed1',
      bgColor: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    },
    {
      title: '工作模式',
      value: workMode,
      status: 'success',
      icon: <RobotOutlined />,
      color: '#13c2c2',
      bgColor: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    },
  ]

  // 状态颜色
  const statusColors = {
    success: '#52c41a',
    warning: '#faad14',
    error: '#f5222d',
  }

  // 固定高度
  const statusCardHeight = 140
  const navButtonHeight = 240

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: '#d9d9d9',  // 加深背景，提高户外对比度
    }}>
      {/* 顶部导航栏 */}
      <div style={{ 
        background: '#ffffff',
        padding: '16px 24px',
        marginBottom: 24,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <img
            src={logoImg}
            alt="思谷耘联"
            style={{
              height: 40,
              objectFit: 'contain',
            }}
          />
          <div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#262626' }}>
              智能终端控制系统
            </div>
            <div style={{ fontSize: '12px', color: '#8c8c8c' }}>
              耘小智 02 · 履带式果园巡检机器人
            </div>
          </div>
        </div>
        <Button 
          onClick={handleLogout} 
          size="large"
          icon={<LogoutOutlined />}
          danger
          ghost
        >
          退出登录
        </Button>
      </div>

      {/* 主内容区 */}
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0 24px 24px 24px' }}>
        
        {/* 状态卡片 - 固定高度 */}
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          {statusCards.map((card, index) => (
            <Col xs={24} sm={12} lg={6} key={index}>
              <Card
                hoverable
                style={{
                  height: statusCardHeight,
                  borderRadius: 8,
                  border: 'none',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  transition: 'all 0.3s',
                }}
                bodyStyle={{ padding: '20px 24px', height: '100%' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, height: '100%' }}>
                  <div style={{
                    width: 64,
                    height: 64,
                    borderRadius: 12,
                    background: card.bgColor,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                  }}>
                    <div style={{ fontSize: 32, color: '#fff' }}>
                      {card.icon}
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, color: '#8c8c8c', marginBottom: 8 }}>
                      {card.title}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <div style={{ fontSize: 26, fontWeight: 'bold', color: '#262626' }}>
                        {card.value}
                      </div>
                      <Tag color={statusColors[card.status]} style={{ borderRadius: 4, fontSize: 12 }}>
                        {card.status === 'success' ? <CheckCircleOutlined /> : <ExclamationCircleOutlined />}
                        {card.status === 'success' ? '正常' : '注意'}
                      </Tag>
                    </div>
                    {card.progress !== undefined && (
                      <Progress 
                        percent={card.progress} 
                        showInfo={false} 
                        size="small" 
                        style={{ marginTop: 10 }} 
                        strokeColor={typeof card.progress === 'number' && card.progress > 50 ? '#52c41a' : typeof card.progress === 'number' && card.progress > 30 ? '#faad14' : '#ff4d4f'}
                      />
                    )}
                  </div>
                </div>
              </Card>
            </Col>
          ))}
        </Row>

        {/* 核心功能按钮 - 三个排成一行 */}
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col xs={24} sm={8}>
            <Card
              hoverable
              onClick={() => navigate('/maps')}
              style={{
                height: navButtonHeight,
                borderRadius: 12,
                border: 'none',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                cursor: 'pointer',
                transition: 'all 0.3s',
              }}
              bodyStyle={{
                padding: 0,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div style={{
                width: 100,
                height: 100,
                borderRadius: 20,
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 20,
                boxShadow: '0 6px 20px rgba(102, 126, 234, 0.4)',
              }}>
                <AppstoreOutlined style={{ fontSize: 50, color: '#fff' }} />
              </div>
              <div style={{ fontSize: 24, fontWeight: 'bold', color: '#262626', marginBottom: 10 }}>
                🗺️ 地图管理
              </div>
              <div style={{ fontSize: 15, color: '#8c8c8c' }}>
                建图控制 · PCD 预览 · 路径规划
              </div>
            </Card>
          </Col>

          <Col xs={24} sm={8}>
            <Card
              hoverable
              onClick={() => navigate('/nav')}
              style={{
                height: navButtonHeight,
                borderRadius: 12,
                border: 'none',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                cursor: 'pointer',
                transition: 'all 0.3s',
              }}
              bodyStyle={{
                padding: 0,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div style={{
                width: 100,
                height: 100,
                borderRadius: 20,
                background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 20,
                boxShadow: '0 6px 20px rgba(17, 153, 142, 0.4)',
              }}>
                <CompassOutlined style={{ fontSize: 50, color: '#fff' }} />
              </div>
              <div style={{ fontSize: 24, fontWeight: 'bold', color: '#262626', marginBottom: 10 }}>
                🧭 导航控制
              </div>
              <div style={{ fontSize: 15, color: '#8c8c8c' }}>
                自主导航 · 路径跟踪 · 避障控制
              </div>
            </Card>
          </Col>

          <Col xs={24} sm={8}>
            <Card
              hoverable
              onClick={() => navigate('/settings')}
              style={{
                height: navButtonHeight,
                borderRadius: 12,
                border: 'none',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                cursor: 'pointer',
                transition: 'all 0.3s',
              }}
              bodyStyle={{
                padding: 0,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div style={{
                width: 100,
                height: 100,
                borderRadius: 20,
                background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 20,
                boxShadow: '0 6px 20px rgba(240, 147, 251, 0.4)',
              }}>
                <SettingOutlined style={{ fontSize: 50, color: '#fff' }} />
              </div>
              <div style={{ fontSize: 24, fontWeight: 'bold', color: '#262626', marginBottom: 10 }}>
                ⚙️ 系统设置
              </div>
              <div style={{ fontSize: 15, color: '#8c8c8c' }}>
                基本配置 · RTK 配置 · 建图参数 · 导航参数
              </div>
            </Card>
          </Col>
        </Row>

        {/* 系统信息 */}
        <Card
          style={{
            borderRadius: 8,
            border: 'none',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
          bodyStyle={{ padding: '16px 24px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 16, fontWeight: 'bold', color: '#262626' }}>📊 系统信息</span>
          </div>
          <Divider style={{ margin: '8px 0 12px 0' }} />
          <Row gutter={[24, 12]}>
            <Col xs={12} sm={8} md={4}>
              <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>设备名称</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#262626' }}>{systemInfo.deviceName}</div>
            </Col>

            <Col xs={12} sm={8} md={4}>
              <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>底盘型号</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#262626' }}>{systemInfo.chassisModel}</div>
            </Col>
            <Col xs={12} sm={8} md={4}>
              <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>软件版本</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#262626' }}>{systemInfo.softwareVersion}</div>
            </Col>
            <Col xs={12} sm={8} md={4}>
              <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>ROS 版本</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#262626' }}>{systemInfo.rosVersion}</div>
            </Col>
            <Col xs={12} sm={8} md={4}>
              <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>最后更新</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#262626' }}>{systemInfo.lastUpdate}</div>
            </Col>
            <Col xs={12} sm={8} md={4}>
              <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>工作空间</div>
              <div style={{ fontSize: 12, color: '#595959', wordBreak: 'break-all' }}>{systemInfo.workspace}</div>
            </Col>
          </Row>
        </Card>
      </div>
    </div>
  )
}

export default Home
