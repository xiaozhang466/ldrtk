/**
 * 地图操作统一 Modal 组件
 * 
 * 支持三种模式：preview, mapping, planning
 * 支持三种地图类型：local, gps, fusion
 */

import React, { useState, useEffect } from 'react'
import { Modal, Button, Space, message, Progress } from 'antd'
import {
  CloseOutlined,
  DownloadOutlined,
  FilterOutlined,
  PlayCircleOutlined,
  SaveOutlined,
  StopOutlined,
  CheckCircleOutlined,
  EditOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { MapInfo, mappingApi, type MappingStatus } from '../api'
import LocalMapView from './LocalMapView'
import GPSMapView from './GPSMapView'
import FusionMapView from './FusionMapView'
import PathPlanning from './PathPlanning'
import MappingControl from './MappingControl'

interface MapOperationModalProps {
  mapInfo: MapInfo
  mode: 'preview' | 'mapping' | 'planning'
  visible: boolean
  onClose: () => void
}

const MapOperationModal: React.FC<MapOperationModalProps> = ({
  mapInfo,
  mode,
  visible,
  onClose,
}) => {
  const navigate = useNavigate()
  
  // 建图状态
  const [mappingStatus, setMappingStatus] = useState<MappingStatus | null>(null)
  const [isMapping, setIsMapping] = useState(false)

  // 轮询建图状态（仅在非 mapping 模式下轮询，mapping 模式由 MappingControl 组件管理）
  useEffect(() => {
    if (mode === 'mapping' || !visible) return

    const pollStatus = async () => {
      try {
        const res = await mappingApi.getStatus()
        setMappingStatus(res.status)
        setIsMapping(res.status.status === 'running')
      } catch (e) {
        // 忽略错误，避免频繁打印
      }
    }

    const timer = setInterval(pollStatus, 2000)
    return () => clearInterval(timer)
  }, [mode, visible])

  // 开始建图
  const handleStartMapping = async () => {
    try {
      await mappingApi.startMapping(mapInfo.name)
      message.success('建图已开始')
      setIsMapping(true)
    } catch (e: any) {
      message.error(`启动失败：${e.message}`)
    }
  }

  // 停止建图
  const handleStopMapping = async () => {
    try {
      await mappingApi.stopMapping()
      message.success('建图已停止')
      setIsMapping(false)
      // 刷新地图列表
      setTimeout(() => window.location.reload(), 1000)
    } catch (e: any) {
      message.error(`停止失败：${e.message}`)
    }
  }

  // 调试日志（仅在 mounted 时打印一次）
  useEffect(() => {
    console.log('[MapOperationModal] 首次渲染，mapInfo:', mapInfo?.name, 'mode:', mode)
  }, [])

  // 判断地图类型
  const getMapType = () => {
    const hasPcd = mapInfo.has_pcd === true || mapInfo.has_pcd === 'true'
    const hasGpsConfig = mapInfo.has_gps_config === true || mapInfo.has_gps_config === 'true'
    
    if (!hasPcd && !hasGpsConfig) return 'empty'
    if (hasPcd && hasGpsConfig) return 'fusion'
    if (hasGpsConfig) return 'gps'
    if (hasPcd) return 'local'
    return 'empty'
  }

  const mapType = getMapType()

  // 获取标题
  const getTitle = () => {
    const modeText = {
      preview: '预览',
      mapping: '建图',
      planning: '路径规划',
    }[mode]

    const typeText = {
      empty: '空地图',
      local: '本地地图',
      gps: 'GPS 地图',
      fusion: '融合地图',
    }[mapType]

    return `${mapInfo.name} - ${modeText} (${typeText})`
  }

  // 渲染建图状态（仅在 preview 模式下显示，mapping 和 planning 模式不需要）
  const renderMappingStatus = () => {
    // mapping 模式由 MappingControl 组件管理，planning 模式不需要显示
    if (mode === 'mapping' || mode === 'planning') return null
    if (!mappingStatus) return null

    const statusConfig = {
      idle: { color: 'default', text: '未开始' },
      running: { color: 'active', text: '建图中...' },
      paused: { color: 'warning', text: '已暂停' },
      completed: { color: 'success', text: '已完成' },
      error: { color: 'exception', text: '出错' },
    }[mappingStatus.status]

    return (
      <div style={{ padding: '8px 12px', background: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
        <Space size={16}>
          <span style={{ fontSize: 13, color: '#666' }}>建图状态</span>
          <Progress
            percent={mappingStatus.status === 'running' ? undefined : 100}
            status={statusConfig?.color as any}
            strokeColor={mappingStatus.status === 'running' ? '#1890ff' : undefined}
            style={{ width: 200 }}
          />
          <span style={{ fontSize: 12, color: '#999' }}>
            帧数：{mappingStatus.frame_count || 0} | 轨迹点：{mappingStatus.trajectory_points || 0}
          </span>
        </Space>
      </div>
    )
  }

  // 渲染地图内容
  const renderMapContent = () => {
    // 路径规划模式 - 跳转到独立页面
    if (mode === 'planning') {
      navigate(`/path-planning?map=${mapInfo.name}`)
      onClose()
      return null
    }

    // 建图模式 - 使用 MappingControl 组件（全屏点云预览 + 底部状态栏）
    if (mode === 'mapping') {
      const safeMapName = mapInfo?.name || 'test_map';
      return (
        <div style={{ height: '100%' }}>
          <MappingControl mapName={safeMapName} onClose={onClose} />
        </div>
      )
    }

    // 地图预览模式
    switch (mapType) {
      case 'local':
        return <LocalMapView mapInfo={mapInfo} mode={mode} />
      case 'gps':
        return <GPSMapView mapInfo={mapInfo} mode={mode} />
      case 'fusion':
        return <FusionMapView mapInfo={mapInfo} mode={mode} />
      default:
        return (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <h2>空地图</h2>
            <p>该地图尚未建图，请先进行建图操作</p>
          </div>
        )
    }
  }

  // 渲染底部工具栏
  const renderFooter = () => {
    if (mapType === 'empty') {
      return [
        <Button key="close" onClick={onClose}>
          关闭
        </Button>,
      ]
    }

    // mapping 模式由 MappingControl 组件提供所有按钮（开始/停止/关闭），这里不需要 footer
    if (mode === 'mapping') {
      return null
    }

    const footerConfig = {
      preview: {
        local: [
          <Button key="filter" icon={<FilterOutlined />}>
            过滤
          </Button>,
          <Button key="download" icon={<DownloadOutlined />}>
            导出
          </Button>,
          <Button key="close" onClick={onClose}>
            关闭
          </Button>,
        ],
        gps: [
          <Button key="close" onClick={onClose}>
            关闭
          </Button>,
        ],
        fusion: [
          <Button key="close" onClick={onClose}>
            关闭
          </Button>,
        ],
      },
      planning: {
        local: [
          <Button key="cancel">
            取消
          </Button>,
          <Button key="save" type="primary" icon={<SaveOutlined />}>
            保存路径
          </Button>,
          <Button key="close" onClick={onClose}>
            关闭
          </Button>,
        ],
        gps: [
          <Button key="cancel">
            取消
          </Button>,
          <Button key="save" type="primary" icon={<SaveOutlined />}>
            保存路径
          </Button>,
          <Button key="close" onClick={onClose}>
            关闭
          </Button>,
        ],
        fusion: [
          <Button key="cancel">
            取消
          </Button>,
          <Button key="save" type="primary" icon={<SaveOutlined />}>
            保存路径
          </Button>,
          <Button key="close" onClick={onClose}>
            关闭
          </Button>,
        ],
      },
    }

    return footerConfig[mode][mapType] || footerConfig[mode].local
  }

  return (
    <Modal
      key={visible ? 'open' : 'closed'}
      title={getTitle()}
      open={visible}
      onCancel={mode === 'mapping' && isMapping ? undefined : onClose}
      footer={renderFooter()}
      width="95%"
      style={{ top: 10, bottom: 10, height: '85vh' }}
      bodyStyle={{
        height: '85vh',
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
      closable={mode !== 'mapping' || !isMapping}
      closeIcon={<CloseOutlined />}
      destroyOnClose={true}
      maskClosable={mode !== 'mapping' || !isMapping}
    >
      {renderMappingStatus()}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>
        {renderMapContent()}
      </div>
    </Modal>
  )
}

export default MapOperationModal
