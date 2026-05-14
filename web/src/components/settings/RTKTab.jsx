/**
 * RTK 配置标签页
 * 
 * 提供 RTK 双模式配置功能：
 * - 自建基站模式
 * - 网络 RTK (NTRIP) 模式
 */

import React, { useState, useEffect } from 'react';
import { Form, Input, InputNumber, Button, Space, Divider, message, Select, Card } from 'antd';
import { RosParam } from '../../utils/ros';

const { Option } = Select;

/**
 * RTK 配置组件
 */
const RTKTab = ({ loading }) => {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState('base_station');

  // 加载配置
  useEffect(() => {
    loadRtkConfig();
  }, []);

  /**
   * 加载 RTK 配置
   */
  const loadRtkConfig = async () => {
    try {
      // TODO: 从后端或 ROS 参数服务器加载 um982_rtk 配置。
      
      // 模拟配置
      form.setFieldsValue({
        mode: 'base_station',
        base_station_port: '/dev/ttyUSB0',
        base_station_baudrate: 115200,
        ntrip_host: 'ntrip.example.com',
        ntrip_port: 2101,
        ntrip_mountpoint: 'RTCM32',
        ntrip_user: 'user',
        ntrip_password: 'pass',
      });
      
      message.success('RTK 配置加载成功');
    } catch (error) {
      console.error('Failed to load RTK config:', error);
      message.error('RTK 配置加载失败');
    }
  };

  /**
   * 保存 RTK 配置
   */
  const handleSave = async (values) => {
    setSaving(true);
    
    try {
      // TODO: 接入 um982_rtk 的配置保存接口。
      
      if (values.mode === 'base_station') {
        // 保存自建基站配置
        console.log('Saving base station config:', {
          port: values.base_station_port,
          baudrate: values.base_station_baudrate,
        });
      } else {
        // 保存 NTRIP 配置
        console.log('Saving NTRIP config:', {
          host: values.ntrip_host,
          port: values.ntrip_port,
          mountpoint: values.ntrip_mountpoint,
          user: values.ntrip_user,
        });
      }
      
      message.success('RTK 配置保存成功');
    } catch (error) {
      console.error('Failed to save RTK config:', error);
      message.error('RTK 配置保存失败');
    } finally {
      setSaving(false);
    }
  };

  /**
   * 模式变化处理
   */
  const handleModeChange = (newMode) => {
    setMode(newMode);
  };

  return (
    <div style={{ maxWidth: 800 }}>
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSave}
      >
        <Card title="RTK 模式选择" style={{ marginBottom: 16 }}>
          <Form.Item
            label="工作模式"
            name="mode"
            style={{ marginBottom: 0 }}
          >
            <Select onChange={handleModeChange} style={{ width: 300 }}>
              <Option value="base_station">自建基站模式</Option>
              <Option value="ntrip">网络 RTK (NTRIP) 模式</Option>
            </Select>
          </Form.Item>
        </Card>

        {mode === 'base_station' ? (
          <Card title="自建基站配置">
            <Form.Item
              label="串口端口"
              name="base_station_port"
              rules={[{ required: true, message: '请输入串口端口' }]}
            >
              <Input placeholder="/dev/ttyUSB0" />
            </Form.Item>

            <Form.Item
              label="波特率"
              name="base_station_baudrate"
              rules={[{ required: true, message: '请输入波特率' }]}
            >
              <Select>
                <Option value={9600}>9600</Option>
                <Option value={19200}>19200</Option>
                <Option value={38400}>38400</Option>
                <Option value={57600}>57600</Option>
                <Option value={115200}>115200</Option>
                <Option value={230400}>230400</Option>
              </Select>
            </Form.Item>

            <Divider />

            <div style={{ fontSize: 13, color: '#666' }}>
              <p style={{ margin: '4px 0' }}>💡 提示：</p>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                <li>确保 RTK 基站已通过 USB 连接到机器人</li>
                <li>波特率需与基站配置一致</li>
                <li>常用波特率：115200</li>
              </ul>
            </div>
          </Card>
        ) : (
          <Card title="网络 RTK (NTRIP) 配置">
            <Form.Item
              label="NTRIP 服务器地址"
              name="ntrip_host"
              rules={[{ required: true, message: '请输入服务器地址' }]}
            >
              <Input placeholder="ntrip.example.com" />
            </Form.Item>

            <Form.Item
              label="端口"
              name="ntrip_port"
              rules={[{ required: true, message: '请输入端口' }]}
            >
              <InputNumber min={1} max={65535} style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item
              label="挂载点"
              name="ntrip_mountpoint"
              rules={[{ required: true, message: '请输入挂载点' }]}
            >
              <Input placeholder="RTCM32" />
            </Form.Item>

            <Form.Item
              label="用户名"
              name="ntrip_user"
              rules={[{ required: true, message: '请输入用户名' }]}
            >
              <Input placeholder="user" />
            </Form.Item>

            <Form.Item
              label="密码"
              name="ntrip_password"
              rules={[{ required: true, message: '请输入密码' }]}
            >
              <Input.Password placeholder="password" />
            </Form.Item>

            <Divider />

            <div style={{ fontSize: 13, color: '#666' }}>
              <p style={{ margin: '4px 0' }}>💡 提示：</p>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                <li>确保机器人已连接到互联网</li>
                <li>NTRIP 账号需向 CORS 服务商申请</li>
                <li>常用端口：2101, 8002</li>
              </ul>
            </div>
          </Card>
        )}

        <Divider />

        <Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" loading={saving}>
              保存配置
            </Button>
            <Button 
              htmlType="button" 
              onClick={() => form.resetFields()}
            >
              重置
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </div>
  );
};

export default RTKTab;
