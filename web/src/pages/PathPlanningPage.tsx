import React from 'react'
import { Button } from 'antd'
import {
  LogoutOutlined,
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import PathPlanning from '../components/PathPlanning'
import SystemHeader from '../components/SystemHeader'
import logoImg from '../assets/logo.png'

const PathPlanningPage: React.FC = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  
  // 从 URL 读取 map 参数
  const mapNameFromUrl = searchParams.get('map')

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

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: '#d9d9d9',
    }}>
      {/* 顶部标题栏 - 与 MapManagementPage 保持一致 */}
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
        {/* 左侧：Logo + 标题 + 系统状态 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          {/* Logo 可点击返回首页 */}
          <div 
            onClick={() => navigate('/')}
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
                路径规划子系统
              </div>
            </div>
          </div>
          {/* 系统状态 */}
          <div style={{ display: 'flex', alignItems: 'center', marginLeft: 32 }}>
            <SystemHeader 
              showROS={true}
              showBattery={true}
              showGPS={true}
              showMode={true}
            />
          </div>
        </div>
        {/* 右侧：退出登录 */}
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

      {/* 主内容区 - 全屏显示，黑色背景 */}
      <div style={{ 
        position: 'fixed',
        top: 72,
        left: 0,
        right: 0,
        bottom: 0,
        background: '#001529',
      }}>
        <PathPlanning mapName={mapNameFromUrl || undefined} />
      </div>
    </div>
  )
}

export default PathPlanningPage
