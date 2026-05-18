import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { RosProvider } from './hooks/useRos'
import Home from './pages/Home'
import NavPage from './pages/NavPage'
import MapManagementPage from './pages/MapManagementPage'
import Login from './pages/Login'
import AuthGuard from './components/AuthGuard'
import PathPlanningPage from './pages/PathPlanningPage'
import Settings from './pages/Settings'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ConfigProvider locale={zhCN}>
      <RosProvider>
        <HashRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<AuthGuard><Home /></AuthGuard>} />
            <Route path="/settings" element={<AuthGuard><Settings /></AuthGuard>} />
            <Route path="/maps" element={<AuthGuard><MapManagementPage /></AuthGuard>} />
            <Route path="/nav" element={<AuthGuard><NavPage /></AuthGuard>} />
            <Route path="/path-planning" element={<AuthGuard><PathPlanningPage /></AuthGuard>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </HashRouter>
      </RosProvider>
    </ConfigProvider>
  </React.StrictMode>
)
