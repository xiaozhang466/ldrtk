# 耘小智 01 Web 前端

React + Vite 前端，用于地图管理、建图控制、路径规划、导航监控和系统设置。

## 技术栈

- React 18
- Vite 5
- Ant Design 5
- Three.js 点云预览
- Cesium 天地图预览
- roslibjs 连接 rosbridge

## 开发命令

```bash
cd web
npm install
npm run dev
npm run build
npm run preview
```

前端请求地址由 `src/config.js` 决定：默认使用当前页面的 host，直连 `http://<host>:5000/api`、`http://<host>:5001/api/tianditu` 和 `ws://<host>:9090`。`vite.config.js` 在 `npm run dev` 时为 `/api`、`/ws` 提供本地代理；`npm run preview` 时同时代理 `/api/tianditu` 到天地图服务。当前 `config.js` 中 `isDev = false`，运行时走直连而非 Vite 代理。

## 页面路由

| 路由 | 说明 |
| --- | --- |
| `/login` | 登录页 |
| `/` | 首页，展示系统状态和功能入口 |
| `/maps` | 地图管理，包含地图列表、建图控制、PCD 预览 |
| `/nav` | 导航页面，选择地图/路径并下发任务 |
| `/path-planning` | 路径规划页面 |
| `/settings` | 系统设置 |

已移除的旧入口：`/map`、`/pcd-viewer`、`/mapping-control`、`/gps-map-create`。相关能力已合并到 `/maps` 或当前主流程中。

## 目录结构

```text
web/
├── src/
│   ├── api/              # 统一后端 API 封装
│   ├── assets/           # 静态资源
│   ├── components/       # 地图、建图、导航、设置等组件
│   ├── context/          # ROS Context
│   ├── hooks/            # 前端 hooks
│   ├── pages/            # 路由页面
│   └── utils/            # ROS 连接等工具
├── scripts/              # 自主测试脚本
├── tests/                # Playwright/Vitest 测试
├── package.json
└── vite.config.js
```

## 当前主要能力

- 地图创建、删除、重命名、切换
- RTK 原点读取和地图 GPS 原点更新
- LiDAR PCD 文件读取与 Three.js 预览
- 建图脚本启动、停止和状态展示
- GPS/融合/本地地图路径规划
- 导航任务下发、状态订阅和控制
- 雷达定位、RTK-LiDAR 对齐等操作入口

## 测试

```bash
cd web
npm run build
npx playwright test
npx vitest run
node scripts/autotest.cjs
```

Playwright 测试位于 `tests/*.spec.*`，Vitest 测试位于 `tests/*.test.*`。

## 外部服务

`src/config.js` 根据当前页面 `hostname` 生成地址（无 `window` 时回退为 `localhost`）：

- 后端 API：`http://<host>:5000/api`
- rosbridge：`ws://<host>:9090`
- 天地图代理：`http://<host>:5001/api/tianditu`

最后整理：2026-05-18
