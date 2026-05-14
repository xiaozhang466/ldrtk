# UI 系统开发说明

**版本:** v2.0.0  
**日期:** 2026-03-14

---

## 项目结构

```
sigucar-ui-web/          # Web 前端
├── src/
│   ├── pages/          # 页面组件
│   ├── components/     # 通用组件
│   └── utils/          # 工具函数
├── package.json
└── vite.config.js

sigucar-ui-electron/    # Electron 壳
├── src/main/
│   ├── index.js        # 主进程
│   └── preload.js      # 预加载脚本
├── package.json
└── electron-builder.yml
```

---

## 开发命令

### Web 前端

```bash
cd sigucar-ui-web
yarn install
yarn dev      # 开发模式
yarn build    # 构建
```

### Electron

```bash
cd sigucar-ui-electron
yarn install
yarn electron:dev   # 开发模式
yarn electron:build # 构建打包
```

---

## 已实现功能

### Web 前端

- ✅ 首页 (系统状态显示)
- ✅ ROS 连接 (rosbridge WebSocket)
- ✅ 电池状态订阅
- ✅ GPS 状态订阅
- ✅ 页面路由

### Electron 壳

- ✅ 主进程框架
- ✅ IPC 通信
- ✅ 预加载脚本

---

## 待完成功能

### Web 前端

- ⏳ 地图展示 (Mars2D)
- ⏳ 路径规划编辑
- ⏳ 实时状态监控
- ⏳ 任务管理

### Electron 壳

- ⏳ ROS 节点管理
- ⏳ 系统托盘
- ⏳ 自动启动

---

_开发中 - 2026-03-14_
