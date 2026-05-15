// API 工具函数
import { API_BASE } from '../config'

// 检查是否已登录
function isLoggedIn(): boolean {
  return localStorage.getItem('isLoggedIn') === 'true'
}

// 设置登录状态
function setLoggedIn(loggedIn: boolean): void {
  if (loggedIn) {
    localStorage.setItem('isLoggedIn', 'true')
  } else {
    localStorage.removeItem('isLoggedIn')
    localStorage.removeItem('username')
  }
}

// 通用请求处理
async function request<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'include', // 包含 Cookie 用于认证
  })
  
  // 处理 401 未授权
  if (response.status === 401) {
    setLoggedIn(false)
    window.location.href = '#/login'
    throw new Error('未授权，请重新登录')
  }
  
  const data = await response.json()
  
  if (!response.ok) {
    throw new Error(data.error || '请求失败')
  }
  
  return data
}

// ==================== 地图管理 API ====================

export interface MapInfo {
  name: string
  path: string
  created_at: string
  updated_at: string
  file_count: number
  total_size: number
  has_grid_map: boolean
  has_pcd: boolean
  has_gps_config: boolean
  gps_origin?: string
  files: Array<{
    name: string
    size: number
    path: string
  }>
}

export interface MapsResponse {
  success: boolean
  maps: MapInfo[]
  total: number
}

export interface RtkOriginResponse {
  success: boolean
  lat: number
  lon: number
  lng?: number
  alt: number
  fixed?: boolean
  fix_quality?: number | null
  navsat_status?: number | null
  source_topic?: string
}

export const mapsApi = {
  // 获取地图列表
  getMaps: () => request<MapsResponse>('/maps', { method: 'GET' }),

  // 获取当前 RTK 固定解坐标
  getRtkOrigin: () => request<RtkOriginResponse>('/rtk/origin', { method: 'GET' }),
  
  // 创建地图（支持完整对象）
  createMap: (mapData: { name: string; origin?: { lat: number; lon: number; alt: number } }) => request('/maps', {
    method: 'POST',
    body: JSON.stringify(mapData),
  }),
  
  // 重命名地图
  renameMap: (oldName: string, newName: string) => request(`/maps/${encodeURIComponent(oldName)}`, {
    method: 'PUT',
    body: JSON.stringify({ name: newName }),
  }),
  
  // 删除地图
  deleteMap: (name: string) => request(`/maps/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  }),
  
  // 切换地图
  switchMap: (name: string) => request(`/maps/${encodeURIComponent(name)}/switch`, {
    method: 'POST',
  }),
}

// ==================== 建图控制 API ====================

export interface MappingStatus {
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error'
  map_name?: string
  frame_count: number
  trajectory_points: number
  duration_seconds: number
  started_at?: string
  error_message?: string
}

export interface MappingStatusResponse {
  success: boolean
  status: MappingStatus
}

export const mappingApi = {
  // 获取建图状态
  getStatus: () => request<MappingStatusResponse>('/mapping/status', { method: 'GET' }),

  // 开始建图
  startMapping: (mapName: string) => request('/mapping/start', {
    method: 'POST',
    body: JSON.stringify({ map_name: mapName }),
  }),

  // 停止建图
  stopMapping: () => request('/mapping/stop', { method: 'POST' }),

  // 保存地图
  saveMap: () => request('/mapping/save', { method: 'POST' }),
}

// ==================== 导航 API ====================

export interface NavigationStatus {
  status: 'idle' | 'starting' | 'running' | 'stopping' | 'error'
  map_name?: string
  localization_status: 'unknown' | 'initializing' | 'ok' | 'error'
  cmd_vel_active: boolean
  duration_seconds: number
  error_message?: string
}

export interface NavigationStatusResponse {
  success: boolean
  status: NavigationStatus
}

export const navigationApi = {
  // 获取导航状态
  getStatus: () => request<NavigationStatusResponse>('/navigation/status', { method: 'GET' }),

  // 开始导航
  startNavigation: (mapName: string) => request('/navigation/start', {
    method: 'POST',
    body: JSON.stringify({ map_name: mapName }),
  }),

  // 停止导航
  stopNavigation: () => request('/navigation/stop', { method: 'POST' }),
}

// ==================== 路径规划 API ====================

// 航点类型枚举
export type WaypointType = 'waypoint' | 'work' | 'charge'

export interface PathPoint {
  id: string
  x: number
  y: number
  z: number
  // 航点类型: waypoint=途径点(默认), work=作业点, charge=充电点
  waypointType?: WaypointType
}

export interface PathItem {
  id: string
  name: string
  points: PathPoint[]
}

export interface PathsData {
  success: boolean
  paths: PathItem[]
  version?: string
  updated_at?: string
}

// 地图配置信息（用于坐标转换）
export interface MapConfig {
  resolution: number
  origin: [number, number, number]
  width: number
  height: number
  map_type: 'local' | 'gps' | 'fusion'
}

// 世界坐标
export interface WorldCoord {
  x: number
  y: number
  z: number
}

export interface MapConfigResponse {
  success: boolean
  map_name: string
  config: MapConfig
}

export const pathApi = {
  // 保存多路径
  savePath: (mapName: string, paths: PathItem[]) => request(`/path/${encodeURIComponent(mapName)}/save`, {
    method: 'POST',
    body: JSON.stringify({ paths }),
  }),
  
  // 加载多路径
  loadPath: (mapName: string) => request<PathsData>(`/path/${encodeURIComponent(mapName)}/load`, { method: 'GET' }),
  
  // 获取路径信息
  getPathInfo: (mapName: string) => request(`/path/${encodeURIComponent(mapName)}`, { method: 'GET' }),
  
  // 获取地图配置（用于坐标转换）
  getMapConfig: (mapName: string) => request<MapConfigResponse>(`/path/${encodeURIComponent(mapName)}/config`, { method: 'GET' }),
  
  // 像素坐标转世界坐标
  pixelToWorld: (mapName: string, pixelX: number, pixelY: number) => request(`/path/${encodeURIComponent(mapName)}/pixel_to_world`, {
    method: 'POST',
    body: JSON.stringify({ pixel_x: pixelX, pixel_y: pixelY }),
  }),
}

// ==================== 认证 API ====================

export interface LoginRequest {
  username: string
  password: string
}

export interface LoginResponse {
  success: boolean
  token?: string
  error?: string
}

export const authApi = {
  // 登录 (在 Login 组件中直接调用 fetch)
  
  // 登出
  logout: async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      })
    } catch (error) {
      console.error('登出失败:', error)
    } finally {
      setLoggedIn(false)
    }
  },
  
  // 检查登录状态
  checkAuth: async () => {
    try {
      const response = await fetch('/api/auth/check', {
        credentials: 'include',
      })
      const data = await response.json()
      return data.authenticated
    } catch (error) {
      console.error('检查认证状态失败:', error)
      return false
    }
  },
}
