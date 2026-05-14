/**
 * 统一地图预览组件
 * 
 * 根据地图类型自动选择预览模式：
 * - 空地图：显示提示信息
 * - GPS 地图：Cesium.js 天地图预览
 * - 本地地图：Three.js PCD 点云预览
 * - 融合地图：Cesium.js 天地图 + PCD 栅格化叠加
 */

import React, { useState, useEffect } from 'react'
import { Card, Alert, Button, Space, Spin, Tag } from 'antd'
import {
  InfoCircleOutlined,
  PictureOutlined,
  CloudOutlined,
  MergeOutlined,
} from '@ant-design/icons'
import { MapInfo } from '../api'

interface UnifiedMapPreviewProps {
  mapInfo: MapInfo
  onClose?: () => void
}

const UnifiedMapPreview: React.FC<UnifiedMapPreviewProps> = ({ mapInfo, onClose }) => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 判断地图类型
  const getMapType = () => {
    if (!mapInfo.has_pcd && !mapInfo.has_gps_config) return 'empty'
    if (mapInfo.has_pcd && mapInfo.has_gps_config) return 'fusion'
    if (mapInfo.has_gps_config) return 'gps'
    if (mapInfo.has_pcd) return 'local'
    return 'empty'
  }

  const mapType = getMapType()

  // 渲染空地图提示
  const renderEmptyMap = () => (
    <div style={{ padding: 60, textAlign: 'center' }}>
      <InfoCircleOutlined style={{ fontSize: 64, color: '#d9d9d9', marginBottom: 24 }} />
      <h2 style={{ color: '#666', marginBottom: 16 }}>空地图</h2>
      <p style={{ color: '#999', fontSize: 16 }}>
        该地图尚未建图，无法预览
      </p>
      <div style={{ marginTop: 32 }}>
        <Tag color="gray" style={{ fontSize: 14, padding: '6px 16px' }}>
          空地图
        </Tag>
      </div>
    </div>
  )

  // 渲染 GPS 地图预览（天地图）
  const renderGPSMap = () => (
    <div style={{ padding: 24 }}>
      <Alert
        message="GPS 地图预览"
        description="使用 Cesium.js 显示天地图底图，可显示地图原点和规划路径"
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />
      <div style={{ height: '600px', background: '#f0f0f0', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <CloudOutlined style={{ fontSize: 64, color: '#1890ff', marginBottom: 16 }} />
          <h3>天地图预览（Cesium.js）</h3>
          <p style={{ color: '#666' }}>
            地图原点：{mapInfo.gps_origin?.lat.toFixed(6)}, {mapInfo.gps_origin?.lng.toFixed(6)}
          </p>
          <p style={{ fontSize: 12, color: '#999', marginTop: 16 }}>
            💡 提示：此处集成 Cesium.js 显示天地图底图
          </p>
        </div>
      </div>
    </div>
  )

  // 渲染本地地图预览（PCD 点云）
  const renderLocalMap = () => (
    <div style={{ padding: 24 }}>
      <Alert
        message="本地地图预览"
        description="使用 Three.js 显示 PCD 点云"
        type="success"
        showIcon
        style={{ marginBottom: 16 }}
      />
      <div style={{ height: '600px', background: '#1a1a2e', borderRadius: 8 }}>
        {/* 这里集成现有的 MapPreview 组件 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#fff' }}>
          <div style={{ textAlign: 'center' }}>
            <PictureOutlined style={{ fontSize: 64, color: '#52c41a', marginBottom: 16 }} />
            <h3>PCD 点云预览（Three.js）</h3>
            <p style={{ color: '#ccc' }}>
              文件数：{mapInfo.file_count} | 大小：{(mapInfo.total_size / 1024 / 1024).toFixed(2)} MB
            </p>
            <p style={{ fontSize: 12, color: '#999', marginTop: 16 }}>
              💡 提示：此处集成现有 MapPreview 组件显示 PCD 点云
            </p>
          </div>
        </div>
      </div>
    </div>
  )

  // 渲染融合地图预览（天地图 + PCD 叠加）
  const renderFusionMap = () => (
    <div style={{ padding: 24 }}>
      <Alert
        message="融合地图预览"
        description="使用 Cesium.js 显示天地图底图 + PCD 栅格化叠加"
        type="success"
        showIcon
        style={{ marginBottom: 16 }}
      />
      <div style={{ height: '600px', background: '#f0f0f0', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <MergeOutlined style={{ fontSize: 64, color: '#722ed1', marginBottom: 16 }} />
          <h3>融合地图预览（天地图 + PCD）</h3>
          <p style={{ color: '#666' }}>
            地图原点：{mapInfo.gps_origin?.lat.toFixed(6)}, {mapInfo.gps_origin?.lng.toFixed(6)}
          </p>
          <p style={{ color: '#666', marginTop: 8 }}>
            PCD 文件：{mapInfo.file_count} 个文件 | {(mapInfo.total_size / 1024 / 1024).toFixed(2)} MB
          </p>
          <div style={{ marginTop: 24, display: 'flex', gap: 16, justifyContent: 'center' }}>
            <Tag color="blue" style={{ fontSize: 14 }}>GPS 坐标</Tag>
            <Tag color="green" style={{ fontSize: 14 }}>PCD 点云</Tag>
            <Tag color="purple" style={{ fontSize: 14 }}>已配准</Tag>
          </div>
          <p style={{ fontSize: 12, color: '#999', marginTop: 16 }}>
            💡 提示：此处集成 Cesium.js + map.png 叠加层
          </p>
        </div>
      </div>
    </div>
  )

  // 根据地图类型渲染
  const renderPreview = () => {
    switch (mapType) {
      case 'empty':
        return renderEmptyMap()
      case 'gps':
        return renderGPSMap()
      case 'local':
        return renderLocalMap()
      case 'fusion':
        return renderFusionMap()
      default:
        return renderEmptyMap()
    }
  }

  return (
    <Card
      title={
        <Space>
          <span>{mapInfo.name} - 地图预览</span>
          <Tag color={
            mapType === 'empty' ? 'gray' :
            mapType === 'gps' ? 'blue' :
            mapType === 'local' ? 'green' : 'purple'
          }>
            {mapType === 'empty' ? '空地图' :
             mapType === 'gps' ? 'GPS 地图' :
             mapType === 'local' ? '本地地图' : '融合地图'}
          </Tag>
        </Space>
      }
      extra={onClose && <Button onClick={onClose}>关闭</Button>}
      style={{ minHeight: '70vh' }}
    >
      {loading && <Spin tip="加载中..." style={{ display: 'block', margin: '40px auto' }} />}
      {error && <Alert message={error} type="error" showIcon style={{ marginBottom: 16 }} />}
      {!loading && !error && renderPreview()}
    </Card>
  )
}

export default UnifiedMapPreview
