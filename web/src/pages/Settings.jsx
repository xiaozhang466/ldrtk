/**
 * 全局参数配置页面
 * 
 * 提供 ROS 节点参数配置功能，包括：
 * - 基本配置
 * - RTK 配置
 * - 建图配置
 * - 导航配置 (后续)
 */

import React, { useState, useEffect } from 'react';
import { Tabs, Button } from 'antd';
import {
  ArrowLeftOutlined,
  LogoutOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { connectRos, isRosConnected } from '../utils/ros';
import BasicTab from '../components/settings/BasicTab';
import RTKTab from '../components/settings/RTKTab';
import MappingTab from '../components/settings/MappingTab';
import NavigationTab from '../components/settings/NavigationTab';
import SystemHeader from '../components/SystemHeader';
import logoImg from '../assets/logo.png';

const { TabPane } = Tabs;

/**
 * 全局参数配置页面组件
 */
const Settings = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('basic');
  const [rosConnected, setRosConnected] = useState(false);
  const [loading, setLoading] = useState(false);

  // 检查 ROS 连接状态
  useEffect(() => {
    checkRosConnection();
    
    // 定期检查连接状态
    const interval = setInterval(() => {
      checkRosConnection();
    }, 5000);
    
    return () => clearInterval(interval);
  }, []);

  // 检查 ROS 连接
  const checkRosConnection = async () => {
    try {
      const connected = isRosConnected();
      setRosConnected(connected);
      
      if (!connected) {
        await connectRos();
        setRosConnected(true);
      }
    } catch (error) {
      console.error('ROS connection check failed:', error);
      setRosConnected(false);
    }
  };

  // 返回首页
  const handleGoHome = () => {
    navigate('/');
  };

  // 登出
  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('登出失败:', error);
    } finally {
      localStorage.removeItem('isLoggedIn');
      localStorage.removeItem('username');
      navigate('/login');
    }
  };

  // 标签页切换
  const handleTabChange = (key) => {
    setActiveTab(key);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#d9d9d9' }}>
      {/* 顶部标题栏 */}
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
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={handleGoHome}
            size="large"
            ghost
          >
            返回
          </Button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
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
                全局参数配置
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

      {/* 主内容区 */}
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '100px 24px 24px 24px' }}>
        <div style={{ background: '#fff', borderRadius: 8, display: 'flex', flexDirection: 'column' }}>
          <Tabs 
            activeKey={activeTab} 
            onChange={handleTabChange}
            type="card"
            size="large"
            style={{ height: '100%' }}
            tabBarStyle={{ padding: '16px 24px 0', margin: 0 }}
          >
            <TabPane tab="基本配置" key="basic">
              <BasicTab loading={loading} />
            </TabPane>
            
            <TabPane tab="RTK 配置" key="rtk">
              <RTKTab loading={loading} />
            </TabPane>
            
            <TabPane tab="建图配置" key="mapping">
              <MappingTab loading={loading} />
            </TabPane>
            
            <TabPane tab="导航配置" key="navigation">
              <NavigationTab />
            </TabPane>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default Settings;
