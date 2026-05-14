import React, { useState, useEffect } from 'react'
import { Card, Button, Space, Input, Table, message, Modal, Form, Row, Col, Statistic, Tag } from 'antd'
import { PlusOutlined, SaveOutlined, DeleteOutlined, CheckCircleOutlined } from '@ant-design/icons'

const { TextArea } = Input
const API_BASE = `http://${window.location.hostname || 'localhost'}:5000/api`

/**
 * GPS 地图创建页面
 * 
 * 功能:
 * 1. 创建新地图
 * 2. 添加控制点（GPS 坐标 + 本地坐标）
 * 3. 计算配准参数
 * 4. 保存地图配置
 */
const GPSMapCreate = () => {
  const [maps, setMaps] = useState([])
  const [modalVisible, setModalVisible] = useState(false)
  const [form] = Form.useForm()
  const [currentMap, setCurrentMap] = useState(null)
  const [controlPoints, setControlPoints] = useState([])
  const [transform, setTransform] = useState(null)
  const [loading, setLoading] = useState(false)

  // 加载地图列表
  useEffect(() => {
    loadMaps()
  }, [])

  const loadMaps = async () => {
    try {
      const response = await fetch(`${API_BASE}/gps_map/list`)
      const data = await response.json()
      setMaps(data.maps || [])
    } catch (error) {
      console.error('加载地图列表失败:', error)
    }
  }

  // 创建地图
  const handleCreate = async (values) => {
    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/gps_map/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values)
      })
      const data = await response.json()
      
      if (response.ok) {
        message.success(`地图 ${values.name} 创建成功！`)
        setModalVisible(false)
        form.resetFields()
        loadMaps()
      } else {
        message.error(data.error || '创建失败')
      }
    } catch (error) {
      message.error('网络错误')
    } finally {
      setLoading(false)
    }
  }

  // 打开地图编辑
  const handleOpenMap = async (mapId) => {
    try {
      const response = await fetch(`${API_BASE}/gps_map/${mapId}/config`)
      const data = await response.json()
      setCurrentMap(data)
      setControlPoints(data.controlPoints || [])
      setTransform(data.transform)
      message.info(`已加载地图：${data.name}`)
    } catch (error) {
      message.error('加载地图配置失败')
    }
  }

  // 添加控制点
  const handleAddControlPoint = () => {
    const newPoint = {
      gps: { lat: 39.9042, lon: 116.4074 },
      local: { x: 0, y: 0 }
    }
    setControlPoints([...controlPoints, newPoint])
  }

  // 更新控制点
  const handleUpdateControlPoint = (index, field, subfield, value) => {
    const newPoints = [...controlPoints]
    if (subfield) {
      newPoints[index][field][subfield] = parseFloat(value) || 0
    } else {
      newPoints[index][field] = value
    }
    setControlPoints(newPoints)
  }

  // 删除控制点
  const handleDeleteControlPoint = (index) => {
    const newPoints = controlPoints.filter((_, i) => i !== index)
    setControlPoints(newPoints)
  }

  // 计算配准参数
  const handleCalculate = async () => {
    if (controlPoints.length < 3) {
      message.warning('至少需要 3 个控制点')
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/gps_map/save_transform`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          map_id: currentMap.id,
          control_points: controlPoints
        })
      })
      const data = await response.json()
      
      if (response.ok) {
        setTransform(data.transform)
        message.success(`配准成功！误差：${data.transform.error.toFixed(3)} 米`)
      } else {
        message.error(data.error || '配准失败')
      }
    } catch (error) {
      message.error('网络错误')
    } finally {
      setLoading(false)
    }
  }

  // 控制点表格列
  const controlPointColumns = [
    {
      title: '#',
      dataIndex: 'index',
      key: 'index',
      width: 50,
      render: (_, __, index) => index + 1
    },
    {
      title: 'GPS 纬度',
      dataIndex: ['gps', 'lat'],
      key: 'gps_lat',
      width: 120,
      render: (val, _, index) => (
        <Input
          type="number"
          step="0.000001"
          value={val}
          onChange={(e) => handleUpdateControlPoint(index, 'gps', 'lat', e.target.value)}
          style={{ width: '100%' }}
        />
      )
    },
    {
      title: 'GPS 经度',
      dataIndex: ['gps', 'lon'],
      key: 'gps_lon',
      width: 120,
      render: (val, _, index) => (
        <Input
          type="number"
          step="0.000001"
          value={val}
          onChange={(e) => handleUpdateControlPoint(index, 'gps', 'lon', e.target.value)}
          style={{ width: '100%' }}
        />
      )
    },
    {
      title: '本地 X (米)',
      dataIndex: ['local', 'x'],
      key: 'local_x',
      width: 100,
      render: (val, _, index) => (
        <Input
          type="number"
          value={val}
          onChange={(e) => handleUpdateControlPoint(index, 'local', 'x', e.target.value)}
          style={{ width: '100%' }}
        />
      )
    },
    {
      title: '本地 Y (米)',
      dataIndex: ['local', 'y'],
      key: 'local_y',
      width: 100,
      render: (val, _, index) => (
        <Input
          type="number"
          value={val}
          onChange={(e) => handleUpdateControlPoint(index, 'local', 'y', e.target.value)}
          style={{ width: '100%' }}
        />
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_, __, index) => (
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={() => handleDeleteControlPoint(index)}
        />
      )
    }
  ]

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)', padding: '24px' }}>
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          <Button onClick={() => window.history.back()}>← 返回</Button>
          <span style={{ color: '#fff', fontSize: '20px', fontWeight: 'bold' }}>🗺️ GPS 地图创建</span>
        </Space>
        <Button 
          type="primary" 
          icon={<PlusOutlined />} 
          onClick={() => setModalVisible(true)}
        >
          新建地图
        </Button>
      </div>

      <Row gutter={24}>
        <Col xs={24} lg={12}>
          <Card title="📂 地图列表" style={{ borderRadius: '16px', border: 'none', marginBottom: '24px' }}>
            <Table
              dataSource={maps}
              rowKey="id"
              columns={[
                { title: '名称', dataIndex: 'name', key: 'name' },
                { 
                  title: '类型', 
                  dataIndex: 'type',
                  render: (t) => <Tag color={t === 'gps' ? 'green' : 'blue'}>{t === 'gps' ? '🌍 GPS' : '📁 本地'}</Tag>
                },
                {
                  title: '操作',
                  key: 'action',
                  render: (_, record) => (
                    <Button
                      type="link"
                      onClick={() => handleOpenMap(record.id)}
                    >
                      编辑
                    </Button>
                  )
                }
              ]}
              pagination={{ pageSize: 5 }}
            />
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          {currentMap && (
            <Card title={`📍 编辑地图：${currentMap.name}`} style={{ borderRadius: '16px', border: 'none' }}>
              <Space direction="vertical" style={{ width: '100%' }} size="large">
                <Row gutter={16}>
                  <Col span={12}>
                    <Statistic 
                      title="控制点数" 
                      value={controlPoints.length} 
                      suffix="个"
                      valueStyle={{ color: controlPoints.length >= 3 ? '#52c41a' : '#faad14' }}
                    />
                  </Col>
                  <Col span={12}>
                    <Statistic 
                      title="配准误差" 
                      value={transform?.error?.toFixed(3) || '-'} 
                      suffix="米"
                      valueStyle={{ color: transform?.error < 0.03 ? '#52c41a' : '#faad14' }}
                    />
                  </Col>
                </Row>

                <div>
                  <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
                    <strong>控制点列表</strong>
                    <Button 
                      type="dashed" 
                      size="small" 
                      icon={<PlusOutlined />}
                      onClick={handleAddControlPoint}
                    >
                      添加控制点
                    </Button>
                  </div>
                  <Table
                    dataSource={controlPoints}
                    rowKey={(_, index) => index}
                    columns={controlPointColumns}
                    pagination={false}
                    size="small"
                    scroll={{ y: 300 }}
                  />
                </div>

                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Button
                    type="primary"
                    icon={<CheckCircleOutlined />}
                    onClick={handleCalculate}
                    loading={loading}
                    disabled={controlPoints.length < 3}
                  >
                    计算配准参数
                  </Button>
                  <Button
                    type="default"
                    icon={<SaveOutlined />}
                    onClick={() => message.success('配置已自动保存')}
                  >
                    保存配置
                  </Button>
                </Space>

                {transform && (
                  <Card title="🔧 配准参数" size="small" style={{ width: '100%' }}>
                    <div style={{ fontSize: '12px' }}>
                      <div>原点纬度：{transform.origin_lat.toFixed(6)}</div>
                      <div>原点经度：{transform.origin_lon.toFixed(6)}</div>
                      <div>缩放比例：{transform.scale.toFixed(6)}</div>
                      <div>旋转角度：{transform.rotation.toFixed(6)} rad</div>
                      <div>平移 X: {transform.translation_x.toFixed(3)} m</div>
                      <div>平移 Y: {transform.translation_y.toFixed(3)} m</div>
                      <div style={{ marginTop: '8px', fontWeight: 'bold' }}>
                        配准误差：{transform.error.toFixed(3)} m
                        {transform.error < 0.03 && <Tag color="green" style={{ marginLeft: '8px' }}>优秀</Tag>}
                      </div>
                    </div>
                  </Card>
                )}
              </Space>
            </Card>
          )}
        </Col>
      </Row>

      {/* 新建地图对话框 */}
      <Modal
        title="新建 GPS 地图"
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreate}
        >
          <Form.Item
            name="name"
            label="地图名称"
            rules={[{ required: true, message: '请输入地图名称' }]}
          >
            <Input placeholder="例如：sigu_orchard_north" />
          </Form.Item>
          <Form.Item
            name="description"
            label="地图描述"
          >
            <TextArea rows={3} placeholder="地图描述..." />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>
              创建
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default GPSMapCreate
