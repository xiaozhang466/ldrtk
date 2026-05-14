import React, { useState, useEffect } from 'react'
import { Card, Table, Button, Space, Modal, Form, Input, message, Tag, Divider, Statistic, Row, Col, Spin, Popconfirm, Alert } from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  EyeOutlined,
  PlayCircleOutlined,
  SwapOutlined,
  AppstoreOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  ScheduleOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { mapsApi, type MapInfo } from '../api'
import MapOperationModal from './MapOperationModal'

interface MapManagerProps {
  onMapSelect?: (mapName: string) => void
  onNavigate?: (tabKey: string, mapName?: string) => void
}

interface MapTableItem extends MapInfo {
  key: string
  size_mb: string
  created_date: string
}

const MapManager: React.FC<MapManagerProps> = ({ onMapSelect, onNavigate }) => {
  const [maps, setMaps] = useState<MapTableItem[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingMap, setEditingMap] = useState<MapTableItem | null>(null)
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [operationModalVisible, setOperationModalVisible] = useState(false)
  const [operationMode, setOperationMode] = useState<'preview' | 'mapping' | 'planning'>('preview')
  const [operationMapInfo, setOperationMapInfo] = useState<MapTableItem | null>(null)
  const [renameModalVisible, setRenameModalVisible] = useState(false)
  const [renameMapInfo, setRenameMapInfo] = useState<MapTableItem | null>(null)
  const [form] = Form.useForm()
  const [createForm] = Form.useForm()
  const [renameForm] = Form.useForm()

  // 加载地图列表
  const loadMaps = async () => {
    setLoading(true)
    try {
      const response = await mapsApi.getMaps()
      const mapItems: MapTableItem[] = response.maps.map((map) => ({
        ...map,
        key: map.name,
        size_mb: (map.total_size / (1024 * 1024)).toFixed(2) + ' MB',
        created_date: new Date(map.created_at).toLocaleDateString('zh-CN'),
      }))
      setMaps(mapItems)
    } catch (error: any) {
      message.error(`加载地图列表失败：${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMaps()
  }, [])

  // 打开创建地图弹窗
  const handleOpenCreateModal = () => {
    setCreateModalVisible(true)
    createForm.resetFields()
  }

  // 取消创建
  const handleCancelCreate = () => {
    setCreateModalVisible(false)
    createForm.resetFields()
  }

  // 从 RTK 获取坐标
  const handleGetFromRTK = async () => {
    try {
      const rtkOrigin = await mapsApi.getRtkOrigin()
      createForm.setFieldsValue({
        lat: rtkOrigin.lat.toFixed(6),
        lon: rtkOrigin.lon.toFixed(6),
        alt: rtkOrigin.alt.toFixed(2),
      })
      message.success('RTK 坐标获取成功')
    } catch (error: any) {
      message.error(`获取 RTK 坐标失败：${error.message}`)
    }
  }

  // 创建地图（统一处理）
  const handleCreateMap = async (values: any) => {
    try {
      console.log('表单提交值:', values)
      
      // 使用 mapName 字段（避免嵌套问题）
      const mapName = typeof values.mapName === 'string' ? values.mapName.trim() : ''
      
      if (!mapName) {
        message.error('地图名称不能为空')
        return
      }
      
      const hasCoords = values.lat && values.lon
      const mapData: any = {
        name: mapName,
      }
      
      if (hasCoords) {
        mapData.origin = {
          lat: parseFloat(values.lat),
          lon: parseFloat(values.lon),
          alt: parseFloat(values.alt || 0),
        }
      }
      
      console.log('发送到后端的数据:', mapData)
      
      // 后端根据数据自动判断类型
      await mapsApi.createMap(mapData)
      
      const typeText = hasCoords ? 'GPS 地图' : '空地图'
      message.success(`${typeText}创建成功`)
      setCreateModalVisible(false)
      createForm.resetFields()
      loadMaps()
    } catch (error: any) {
      console.error('创建地图失败:', error)
      message.error(`创建失败：${error.message}`)
    }
  }

  // 创建地图（旧方法，保留兼容性）
  const handleCreate = async (values: any) => {
    try {
      await mapsApi.createMap(values.name)
      message.success('地图创建成功')
      setModalVisible(false)
      form.resetFields()
      loadMaps()
    } catch (error: any) {
      message.error(`创建失败：${error.message}`)
    }
  }

  // 打开重命名弹窗
  const handleOpenRename = (record: MapTableItem) => {
    setRenameMapInfo(record)
    renameForm.setFieldsValue({ newName: record.name })
    setRenameModalVisible(true)
  }

  // 重命名地图 + 修改坐标
  const handleRename = async (values: any) => {
    try {
      if (!renameMapInfo) return
      
      // 重命名
      if (values.newName && values.newName !== renameMapInfo.name) {
        await mapsApi.renameMap(renameMapInfo.name, values.newName)
      }
      
      // 更新坐标（如果有修改）
      if (values.lat !== undefined || values.lng !== undefined) {
        const lat = parseFloat(values.lat)
        const lng = parseFloat(values.lng)
        const alt = parseFloat(values.alt) || 0
        
        if (!isNaN(lat) && !isNaN(lng)) {
          // 调用后端 API 更新 GPS 配置
          try {
            const response = await fetch(`${API_BASE}/maps/${renameMapInfo.name}/gps-origin`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ lat, lng, alt }),
            })
            if (response.ok) {
              message.success('坐标已更新')
            }
          } catch (e) {
            console.warn('更新坐标失败:', e)
          }
        }
      }
      
      message.success('地图已更新')
      setRenameModalVisible(false)
      setRenameMapInfo(null)
      loadMaps()
    } catch (error: any) {
      message.error(`更新失败：${error.message}`)
    }
  }

  // 删除地图
  const handleDelete = async (name: string) => {
    try {
      await mapsApi.deleteMap(name)
      message.success('地图已删除')
      loadMaps()
    } catch (error: any) {
      message.error(`删除失败：${error.message}`)
    }
  }

  // 切换地图
  const handleSwitch = async (name: string) => {
    try {
      await mapsApi.switchMap(name)
      message.success(`已切换到地图：${name}`)
      onMapSelect?.(name)
      loadMaps()
    } catch (error: any) {
      message.error(`切换失败：${error.message}`)
    }
  }

  // 预览地图 - 打开操作 Modal
  const handlePreview = (record: MapTableItem) => {
    if (!record.has_pcd && !record.has_gps_config) {
      message.warning('该地图尚未建图，无法预览')
      return
    }
    
    setOperationMapInfo(record)
    setOperationMode('preview')
    setOperationModalVisible(true)
  }

  // 建图 - 打开操作 Modal
  const handleStartMapping = (record: MapTableItem) => {
    setOperationMapInfo(record)
    setOperationMode('mapping')
    setOperationModalVisible(true)
  }

  // 路径规划 - 打开操作 Modal
  const handlePathPlanning = (record: MapTableItem) => {
    setOperationMapInfo(record)
    setOperationMode('planning')
    setOperationModalVisible(true)
  }

  // 触屏友好的操作按钮样式
  const touchButtonStyle = {
    width: 48,
    height: 48,
    fontSize: 20,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  }

  const columns: ColumnsType<MapTableItem> = [
    {
      title: '地图名称',
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {record.is_active && (
            <Tag color="green" style={{ fontSize: 12, padding: '2px 8px', margin: 0 }}>
              <CheckCircleOutlined /> 当前
            </Tag>
          )}
          <span style={{ fontWeight: 600, fontSize: 15 }}>{text}</span>
        </div>
      ),
      fixed: 'left',
      width: 200,
    },
    {
      title: '创建时间',
      dataIndex: 'created_date',
      key: 'created_date',
      width: 120,
    },
    {
      title: '文件数',
      dataIndex: 'file_count',
      key: 'file_count',
      width: 90,
      align: 'right',
      render: (val) => <span style={{ fontSize: 14 }}>{val}</span>,
    },
    {
      title: '大小',
      dataIndex: 'size_mb',
      key: 'size_mb',
      width: 110,
      align: 'right',
      render: (text) => <span style={{ fontSize: 14, fontWeight: 500 }}>{text}</span>,
    },
    {
      title: '类型',
      key: 'type',
      width: 130,
      render: (_, record) => {
        if (record.has_pcd && record.has_gps_config) {
          return <Tag color="purple" style={{ fontSize: 13, padding: '4px 12px' }}>融合地图</Tag>
        } else if (record.has_gps_config) {
          return <Tag color="blue" style={{ fontSize: 13, padding: '4px 12px' }}>GPS 地图</Tag>
        } else if (record.has_pcd) {
          return <Tag color="green" style={{ fontSize: 13, padding: '4px 12px' }}>本地地图</Tag>
        } else {
          return <Tag color="gray" style={{ fontSize: 13, padding: '4px 12px' }}>空地图</Tag>
        }
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 420,
      fixed: 'right',
      align: 'right',
      render: (_, record) => (
        <Space size={6} wrap style={{ display: 'flex', justifyContent: 'flex-end' }}>
          {/* 切换 */}
          <Button
            type="primary"
            size="large"
            icon={<SwapOutlined />}
            onClick={() => handleSwitch(record.name)}
            style={{ 
              ...touchButtonStyle, 
              background: record.is_active ? '#52c41a' : '#1890ff',
              opacity: record.is_active ? 0.5 : 1,
            }}
            title={record.is_active ? '当前地图' : '切换'}
            disabled={record.is_active}
          />
          {/* 预览 */}
          <Button
            size="large"
            icon={<EyeOutlined />}
            onClick={() => handlePreview(record)}
            style={touchButtonStyle}
            title="预览"
            disabled={!record.has_pcd && !record.has_gps_config}
          />
          {/* 建图 */}
          <Button
            size="large"
            icon={<PlayCircleOutlined />}
            onClick={() => handleStartMapping(record)}
            style={touchButtonStyle}
            title="建图"
          />
          {/* 规划 */}
          <Button
            size="large"
            icon={<ScheduleOutlined />}
            onClick={() => handlePathPlanning(record)}
            style={touchButtonStyle}
            title="路径规划"
          />
          {/* 编辑（重命名） */}
          <Button
            size="large"
            icon={<EditOutlined />}
            onClick={() => handleOpenRename(record)}
            style={touchButtonStyle}
            title="重命名"
          />
          {/* 删除 */}
          <Popconfirm
            title="确定要删除此地图吗？"
            onConfirm={() => handleDelete(record.name)}
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button
              danger
              size="large"
              icon={<DeleteOutlined />}
              style={touchButtonStyle}
              title="删除"
            />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  // 统计信息
  const totalSize = maps.reduce((sum, m) => sum + m.total_size, 0)
  const totalFiles = maps.reduce((sum, m) => sum + m.file_count, 0)
  const pcdMaps = maps.filter((m) => m.has_pcd).length
  const gpsMaps = maps.filter((m) => m.has_gps_config && !m.has_pcd).length
  const emptyMaps = maps.filter((m) => !m.has_pcd && !m.has_gps_config).length

  return (
    <div>
      {/* 统计卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card
            style={{
              borderRadius: 8,
              border: 'none',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            }}
          >
            <Statistic
              title="地图总数"
              value={maps.length}
              prefix={<AppstoreOutlined />}
              valueStyle={{ color: '#1890ff', fontSize: 28 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card
            style={{
              borderRadius: 8,
              border: 'none',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            }}
          >
            <Statistic
              title="已建图"
              value={pcdMaps}
              suffix="个"
              valueStyle={{ color: '#52c41a', fontSize: 28 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card
            style={{
              borderRadius: 8,
              border: 'none',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            }}
          >
            <Statistic
              title="空地图"
              value={emptyMaps}
              suffix="个"
              valueStyle={{ color: '#8c8c8c', fontSize: 28 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card
            style={{
              borderRadius: 8,
              border: 'none',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            }}
          >
            <Statistic
              title="总大小"
              value={(totalSize / (1024 * 1024)).toFixed(1)}
              suffix="MB"
              valueStyle={{ color: '#722ed1', fontSize: 28 }}
            />
          </Card>
        </Col>
      </Row>

      {/* 地图列表 */}
      <Card
        title={<span style={{ fontSize: 16, fontWeight: 600 }}>地图列表</span>}
        extra={
          <Space size={12}>
            <Button 
              icon={<ReloadOutlined />} 
              onClick={loadMaps}
              size="large"
              style={{ fontSize: 14, padding: '8px 16px' }}
            >
              刷新
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleOpenCreateModal}
              size="large"
              style={{ fontSize: 14, padding: '8px 16px' }}
            >
              新建地图
            </Button>
          </Space>
        }
        style={{
          borderRadius: 8,
          border: 'none',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        }}
      >
        <Table
          columns={columns}
          dataSource={maps}
          loading={loading}
          pagination={{ pageSize: 10, showSizeChanger: true, showQuickJumper: true }}
          scroll={{ x: 1200 }}
          rowClassName={(record) => record.is_active ? 'active-row' : ''}
          rowStyle={{ background: '#fff' }}
        />
      </Card>

      {/* 新建地图弹窗（简化版） */}
      <Modal
        title="新建地图"
        open={createModalVisible}
        onCancel={handleCancelCreate}
        onOk={() => createForm.submit()}
        width={600}
      >
        <Form
          form={createForm}
          layout="vertical"
          onFinish={handleCreateMap}
        >
          <Form.Item
            name="mapName"
            label="地图名称"
            rules={[
              { required: true, message: '请输入地图名称' },
              { pattern: /^[\u4e00-\u9fa5a-zA-Z0-9_-]+$/, message: '只能包含中文、字母、数字、下划线和短横线' },
            ]}
          >
            <Input placeholder="例如：sigu" size="large" />
          </Form.Item>
          
          <Divider>GPS 坐标（选填）</Divider>
          
          <Row gutter={16}>
            <Col span={10}>
              <Form.Item
                name="lat"
                label="纬度 (WGS84)"
                rules={[
                  { pattern: /^-?\d+(\.\d+)?$/, message: '请输入有效数字' },
                  { validator: (_, value) => {
                      if (!value) return Promise.resolve();
                      const num = parseFloat(value);
                      if (num >= -90 && num <= 90) return Promise.resolve();
                      return Promise.reject('纬度范围：-90 到 90');
                    }}
                ]}
              >
                <Input placeholder="例如：31.2304" size="large" />
              </Form.Item>
            </Col>
            <Col span={10}>
              <Form.Item
                name="lon"
                label="经度 (WGS84)"
                rules={[
                  { pattern: /^-?\d+(\.\d+)?$/, message: '请输入有效数字' },
                  { validator: (_, value) => {
                      if (!value) return Promise.resolve();
                      const num = parseFloat(value);
                      if (num >= -180 && num <= 180) return Promise.resolve();
                      return Promise.reject('经度范围：-180 到 180');
                    }}
                ]}
              >
                <Input placeholder="例如：121.4737" size="large" />
              </Form.Item>
            </Col>
            <Col span={4}>
              <Form.Item label=" ">
                <Button
                  type="primary"
                  icon={<span>📍</span>}
                  onClick={handleGetFromRTK}
                  block
                >
                  获取
                </Button>
              </Form.Item>
            </Col>
          </Row>
          
          <Form.Item name="alt" label="海拔 (米)">
            <Input placeholder="例如：5.2" size="large" />
          </Form.Item>
          
          <div style={{ marginTop: 16, padding: '12px', background: '#f5f5f5', borderRadius: 4, fontSize: 13, color: '#666' }}>
            💡 <strong>提示：</strong>
            <ul style={{ margin: '8px 0 0 16px', padding: 0 }}>
              <li>只填名称：创建空地图（后续可建图）</li>
              <li>填写坐标：创建 GPS 地图（可用于户外导航）</li>
              <li>点击"获取"按钮可从 RTK 读取当前坐标</li>
            </ul>
          </div>
        </Form>
      </Modal>

      {/* 地图操作 Modal */}
      <MapOperationModal
        mapInfo={operationMapInfo || ({} as MapInfo)}
        mode={operationMode}
        visible={operationModalVisible}
        onClose={() => {
          setOperationModalVisible(false)
          setOperationMapInfo(null)
        }}
      />

      {/* 编辑地图弹窗（重命名 + 修改坐标） */}
      <Modal
        title="编辑地图"
        open={renameModalVisible}
        onCancel={() => {
          setRenameModalVisible(false)
          setRenameMapInfo(null)
          renameForm.resetFields()
        }}
        onOk={() => renameForm.submit()}
        width={600}
      >
        <Form
          form={renameForm}
          layout="vertical"
          onFinish={handleRename}
          initialValues={{
            lat: renameMapInfo?.gps_origin?.lat,
            lng: renameMapInfo?.gps_origin?.lng,
            alt: renameMapInfo?.gps_origin?.alt,
          }}
        >
          <Form.Item
            name="newName"
            label="地图名称"
            rules={[
              { required: true, message: '请输入名称' },
              { pattern: /^[\u4e00-\u9fa5a-zA-Z0-9_-]+$/, message: '只能包含中文、字母、数字、下划线和短横线' },
            ]}
          >
            <Input placeholder="输入新名称" size="large" />
          </Form.Item>

          <Divider orientation="left" style={{ fontSize: 13, color: '#666' }}>GPS 坐标（WGS84）</Divider>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="lat"
                label="纬度"
                rules={[
                  { pattern: /^-?\d+(\.\d+)?$/, message: '请输入有效数字' },
                  { validator: (_, value) => {
                      if (!value) return Promise.resolve();
                      const num = parseFloat(value);
                      if (num >= -90 && num <= 90) return Promise.resolve();
                      return Promise.reject('纬度范围：-90 到 90');
                    }}
                ]}
              >
                <Input placeholder="例如：30.4779" size="large" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="lng"
                label="经度"
                rules={[
                  { pattern: /^-?\d+(\.\d+)?$/, message: '请输入有效数字' },
                  { validator: (_, value) => {
                      if (!value) return Promise.resolve();
                      const num = parseFloat(value);
                      if (num >= -180 && num <= 180) return Promise.resolve();
                      return Promise.reject('经度范围：-180 到 180');
                    }}
                ]}
              >
                <Input placeholder="例如：114.3609" size="large" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="alt" label="海拔 (米)">
                <Input placeholder="例如：50" size="large" />
              </Form.Item>
            </Col>
          </Row>

          <Alert
            message="💡 提示"
            description="修改坐标后，地图将转换为 GPS 地图或融合地图（取决于是否有 PCD 数据）"
            type="info"
            showIcon
            style={{ marginTop: 8 }}
          />
        </Form>
      </Modal>

      {/* 新建/重命名对话框（旧版，保留兼容性） */}
      <Modal
        title={editingMap ? '重命名地图' : '新建地图'}
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false)
          form.resetFields()
          setEditingMap(null)
        }}
        onOk={() => form.submit()}
        confirmLoading={loading}
        width={520}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreate}
        >
          <Form.Item
            name="name"
            label={<span style={{ fontSize: 14, fontWeight: 500 }}>地图名称</span>}
            rules={[
              { required: true, message: '请输入地图名称' },
              { pattern: /^[\u4e00-\u9fa5a-zA-Z0-9_-]+$/, message: '只能包含中文、字母、数字、下划线和短横线' },
            ]}
          >
            <Input 
              placeholder="例如：orchard_001" 
              disabled={!!editingMap}
              size="large"
              style={{ fontSize: 15 }}
            />
          </Form.Item>
          {editingMap && (
            <Form.Item
              name="newName"
              label={<span style={{ fontSize: 14, fontWeight: 500 }}>新名称</span>}
              rules={[
                { required: true, message: '请输入新名称' },
                { pattern: /^[\u4e00-\u9fa5a-zA-Z0-9_-]+$/, message: '只能包含中文、字母、数字、下划线和短横线' },
              ]}
            >
              <Input 
                placeholder="输入新名称"
                size="large"
                style={{ fontSize: 15 }}
              />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  )
}

export default MapManager
