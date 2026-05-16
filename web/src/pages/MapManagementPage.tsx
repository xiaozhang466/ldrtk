import React, { useState } from 'react'
import { Tabs, Button, Space } from 'antd'
import {
  HomeOutlined,
  AppstoreOutlined,
  EyeOutlined,
  ScheduleOutlined,
  LogoutOutlined,
  ArrowLeftOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import MapManager from '../components/MapManager'
import MappingControl from '../components/MappingControl'
import MapPreview from '../components/MapPreview'
import SystemHeader from '../components/SystemHeader'
import logoImg from '../assets/logo.png'

const MapManagementPage: React.FC = () => {
  const navigate = useNavigate()
  const [selectedMap, setSelectedMap] = useState<string>('')
  const [activeTab, setActiveTab] = useState<string>('maps')

  // 返回首页
  const handleGoHome = () => {
    navigate('/')
  }

  // 切换到指定 Tab
  const switchTab = (tabKey: string, mapName?: string) => {
    if (mapName) {
      setSelectedMap(mapName)
    }
    setActiveTab(tabKey)
  }

  // 登出
  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      })
    } catch (error) {
      console.error('登出失败:', error)
    } finally {
      localStorage.removeItem('isLoggedIn')
      localStorage.removeItem('username')
      navigate('/login')
    }
  }

  const items = [
    {
      key: 'maps',
      label: (
        <span style={{ fontSize: 16 }}>
          <HomeOutlined style={{ marginRight: 8 }} />
          地图管理
        </span>
      ),
      children: (
        <div className="map-management-tab-pane-content">
          <MapManager onMapSelect={setSelectedMap} onNavigate={switchTab} />
        </div>
      ),
    },
    {
      key: 'mapping',
      label: (
        <span style={{ fontSize: 16 }}>
          <AppstoreOutlined style={{ marginRight: 8 }} />
          建图控制
        </span>
      ),
      children: (
        <div className="map-management-tab-pane-content">
          <MappingControl mapName={selectedMap} />
        </div>
      ),
    },
    {
      key: 'viewer',
      label: (
        <span style={{ fontSize: 16 }}>
          <EyeOutlined style={{ marginRight: 8 }} />
          PCD 预览
        </span>
      ),
      children: (
        <div className="map-management-tab-pane-content">
          <MapPreview mapName={selectedMap} onMapChange={setSelectedMap} />
        </div>
      ),
    },
  ]

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: '#d9d9d9',  // 与首页一致的深灰背景
    }}>
      {/* 顶部标题栏 - 浮动置顶 */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#ffffff',
          padding: '12px 24px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
          zIndex: 1000,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div 
            onClick={handleGoHome}
            style={{ display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer' }}
          >
            <img
              src={logoImg}
              alt="思谷耘联"
              style={{
                height: 40,
                objectFit: 'contain',
              }}
            />
            <div>
              <div style={{ fontSize: 18, fontWeight: 600, color: '#262626' }}>
                智能终端控制系统
              </div>
              <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 2 }}>
                地图管理子系统
              </div>
            </div>
          </div>
          {/* 系统状态 - 放在标题右侧，同一行显示 */}
          <div style={{ display: 'flex', alignItems: 'center', marginLeft: 32 }}>
            <SystemHeader 
              showROS={true}
              showBattery={true}
              showGPS={true}
              showMode={true}
            />
          </div>
        </div>
        <Button
          icon={<LogoutOutlined />}
          onClick={handleLogout}
          size="large"
          danger
          ghost
        >
          退出登录
        </Button>
      </div>

      {/* 主内容区 - 添加顶部间距避免被固定栏遮挡 */}
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '100px 24px 24px 24px' }}>
        <div style={{ background: '#fff', borderRadius: 8, height: 'calc(100vh - 200px)', display: 'flex', flexDirection: 'column' }}>
          <Tabs
            className="map-management-tabs"
            activeKey={activeTab}
            onChange={setActiveTab}
            items={items}
            size="large"
            style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
            tabBarStyle={{ padding: '16px 24px 0', margin: 0 }}
          />
        </div>
      </div>
    </div>
  )
}

export default MapManagementPage
