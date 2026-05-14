/**
 * 地图管理组件 - 新建地图 Modal 部分
 */

// 状态管理
const [createModalVisible, setCreateModalVisible] = useState(false)
const [createStep, setCreateStep] = useState<'select' | 'form'>('select')
const [createType, setCreateType] = useState<'gps' | 'fusion'>('gps')
const [createForm] = Form.useForm()

// 打开创建地图弹窗
const handleOpenCreateModal = () => {
  setCreateStep('select')
  setCreateType('gps')
  setCreateModalVisible(true)
  createForm.resetFields()
}

// 选择地图类型
const handleSelectType = (type: 'gps' | 'fusion') => {
  setCreateType(type)
  setCreateStep('form')
}

// 返回类型选择
const handleBackToSelect = () => {
  setCreateStep('select')
}

// 取消创建
const handleCancelCreate = () => {
  setCreateModalVisible(false)
  setCreateStep('select')
  createForm.resetFields()
}

// Modal JSX
return (
  <>
    {/* 类型选择 Modal */}
    <Modal
      title="选择地图类型"
      open={createModalVisible && createStep === 'select'}
      onCancel={handleCancelCreate}
      footer={null}
      width={600}
      maskClosable={false}
    >
      <div style={{ padding: '20px 0' }}>
        <Card 
          hoverable 
          onClick={() => handleSelectType('gps')}
          style={{ marginBottom: 16, cursor: 'pointer' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ fontSize: 32 }}>🌍</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>GPS 地图</div>
              <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>
                基于 RTK GPS 坐标创建的地图，适用于户外果园
              </div>
            </div>
            <div style={{ fontSize: 20, color: '#1890ff' }}>→</div>
          </div>
        </Card>
        <Card 
          hoverable 
          onClick={() => handleSelectType('fusion')}
          style={{ cursor: 'pointer' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ fontSize: 32 }}>🗺️</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>融合地图</div>
              <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>
                融合 PCD 点云和 GPS 坐标，适用于室内外混合场景
              </div>
            </div>
            <div style={{ fontSize: 20, color: '#1890ff' }}>→</div>
          </div>
        </Card>
      </div>
    </Modal>

    {/* GPS 地图表单 Modal */}
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button type="text" icon={<span>←</span>} onClick={handleBackToSelect} size="small" />
          <span>创建 GPS 地图</span>
        </div>
      }
      open={createModalVisible && createStep === 'form' && createType === 'gps'}
      onCancel={handleCancelCreate}
      onOk={() => createForm.submit()}
      width={600}
    >
      <Form form={createForm} layout="vertical" onFinish={handleCreateGPS}>
        <Form.Item name="name" label="地图名称" rules={[{ required: true }]}>
          <Input placeholder="例如：sigu" size="large" />
        </Form.Item>
        <Form.Item name="lat" label="纬度 (WGS84)" rules={[{ required: true }]}>
          <Input placeholder="例如：31.2304" size="large" />
        </Form.Item>
        <Form.Item name="lon" label="经度 (WGS84)" rules={[{ required: true }]}>
          <Input placeholder="例如：121.4737" size="large" />
        </Form.Item>
        <Form.Item name="alt" label="海拔 (米)">
          <Input placeholder="例如：5.2" size="large" />
        </Form.Item>
      </Form>
    </Modal>

    {/* 融合地图表单 Modal */}
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button type="text" icon={<span>←</span>} onClick={handleBackToSelect} size="small" />
          <span>创建融合地图</span>
        </div>
      }
      open={createModalVisible && createStep === 'form' && createType === 'fusion'}
      onCancel={handleCancelCreate}
      onOk={() => createForm.submit()}
      width={600}
    >
      <Form form={createForm} layout="vertical" onFinish={handleCreateFusion}>
        <Form.Item name="name" label="地图名称" rules={[{ required: true }]}>
          <Input placeholder="例如：orchard_fusion_001" size="large" />
        </Form.Item>
        <Form.Item name="pcdFile" label="PCD 文件" rules={[{ required: true }]}>
          <Input placeholder="/path/to/pointcloud.pcd" size="large" />
        </Form.Item>
        <Form.Item name="lat" label="纬度 (WGS84)" rules={[{ required: true }]}>
          <Input placeholder="例如：31.2304" size="large" />
        </Form.Item>
        <Form.Item name="lon" label="经度 (WGS84)" rules={[{ required: true }]}>
          <Input placeholder="例如：121.4737" size="large" />
        </Form.Item>
        <Form.Item name="alt" label="海拔 (米)">
          <Input placeholder="例如：5.2" size="large" />
        </Form.Item>
      </Form>
    </Modal>
  </>
)
