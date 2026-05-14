/**
 * GPS 地图预览功能测试 - Vitest
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('GPS 地图预览功能', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('1. MarsMapForManager 组件存在', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const componentPath = path.join(process.cwd(), 'src/components/MarsMapForManager.jsx')
    expect(fs.existsSync(componentPath)).toBe(true)
  })

  it('2. GPSMapView 组件存在', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const componentPath = path.join(process.cwd(), 'src/components/GPSMapView.tsx')
    expect(fs.existsSync(componentPath)).toBe(true)
  })

  it('3. FusionMapForManager 组件存在', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const componentPath = path.join(process.cwd(), 'src/components/FusionMapForManager.tsx')
    expect(fs.existsSync(componentPath)).toBe(true)
  })

  it('4. MapOperationModal 组件存在', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const componentPath = path.join(process.cwd(), 'src/components/MapOperationModal.tsx')
    expect(fs.existsSync(componentPath)).toBe(true)
  })

  it('5. GPSMapView 包含全屏按钮', async () => {
    const fs = await import('fs')
    const content = fs.readFileSync('src/components/GPSMapView.tsx', 'utf-8')
    expect(content).toContain('全屏')
    expect(content).toContain('Fullscreen')
  })

  it('6. GPSMapView 包含原点显示', async () => {
    const fs = await import('fs')
    const content = fs.readFileSync('src/components/GPSMapView.tsx', 'utf-8')
    expect(content).toContain('原点')
    expect(content).toContain('gpsOrigin')
  })

  it('7. GPSMapView 包含错误提示', async () => {
    const fs = await import('fs')
    const content = fs.readFileSync('src/components/GPSMapView.tsx', 'utf-8')
    expect(content).toContain('未设置 GPS 坐标')
  })

  it('8. MapOperationModal 包含建图功能', async () => {
    const fs = await import('fs')
    const content = fs.readFileSync('src/components/MapOperationModal.tsx', 'utf-8')
    expect(content).toContain('开始建图')
    expect(content).toContain('停止建图')
  })

  it('9. MapManager 包含编辑功能', async () => {
    const fs = await import('fs')
    const content = fs.readFileSync('src/components/MapManager.tsx', 'utf-8')
    expect(content).toContain('编辑')
    expect(content).toContain('gps_origin')
  })

  it('10. 天地图代理配置正确', async () => {
    const fs = await import('fs')
    const content = fs.readFileSync('src/config.js', 'utf-8')
    expect(content).toContain('TIANDITU_PROXY')
    expect(content).toContain('5001')
  })
})
