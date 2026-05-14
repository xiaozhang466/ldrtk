// 前端配置
// 自动检测当前访问地址，使用相同的主机名访问后端 API
const currentHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost'
const isDev = false  // 生产环境

// 生产环境使用当前主机名，开发环境使用相对路径（通过 Vite proxy）
export const API_BASE = isDev ? '/api' : `http://${currentHost}:5000/api`
export const WS_BASE = isDev ? '/ws' : `ws://${currentHost}:9090`
export const TIANDITU_PROXY = isDev ? '/api/tianditu' : `http://${currentHost}:5001/api/tianditu`
