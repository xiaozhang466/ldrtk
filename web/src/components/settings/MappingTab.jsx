/**
 * 建图配置标签页
 * 
 * 提供栅格化参数配置功能：
 * - Z轴滤波参数
 * - 半径滤波参数
 * - 分辨率设置
 */

import React, { useState, useEffect } from 'react';
import { Form, InputNumber, Button, Card, message, Divider, Space } from 'antd';

const defaultParams = {
  thre_z_min: 0.1,
  thre_z_max: 1.5,
  thre_radius: 0.3,
  thres_point_count: 30,
  resolution: 0.05,
};

/**
 * 建图配置标签页组件
 */
const MappingTab = ({ loading }) => {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [params, setParams] = useState(defaultParams);

  // 加载当前配置
  useEffect(() => {
    loadParams();
  }, []);

  // 从 ROS param 加载配置
  const loadParams = async () => {
    try {
      // 模拟从 ROS 或 API 加载配置
      // 实际应通过 ROS service 或 API 获取
      const savedParams = localStorage.getItem('mappingParams');
      if (savedParams) {
        const parsed = JSON.parse(savedParams);
        setParams(parsed);
        form.setFieldsValue(parsed);
      } else {
        form.setFieldsValue(defaultParams);
      }
    } catch (error) {
      console.error('加载配置失败:', error);
    }
  };

  // 保存配置
  const handleSave = async () => {
    try {
      setSaving(true);
      const values = await form.validateFields();
      
      // 保存到本地存储
      localStorage.setItem('mappingParams', JSON.stringify(values));
      
      // TODO: 调用 ROS service 或 API 同步到 ROS param
      message.success('配置已保存');
      setParams(values);
    } catch (error) {
      console.error('保存失败:', error);
    } finally {
      setSaving(false);
    }
  };

  // 重置为默认值
  const handleReset = () => {
    form.setFieldsValue(defaultParams);
    message.info('已重置为默认值');
  };

  return (
    <div>
      <Card title="栅格化参数配置" style={{ marginBottom: 16 }}>
        <Form
          form={form}
          layout="vertical"
          initialValues={params}
        >
          <Divider orientation="left">Z轴滤波参数</Divider>
          <p style={{ color: '#666', marginBottom: 16 }}>
            过滤掉高度不在指定范围内的点云数据
          </p>
          
          <Space size="large" style={{ display: 'flex', flexWrap: 'wrap' }}>
            <Form.Item
              label="最小高度 (m)"
              name="thre_z_min"
              rules={[{ required: true, message: '请输入最小高度' }]}
            >
              <InputNumber
                min={0}
                max={10}
                step={0.1}
                style={{ width: 150 }}
                precision={2}
                addonAfter="m"
              />
            </Form.Item>

            <Form.Item
              label="最大高度 (m)"
              name="thre_z_max"
              rules={[{ required: true, message: '请输入最大高度' }]}
            >
              <InputNumber
                min={0}
                max={10}
                step={0.1}
                style={{ width: 150 }}
                precision={2}
                addonAfter="m"
              />
            </Form.Item>
          </Space>

          <Divider orientation="left">半径滤波参数</Divider>
          <p style={{ color: '#666', marginBottom: 16 }}>
            移除指定半径范围内邻居点数量少于阈值的孤立点
          </p>

          <Space size="large" style={{ display: 'flex', flexWrap: 'wrap' }}>
            <Form.Item
              label="滤波半径 (m)"
              name="thre_radius"
              rules={[{ required: true, message: '请输入滤波半径' }]}
            >
              <InputNumber
                min={0.1}
                max={5}
                step={0.1}
                style={{ width: 150 }}
                precision={2}
                addonAfter="m"
              />
            </Form.Item>

            <Form.Item
              label="最小邻居数"
              name="thres_point_count"
              rules={[{ required: true, message: '请输入最小邻居数' }]}
            >
              <InputNumber
                min={1}
                max={100}
                step={1}
                style={{ width: 150 }}
              />
            </Form.Item>
          </Space>

          <Divider orientation="left">栅格地图参数</Divider>

          <Form.Item
            label="分辨率 (m/像素)"
            name="resolution"
            rules={[{ required: true, message: '请输入分辨率' }]}
          >
            <InputNumber
              min={0.01}
              max={1}
              step={0.01}
              style={{ width: 150 }}
              precision={3}
              addonAfter="m/px"
            />
          </Form.Item>
        </Form>
      </Card>

      <Space>
        <Button
          type="primary"
          onClick={handleSave}
          loading={saving}
          disabled={loading}
        >
          保存配置
        </Button>
        <Button onClick={handleReset}>
          重置
        </Button>
      </Space>
    </div>
  );
};

export default MappingTab;
