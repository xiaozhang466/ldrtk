# Cesium.js 迁移指南

**迁移日期:** 2026-03-22  
**状态:** 实施中 🚜

---

## 📋 迁移步骤

### 1. 安装依赖 ✅

```bash
cd /opt/development/ui/web
npm install cesium
```

### 2. 组件文件 ✅

- **新组件:** `src/components/CesiumMap.jsx` (新建)
- **旧组件:** `src/components/MarsMap.jsx` (保留，待测试完成后删除)

### 3. 配置 Vite ✅

Vite 配置已包含 Cesium 支持：
- `CESIUM_BASE_URL` 定义
- Worker 格式配置
- 静态资源支持

### 4. 替换组件使用

**在 MapPreview.tsx 中：**

```jsx
// 原代码
import MarsMap from './MarsMap'
<MarsMap 
  robotPosition={robotPosition}
  heading={heading}
  waypoints={waypoints}
  currentWaypoint={currentWaypoint}
/>

// 新代码
import CesiumMap from './CesiumMap'
<CesiumMap 
  robotPosition={robotPosition}
  heading={heading}
  waypoints={waypoints}
  currentWaypoint={currentWaypoint}
/>
```

### 5. 天地图 Token 配置

在 `CesiumMap.jsx` 中配置天地图 Token：

```javascript
const TDT_TOKEN = 'YOUR_TDT_TOKEN_HERE'  // 替换为实际 Token
```

**获取 Token:**
1. 访问 http://console.tianditu.gov.cn/
2. 注册/登录账号
3. 创建应用获取 Token
4. 选择"浏览器端"应用类型

---

## 🎨 保持现有风格

### API 接口一致

CesiumMap 组件**完全保持** MarsMap 的 API 接口：

```jsx
<CesiumMap
  robotPosition={{ lng: 116.397, lat: 39.909, alt: 50 }}
  heading={45}
  waypoints={[{ lng, lat, alt }]}
  currentWaypoint={3}
/>
```

### 样式一致

- 容器圆角：`borderRadius: '16px'`
- 背景色：`background: '#1a1a2e'`
- 尺寸：`width: '100%', height: '100%'`

### 功能一致

| 功能 | MarsMap | CesiumMap | 状态 |
|------|---------|-----------|------|
| 底图显示 | 谷歌卫星 | 天地图影像 | ✅ |
| 机器人标记 | ✅ | ✅ | ✅ |
| 航向指示 | ✅ | ✅ | ✅ |
| 路径绘制 | ✅ | ✅ | ✅ |
| 路径点标记 | ✅ | ✅ | ✅ |
| 视角跟随 | ✅ | ✅ | ✅ |
| 信息框 | ✅ | ✅ | ✅ |

---

## 🧪 测试清单

### 功能测试

- [ ] 地图加载正常
- [ ] 天地图底图显示
- [ ] 机器人标记显示
- [ ] 航向指示线显示
- [ ] 路径绘制正常
- [ ] 路径点标记正常
- [ ] 视角跟随流畅
- [ ] 信息框弹出正常

### 性能测试

- [ ] 首屏加载 < 3 秒
- [ ] 帧率 > 30 FPS
- [ ] 内存占用合理
- [ ] 缩放/平移流畅

### 兼容性测试

- [ ] Chrome 浏览器
- [ ] Firefox 浏览器
- [ ] Safari 浏览器
- [ ] Edge 浏览器

---

## 🔧 常见问题

### 1. Cesium 资源加载失败

**症状:** 控制台报错 `Cesium.js not found`

**解决:**
```bash
# 检查 node_modules
ls node_modules/cesium/Build/Cesium

# 重新安装
rm -rf node_modules package-lock.json
npm install
```

### 2. 天地图 Token 无效

**症状:** 底图显示空白或报错

**解决:**
1. 检查 Token 是否正确
2. 确认应用类型为"浏览器端"
3. 检查 Referer 白名单配置

### 3. 相机控制不流畅

**症状:** 缩放/平移卡顿

**解决:**
```javascript
// 调整相机配置
viewer.camera.enableCollisionDetection = true
viewer.scene.fog.enabled = true
```

---

## 📊 迁移进度

| 任务 | 状态 | 完成时间 |
|------|------|----------|
| 安装 Cesium.js | ✅ 完成 | 2026-03-22 |
| 创建 CesiumMap.jsx | ✅ 完成 | 2026-03-22 |
| Vite 配置 | ✅ 完成 | 2026-03-22 |
| 天地图 Token 配置 | ⏸️ 待配置 | - |
| 功能测试 | ⏸️ 待测试 | - |
| 替换 MarsMap | ⏸️ 待测试 | - |
| 删除旧组件 | ⏸️ 待测试 | - |

---

## 📝 注意事项

1. **不要破坏现有布局** - CesiumMap 完全复用 MarsMap 的容器样式
2. **保持 API 一致** - props 接口完全相同，无需修改调用代码
3. **天地图 Token** - 需要申请官方 Token，测试期间可使用临时 Token
4. **性能优化** - Cesium.js 初次加载较大，建议启用 CDN 或本地缓存

---

**文档版本:** v1.0  
**最后更新:** 2026-03-22 16:30
