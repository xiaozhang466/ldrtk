import React, { useState } from 'react'
import { Card, Table, Button, Space, Modal, Form, Input, Select, message, Tag, Divider } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined, PlayCircleOutlined } from '@ant-design/icons'

const { Option } = Select
const { TextArea } = Input

const initialMaps = [
  { key: '1', name: 'sigu', type: 'local', size: '3.0 MB', date: '2026-03-10', status: 'active', waypoints: 12, area: '0.5 公顷', description: '测试场地' },
  { key: '2', name: '睿程佑', type: 'local', size: '49.6 MB', date: '2026-03-08', status: 'inactive', waypoints: 45, area: '12.3 公顷', description: '大型果园' },
  { key: '3', name: 'yunlianzn', type: 'local', size: '31.8 MB', date: '2026-03-05', status: 'inactive', waypoints: 28, area: '8.5 公顷', description: '中型果园' },
]

const MapPage = () => {
  const [maps, setMaps] = useState(initialMaps)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingMap, setEditingMap] = useState(null)
  const [loading, setLoading] = useState(false)
  const [form] = Form.useForm()
  
  const handleLoadMap = (mapName) => {
    setLoading(true)
    message.info(`正在加载地图：${mapName}...`)
    setTimeout(() => {
      setMaps(maps.map(m => ({ ...m, status: m.name === mapName ? 'active' : 'inactive' })))
      setLoading(false)
      message.success(`地图 ${mapName} 加载成功！`)
    }, 1500)
  }
  
  const handleSaveMap = async (values) => {
    try {
      if (editingMap) {
        setMaps(maps.map(m => m.key === editingMap.key ? { ...m, ...values } : m))
        message.success('地图信息已更新')
      } else {
        setMaps([...maps, { key: Date.now().toString(), ...values, size: '0 MB', date: new Date().toISOString().split('T')[0], status: 'inactive', waypoints: 0, area: '0 公顷' }])
        message.success('地图已创建')
      }
      setModalVisible(false)
      form.resetFields()
      setEditingMap(null)
    } catch (error) {
      message.error('保存失败')
    }
  }
  
  const handleDeleteMap = (key) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除这个地图吗？',
      okText: '删除', okType: 'danger', cancelText: '取消',
      onOk: () => { setMaps(maps.filter(m => m.key !== key)); message.success('地图已删除') }
    })
  }
  
  const handleEditMap = (record) => {
    setEditingMap(record)
    form.setFieldsValue(record)
    setModalVisible(true)
  }
  
  const columns = [
    { title: '地图名称', dataIndex: 'name', key: 'name', render: (text, r) => <span style={{ fontWeight: r.status === 'active' ? 'bold' : 'normal' }}>{r.status === 'active' && '● '}{text}</span> },
    { title: '类型', dataIndex: 'type', render: (t) => <Tag color={t === 'local' ? 'green' : 'blue'}>{t === 'local' ? '📁 本地' : '☁️ 云端'}</Tag> },
    { title: '大小', dataIndex: 'size' },
    { title: '路径点', dataIndex: 'waypoints', render: (wp) => `${wp} 个` },
    { title: '面积', dataIndex: 'area' },
    { title: '日期', dataIndex: 'date' },
    { title: '状态', dataIndex: 'status', render: (s) => <Tag color={s === 'active' ? 'green' : 'default'}>{s === 'active' ? '使用中' : '未使用'}</Tag> },
    {
      title: '操作', key: 'action', render: (_, r) => (
        <Space size="small">
          <Button type={r.status === 'active' ? 'default' : 'primary'} size="small" icon={<PlayCircleOutlined />} onClick={() => handleLoadMap(r.name)} disabled={r.status === 'active'}>{r.status === 'active' ? '使用中' : '加载'}</Button>
          <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => message.info(`预览：${r.name}`)} />
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEditMap(r)} />
          <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDeleteMap(r.key)} />
        </Space>
      )
    },
  ]
  
  const currentMap = maps.find(m => m.status === 'active')
  
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)', padding: '24px' }}>
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          <Button onClick={() => window.history.back()}>← 返回</Button>
          <span style={{ color: '#fff', fontSize: '20px', fontWeight: 'bold' }}>📍 地图管理</span>
        </Space>
        <Tag color="green">当前：{currentMap ? currentMap.name : '无'}</Tag>
      </div>
      
      <Card title="📂 地图列表" titleStyle={{color:'#fff'}} extra={<Space><Button>导入</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => {setEditingMap(null);form.resetFields();setModalVisible(true)}}>新建</Button></Space>} style={{borderRadius:'16px',border:'none',marginBottom:'24px'}}>
        <Table columns={columns} dataSource={maps} pagination={{pageSize:5}} loading={loading} />
      </Card>
      
      {currentMap && (
        <Card title="📊 当前地图信息" titleStyle={{color:'#fff'}} style={{borderRadius:'16px',border:'none'}}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'24px',marginBottom:'24px'}}>
            <div><div style={{color:'#999',marginBottom:'8px'}}>地图名称</div><div style={{fontSize:'18px',fontWeight:'bold'}}>{currentMap.name}</div></div>
            <div><div style={{color:'#999',marginBottom:'8px'}}>存储目录</div><div style={{fontSize:'14px',wordBreak:'break-all'}}>data/maps/{currentMap.name}/</div></div>
            <div><div style={{color:'#999',marginBottom:'8px'}}>PCD 点云地图</div></div>
            <div><div style={{color:'#999',marginBottom:'8px'}}>UTM 坐标系</div></div>
          </div>
          <Divider style={{borderColor:'rgba(255,255,255,0.3)'}} />
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'24px'}}>
            <div><div style={{color:'#999',marginBottom:'8px'}}>路径点</div><div style={{fontSize:'24px',fontWeight:'bold',color:'#1890ff'}}>{currentMap.waypoints} 个</div></div>
            <div><div style={{color:'#999',marginBottom:'8px'}}>面积</div><div style={{fontSize:'24px',fontWeight:'bold',color:'#52c41a'}}>{currentMap.area}</div></div>
            <div><div style={{color:'#999',marginBottom:'8px'}}>大小</div><div style={{fontSize:'24px',fontWeight:'bold',color:'#faad14'}}>{currentMap.size}</div></div>
          </div>
        </Card>
      )}
      
      <Modal title={editingMap ? '编辑地图' : '新建地图'} open={modalVisible} onCancel={() => {setModalVisible(false);form.resetFields();setEditingMap(null)}} footer={[<Button key="cancel" onClick={() => setModalVisible(false)}>取消</Button>,<Button key="submit" type="primary" onClick={() => form.submit()}>保存</Button>]}>
        <Form form={form} layout="vertical" onFinish={handleSaveMap}>
          <Form.Item name="name" label="地图名称" rules={[{required:true,message:'请输入名称'}]}><Input placeholder="orchard_001" /></Form.Item>
          <Form.Item name="type" label="类型" initialValue="local"><Select><Option value="local">📁 本地</Option><Option value="cloud">☁️ 云端</Option></Select></Form.Item>
          <Form.Item name="description" label="描述"><TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default MapPage
