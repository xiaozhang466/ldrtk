# 耘小智 RTK 果园巡检系统

面向履带式果园巡检机器人的集成工程：RTK 定位、LiDAR 建图与定位、Web 控制台、路径规划与 RTK 导航。仓库以项目根目录为 `RTK_ROOT`，ROS、后端、前端和地图数据都围绕该目录组织。

## 系统组成

```text
┌─────────────┐     HTTP/WS      ┌──────────────┐     ROS      ┌─────────────────┐
│  Web 前端   │ ◄──────────────► │ Flask 后端   │ ◄──────────► │  ROS / 车载节点  │
│  web/       │   :5000 / :9090  │  backend/    │              │  nav/           │
└──────┬──────┘                  └──────────────┘              └─────────────────┘
       │ 天地图瓦片
       ▼
┌─────────────┐
│ 天地图代理   │  :5001
│ tianditu-proxy/
└─────────────┘
```

| 模块 | 目录 | 说明 |
| --- | --- | --- |
| Web 前端 | `web/` | React + Vite，地图管理、建图、PCD 预览、路径规划、导航 |
| 后端 API | `backend/` | Flask + JWT，地图/建图/路径/对齐/导航状态 |
| ROS 工作空间 | `nav/` | RTK、底盘、LiDAR 建图与定位、融合对齐 |
| 天地图代理 | `tianditu-proxy/` | WMTS 瓦片代理与缓存 |
| 运行数据 | `data/` | 地图、配置、日志、对齐结果 |

更细的说明见各子目录 README：

- [web/README.md](web/README.md)
- [web/UI_DESIGN.md](web/UI_DESIGN.md)
- [tianditu-proxy/README.md](tianditu-proxy/README.md)
- [nav/src/um982_rtk/README.md](nav/src/um982_rtk/README.md)
- [nav/src/rtk_interfaces/README.md](nav/src/rtk_interfaces/README.md)

## 目录结构

```text
rtk/
├── README.md                 # 本文件
├── backend/                  # Flask API
├── web/                      # React 前端
├── nav/                      # ROS Noetic 工作空间
├── tianditu-proxy/           # 天地图代理
└── data/
    ├── maps/                 # 地图数据（PCD、栅格、配置、路径）
    ├── config/               # 用户等配置
    └── logs/                 # 各服务日志
```

## 环境要求

- Ubuntu 20.04 + ROS Noetic（车载与建图节点）
- Python 3.8+
- Node.js 18+（前端构建）
- UM982 RTK 串口、LiDAR、底盘 CAN 等按现场配置

建议始终设置项目根路径：

```bash
cd /path/to/rtk
export RTK_ROOT="$(pwd)"
```

## 快速启动

### 1. 后端 API

```bash
cd "$RTK_ROOT/backend"
./install_deps.sh    # 首次
./start.sh           # http://0.0.0.0:5000
```

健康检查：`GET /api/health`

### 2. 天地图代理（GPS/融合地图需要）

```bash
cd "$RTK_ROOT/tianditu-proxy"
export TIANDITU_TOKEN="你的天地图 Token"
./start.sh           # http://0.0.0.0:5001
```

### 3. Web 前端

```bash
cd "$RTK_ROOT/web"
npm install
npm run dev          # 开发：http://<host>:5173
# 或
npm run build && npm run preview   # 预览：http://<host>:3000
```

默认账号见 `backend/config/config.py`（首次部署请修改默认密码）。

### 4. ROS 与导航（实车/仿真）

```bash
cd "$RTK_ROOT/nav"
catkin_make
source devel/setup.bash

# 启动 bringup（RTK、底盘、可选 rosbridge 等）
./scripts/start.sh
```

常用话题：`/rtk/fix`、`/odometry/rtk`、`/task`、`/cmd_vel`、`/navigation/state`。

## 典型业务流程

1. **建图**：Web `/maps` → 建图控制 → 保存到 `data/maps/<地图名>/lidar/...`
2. **GPS 原点**：创建/编辑地图时写入 `map_config.json` 的 `gpsOrigin`
3. **坐标对齐**：地图管理 → 坐标对齐 → 生成 `calibration/rtk_lidar.yaml`
4. **路径规划**：地图操作 → 路径规划 → 保存 `paths.json`
5. **导航**：`/nav` 选择地图与路径 → 发布 `/task` → `um982_rtk_nav_node` 跟踪

## 地图数据约定

每张地图位于 `data/maps/<name>/`，常见内容：

| 路径 | 说明 |
| --- | --- |
| `map_config.json` | GPS 原点、地图类型等 |
| `lidar/pcd/` | 点云块 |
| `map.png` / `map.yaml` | 本地栅格图（可选） |
| `paths.json` | 路径规划结果 |
| `calibration/rtk_lidar.yaml` | RTK–LiDAR 对齐结果 |

## 默认端口

| 服务 | 端口 |
| --- | --- |
| Flask 后端 | 5000 |
| 天地图代理 | 5001 |
| Vite 开发前端 | 5173 |
| Vite 预览前端 | 3000 |
| rosbridge WebSocket | 9090 |

## 测试

```bash
# 前端
cd web && npm run build && npx playwright test

# 自主冒烟
cd web && node scripts/autotest.cjs
```

## 维护说明

- 旧版独立页面（`/map`、`/pcd-viewer`、`/gps-map-create` 等）与手动控制点配准 API 已移除，能力已并入 `/maps` 与 `/api/alignment`。
- `web/dist`、`backend/.deps`、`web/node_modules` 为构建/依赖目录，勿当作源码修改。
- 第三方 ROS 包自带 README（Livox、FAST-LIO 等）保留 upstream 文档，以本仓库子模块 README 为准。

最后整理：2026-05-18
