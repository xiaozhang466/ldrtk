import React, { useState } from 'react'
import { Form, Input, Button, Card, message, Typography } from 'antd'
import { UserOutlined, LockOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import logoImg from '../assets/logo.png'

const { Title } = Typography

interface LoginResponse {
  success: boolean
  token?: string
  error?: string
}

const Login: React.FC = () => {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [form] = Form.useForm()

  const onFinish = async (values: any) => {
    setLoading(true)
    try {
      // 自动使用当前主机名访问后端 API
      const currentHost = window.location.hostname
      const apiUrl = `http://${currentHost}:5000/api/auth/login`
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          username: values.username,
          password: values.password,
        }),
      })

      const data: LoginResponse = await response.json()

      if (response.ok && data.success) {
        localStorage.setItem('isLoggedIn', 'true')
        localStorage.setItem('username', values.username)
        message.success('登录成功！')
        navigate('/')
      } else {
        message.error(data.error || '登录失败，请检查用户名和密码')
      }
    } catch (error: any) {
      console.error('登录错误:', error)
      message.error('网络错误，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      }}
    >
      <Card
        style={{
          width: 400,
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
        }}
      >
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img
            src={logoImg}
            alt="思谷耘联"
            style={{
              height: 80,
              marginBottom: 16,
              objectFit: 'contain',
            }}
          />
          <div
            style={{
              fontSize: 14,
              color: '#999',
              fontWeight: 500,
              marginTop: 8,
            }}
          >
            智能终端控制系统
          </div>
        </div>

        <Form
          form={form}
          name="login"
          onFinish={onFinish}
          autoComplete="off"
          size="large"
          initialValues={{
            username: 'admin',
            password: 'Sigu@2026',
          }}
        >
          <Form.Item
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="用户名"
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="密码"
            />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              style={{ width: '100%' }}
              size="large"
            >
              登录
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}

export default Login
