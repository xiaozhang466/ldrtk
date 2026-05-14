/**
 * GPS 地图创建组件
 * 
 * 功能:
 * - 从 RTK 获取当前固定解作为地图原点
 * - 手动输入经纬度
 * - 保存地图配置
 */

import React, { useState, useEffect } from 'react';
import { Card, Form, Input, InputNumber, Button, Space, message, Divider, Row, Col, Statistic } from 'antd';
import { EnvironmentOutlined, SaveOutlined, ReloadOutlined } from '@ant-design/icons';
import { getRtkOrigin, saveGpsMap } from '../api/maps';
import { wgs84ToUtm } from '../utils/coordinateConverter';
import { RosTopic } from '../utils/ros';

/**
 * GPS 地图创建组件
 */
const GPSMapCreate = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [gettingOrigin, setGettingOrigin] = useState(false);
  const [gpsFix, setGpsFix] = useState(null);

  // 订阅 GPS 话题
  useEffect(() => {
    let unsubscribe = null;
    
    try {
      const gpsTopic = new RosTopic({
        name: '/gps/fix',
        messageType: 'sensor_msgs/NavSatFix',
      });
      
      unsubscribe = gpsTopic.subscribe((msg) => {
        setGpsFix({
          lat: msg.latitude,
          lon: msg.longitude,
          alt: msg.altitude,
          status: msg.status.status,
        });
      });
    } catch (error) {
      console.error('Failed to subscribe GPS topic:', error);
    }
    
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  /**
   * 从 RTK 获取原点
   */
  const handleGetOrigin = async () => {
    setGettingOrigin(true);
    
    try {
      // 优先从 API 获取 (RTK 固定解)
      const origin = await getRtkOrigin();
      
      form.setFieldsValue({
        origin_lat: origin.lat,
        origin_lon: origin.lon,
        origin_alt: origin.alt,
      });
      
      // 自动计算 UTM 坐标
      const [utmX, utmY] = wgs84ToUtm(origin.lat, origin.lon);
      form.setFieldsValue({
        utm_x: utmX.toFixed(3),
        utm_y: utmY.toFixed(3),
      });
      
      message.success('RTK 原点获取成功');
    } catch (error) {
      console.error('Failed to get RTK origin:', error);
      
      // 如果 API 失败，尝试从 GPS 话题获取
      if (gpsFix && gpsFix.status === 4) { // RTK_FIXED
        form.setFieldsValue({
          origin_lat: gpsFix.lat,
          origin_lon: gpsFix.lon,
          origin_alt: gpsFix.alt,
        });
        
        const [utmX, utmY] = wgs84ToUtm(gpsFix.lat, gpsFix.lon);
        form.setFieldsValue({
          utm_x: utmX.toFixed(3),
          utm_y: utmY.toFixed(3),
        });
        
        message.success('从 GPS 话题获取原点成功');
      } else {
        message.error('获取 RTK 原点失败，请检查 RTK 连接');
      }
    } finally {
      setGettingOrigin(false);
    }
  };

  /**
   * 保存地图
   */
  const handleSave = async (values) => {
    setLoading(true);
    
    try {
      const mapData = {
        name: values.map_name,
        origin: {
          lat: parseFloat(values.origin_lat),
          lon: parseFloat(values.origin_lon),
          alt: parseFloat(values.origin_alt || 0),
        },
        config: {
          coordinate_system: 'WGS84',
          utm_zone: '51N',
          local_origin: {
            x: 0,
            y: 0,
            yaw: 0,
          },
        },
      };
      
      const result = await saveGpsMap(mapData);
      
      message.success(`地图 "${values.map_name}" 保存成功！`);
      console.log('Map saved:', result);
      
      // 重置表单
      form.resetFields();
    } catch (error) {
      console.error('Failed to save map:', error);
      message.error('地图保存失败');
    } finally {
      setLoading(false);
    }
  };

  /**
   * 经纬度变化时自动计算 UTM
   */
  const handleLatLonChange = () => {
    const lat = form.getFieldValue('origin_lat');
    const lon = form.getFieldValue('origin_lon');
    
    if (lat && lon) {
      const [utmX, utmY] = wgs84ToUtm(lat, lon);
      form.setFieldsValue({
        utm_x: utmX.toFixed(3),
        utm_y: utmY.toFixed(3),
      });
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <Card
        title={
          <Space>
            <EnvironmentOutlined />
            <span>GPS 地图创建</span>
          </Space>
        }
        extra={
          gpsFix && (
            <Space size="large">
              <Statistic
                title="纬度"
                value={gpsFix.lat.toFixed(6)}
                precision={6}
                valueStyle={{ fontSize: 14 }}
              />
              <Statistic
                title="经度"
                value={gpsFix.lon.toFixed(6)}
                precision={6}
                valueStyle={{ fontSize: 14 }}
              />
              <Statistic
                title="状态"
                value={gpsFix.status === 4 ? 'RTK 固定解' : '未固定'}
                valueStyle={{ 
                  fontSize: 14,
                  color: gpsFix.status === 4 ? '#52c41a' : '#faad14'
                }}
              />
            </Space>
          )
        }
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSave}
          onValuesChange={handleLatLonChange}
        >
          <Form.Item
            label="地图名称"
            name="map_name"
            rules={[{ required: true, message: '请输入地图名称' }]}
          >
            <Input placeholder="例如：sigu" />
          </Form.Item>

          <Divider orientation="left">地图原点</Divider>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                label="纬度 (WGS84)"
                name="origin_lat"
                rules={[
                  { required: true, message: '请输入纬度' },
                  { type: 'number', min: -90, max: 90, message: '纬度范围：-90 到 90' }
                ]}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  placeholder="纬度"
                  precision={6}
                  step={0.000001}
                />
              </Form.Item>
            </Col>

            <Col span={8}>
              <Form.Item
                label="经度 (WGS84)"
                name="origin_lon"
                rules={[
                  { required: true, message: '请输入经度' },
                  { type: 'number', min: -180, max: 180, message: '经度范围：-180 到 180' }
                ]}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  placeholder="经度"
                  precision={6}
                  step={0.000001}
                />
              </Form.Item>
            </Col>

            <Col span={8}>
              <Form.Item label="海拔 (米)" name="origin_alt">
                <InputNumber
                  style={{ width: '100%' }}
                  placeholder="海拔"
                  precision={2}
                  step={0.1}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label="UTM X (米)" name="utm_x">
                <Input readOnly />
              </Form.Item>
            </Col>

            <Col span={8}>
              <Form.Item label="UTM Y (米)" name="utm_y">
                <Input readOnly />
              </Form.Item>
            </Col>

            <Col span={8}>
              <Form.Item label=" ">
                <Button
                  type="primary"
                  icon={<ReloadOutlined />}
                  onClick={handleGetOrigin}
                  loading={gettingOrigin}
                  block
                >
                  从 RTK 获取
                </Button>
              </Form.Item>
            </Col>
          </Row>

          <Divider />

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={loading}>
                保存地图
              </Button>
              <Button htmlType="button" onClick={() => form.resetFields()}>
                重置
              </Button>
            </Space>
          </Form.Item>
        </Form>

        <div style={{ marginTop: 24, padding: 16, background: '#f5f5f5', borderRadius: 4 }}>
          <h4 style={{ margin: '0 0 8px' }}>💡 使用说明</h4>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#666' }}>
            <li>确保 RTK 已获得固定解 (RTK_FIXED)，状态显示为绿色</li>
            <li>点击"从 RTK 获取"按钮自动获取当前坐标作为原点</li>
            <li>也可以手动输入经纬度坐标</li>
            <li>UTM 坐标会自动计算，无需手动输入</li>
            <li>地图配置会保存到 <code>/home/ros/ZMG/sigu/rtk/data/maps/{'{name}'}/</code> 目录</li>
          </ul>
        </div>
      </Card>
    </div>
  );
};

export default GPSMapCreate;
