import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { ROSConnection } from '../utils/ros'

interface RosContextType {
  ros: ROSConnection
  connected: boolean
  connect: () => Promise<void>
  disconnect: () => void
}

const RosContext = createContext<RosContextType | undefined>(undefined)

interface RosProviderProps {
  children: ReactNode
}

export function RosProvider({ children }: RosProviderProps) {
  const [ros] = useState<ROSConnection>(() => {
    console.log('🔧 创建全局 ROS 单例实例...')
    return new ROSConnection()
  })
  
  const [connected, setConnected] = useState(false)

  // 连接 ROS
  const connect = async () => {
    if (ros.isConnected()) {
      console.log('✅ ROS 已连接，跳过')
      setConnected(true)
      return
    }
    
    try {
      console.log('🔌 正在连接 ROS...')
      await ros.connect()
      setConnected(true)
      console.log('✅ ROS 连接成功')
    } catch (error) {
      console.error('❌ ROS 连接失败:', error)
      setConnected(false)
    }
  }

  // 断开连接 (通常不调用，保持长连接)
  const disconnect = () => {
    console.log('🔌 断开 ROS 连接...')
    ros.disconnect()
    setConnected(false)
  }

  // 初始化连接 (只在组件挂载时执行一次)
  useEffect(() => {
    console.log('🔌 RosProvider 初始化，连接 ROS...')
    connect()
    
    // 监听连接状态变化
    const handleStatusChange = (status: { connected: boolean }) => {
      console.log('📡 ROS 状态变化:', status.connected)
      setConnected(status.connected)
    }
    
    ros.registerStatusCallback(handleStatusChange)
    
    // 组件卸载时不断开连接 (保持全局连接)
    return () => {
      console.log('🧹 RosProvider 清理 (保持连接)')
      ros.unregisterStatusCallback(handleStatusChange)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])  // 空依赖项，只运行一次

  const value = {
    ros,
    connected,
    connect,
    disconnect
  }

  return (
    <RosContext.Provider value={value}>
      {children}
    </RosContext.Provider>
  )
}

// 使用 Hook
export function useRos() {
  const context = useContext(RosContext)
  if (context === undefined) {
    throw new Error('useRos 必须在 RosProvider 内使用')
  }
  return context
}

export default RosContext
