import React, { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Spin } from 'antd'

interface AuthGuardProps {
  children: React.ReactNode
}

const AuthGuard: React.FC<AuthGuardProps> = ({ children }) => {
  const navigate = useNavigate()
  const location = useLocation()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true'
    
    // 如果不在登录页且没有登录，跳转到登录页
    if (!isLoggedIn && location.pathname !== '/login') {
      navigate('/login', { 
        state: { from: location.pathname } 
      })
    } else {
      setLoading(false)
    }
  }, [navigate, location.pathname])

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh' 
      }}>
        <Spin size="large" tip="加载中..." />
      </div>
    )
  }

  return <>{children}</>
}

export default AuthGuard
