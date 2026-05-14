/**
 * MapManager.tsx - 新建地图 Modal 部分（简化版）
 */

// 状态定义（简化）
const [createModalVisible, setCreateModalVisible] = useState(false)
const [createForm] = Form.useForm()

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
    const hasCoords = values.lat && values.lon
    const mapData: any = {
      name: values.name,
    }
    
    if (hasCoords) {
      mapData.origin = {
        lat: parseFloat(values.lat),
        lon: parseFloat(values.lon),
        alt: parseFloat(values.alt || 0),
      }
    }
    
    // 后端根据数据自动判断类型
    await mapsApi.createMap(mapData)
    
    const typeText = hasCoords ? 'GPS 地图' : '空地图'
    message.success(`${typeText}创建成功`)
    setCreateModalVisible(false)
    createForm.resetFields()
    loadMaps()
  } catch (error: any) {
    message.error(`创建失败：${error.message}`)
  }
}

// Modal JSX
return (
  <>
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
          name="name"
          label="地图名称"
          rules={[
            { required: true, message: '请输入地图名称' },
            { pattern: /^[a-zA-Z0-9_-]+$/, message: '只能包含字母、数字、下划线和短横线' },
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
                { type: 'number', min: -90, max: 90, message: '纬度范围：-90 到 90' },
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
                { type: 'number', min: -180, max: 180, message: '经度范围：-180 到 180' },
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
  </>
)
