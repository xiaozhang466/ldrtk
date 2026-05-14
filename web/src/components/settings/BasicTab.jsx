/**
 * 基本配置标签页
 * 
 * 提供系统基本参数配置
 */

import React, { useState, useEffect } from 'react';
import { Form, Input, InputNumber, Button, Space, Divider, message } from 'antd';
import { RosParam } from '../../utils/ros';

/**
 * 基本配置组件
 */
const BasicTab = ({ loading }) => {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  // 加载配置
  useEffect(() => {
    loadConfig();
  }, []);

  /**
   * 加载配置
   */
  const loadConfig = async () => {
    try {
      // TODO: 从 ROS 参数服务器加载基本配置
      // 示例:
      // const robotNameParam = new RosParam('/sigucar/robot_name');
      // const robotName = await robotNameParam.get();
      
      form.setFieldsValue({
        robot_name: 'rtk-robot',
        max_speed: 1.0,
        max_acceleration: 0.5,
      });
      
      message.success('配置加载成功');
    } catch (error) {
      console.error('Failed to load config:', error);
      message.error('配置加载失败');
    }
  };

  /**
   * 保存配置
   */
  const handleSave = async (values) => {
    setSaving(true);
    
    try {
      // TODO: 保存到 ROS 参数服务器
      // 示例:
      // const robotNameParam = new RosParam('/sigucar/robot_name');
      // await robotNameParam.set(values.robot_name);
      
      console.log('Saving config:', values);
      
      message.success('配置保存成功');
    } catch (error) {
      console.error('Failed to save config:', error);
      message.error('配置保存失败');
    } finally {
      setSaving(false);
    }
  };

  /**
   * 重置配置
   */
  const handleReset = () => {
    form.resetFields();
    message.info('配置已重置');
  };

  return (
    <div style={{ maxWidth: 600 }}>
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSave}
        initialValues={{
          robot_name: 'rtk-robot',
          max_speed: 1.0,
          max_acceleration: 0.5,
        }}
      >
        <Form.Item
          label="机器人名称"
          name="robot_name"
          rules={[{ required: true, message: '请输入机器人名称' }]}
        >
          <Input placeholder="例如：rtk-robot" />
        </Form.Item>

        <Form.Item
          label="最大速度 (m/s)"
          name="max_speed"
          rules={[{ required: true, message: '请输入最大速度' }]}
        >
          <InputNumber min={0} max={5} step={0.1} style={{ width: '100%' }} />
        </Form.Item>

        <Form.Item
          label="最大加速度 (m/s²)"
          name="max_acceleration"
          rules={[{ required: true, message: '请输入最大加速度' }]}
        >
          <InputNumber min={0} max={2} step={0.1} style={{ width: '100%' }} />
        </Form.Item>

        <Divider />

        <Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" loading={saving}>
              保存配置
            </Button>
            <Button htmlType="button" onClick={handleReset}>
              重置
            </Button>
          </Space>
        </Form.Item>
      </Form>

      <div style={{ marginTop: 24, padding: 16, background: '#f5f5f5', borderRadius: 4 }}>
        <h4 style={{ margin: '0 0 8px' }}>说明</h4>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#666' }}>
          <li>配置修改后会立即生效（通过 ROS 动态参数）</li>
          <li>部分配置可能需要重启节点才能完全生效</li>
          <li>配置会保存到 ROS 参数服务器</li>
        </ul>
      </div>
    </div>
  );
};

export default BasicTab;
