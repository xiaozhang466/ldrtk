# 测试设备前后端环境配置

本文档用于在已有 ROS 环境的测试设备上配置本项目的前端、后端和网页打点环境。

如果只是验证 RTK 固定解、航向、底盘响应，可以先不配置前后端，直接运行 ROS 车端。

## 1. 项目根目录

项目可以放在任意目录。建议先进入项目根目录，并在当前终端设置 `RTK_ROOT`：

```bash
cd /path/to/rtk
export RTK_ROOT="$(pwd)"
```

如果没有手动设置 `RTK_ROOT`，脚本和后端会尽量根据自身文件位置自动推导项目根目录。

## 2. 必要系统包

ROS 环境已有时，前后端主要需要：

```bash
sudo apt update
sudo apt install -y python3-pip nodejs npm ros-noetic-rosbridge-server
```

其中：

- `python3-pip`：安装后端和天地图代理 Python 依赖
- `nodejs` / `npm`：运行前端
- `ros-noetic-rosbridge-server`：让网页通过 WebSocket 连接 ROS

前端使用 Vite，建议 Node.js 版本为 18 或 20。先检查：

```bash
node -v
npm -v
```

如果 `node -v` 低于 `v18`，建议升级 Node.js 后再执行 `npm install`。

## 3. 车端 ROS 测试

先确认 CAN 已启动：

```bash

```

编译 ROS 工作空间：

```bash
cd "$RTK_ROOT/nav"
catkin_make
source devel/setup.bash
```

启动车端，默认会启动 RTK、导航、Ranger Mini v2 底盘驱动，并自动尝试启动 rosbridge：

```bash
cd "$RTK_ROOT"
./nav/scripts/start.sh
```

只测试 ROS，不启动网页时也可以直接：

```bash
roslaunch nav/launch/bringup.launch start_rosbridge:=false
```

常用检查：

```bash
rostopic echo /rtk/fix_quality
rostopic echo /rtk/heading
rostopic echo /odometry/rtk
rostopic echo /odom
rostopic echo /cmd_vel
```


## 4. 后端环境

后端端口为 `5000`，依赖会安装到 `backend/.deps`，不会污染系统 Python 环境。

安装依赖：

```bash
cd "$RTK_ROOT/backend"
./install_deps.sh
```

启动后端：

```bash
cd "$RTK_ROOT"
./backend/start.sh
```

健康检查：

```bash
curl http://localhost:5000/api/health
```

## 5. 天地图代理

如果前端需要显示天地图底图，启动天地图代理。代理端口为 `5001`。

启动前需要设置天地图 Token：

```bash
export TIANDITU_TOKEN="你的天地图Token"
export TIANDITU_API_TOKEN="sigu_tdt_2026_secure_token"
```

安装依赖：

```bash
cd "$RTK_ROOT/tianditu-proxy"
./install_deps.sh
```

启动代理：

```bash
cd "$RTK_ROOT"
./tianditu-proxy/start.sh
```

健康检查：

```bash
curl http://localhost:5001/api/tianditu/health
```

## 6. 前端环境

前端开发服务端口为 `5173`。

安装依赖：

```bash
cd "$RTK_ROOT/web"
npm install
```

启动前端：

```bash
cd "$RTK_ROOT/web"
npm run dev -- --host 0.0.0.0
```

浏览器访问：

```text
http://<测试设备IP>:5173
```

开发模式下，前端代理配置为：

- `/api` -> `http://localhost:5000`
- `/ws` -> `ws://localhost:9090`

所以前端、后端、rosbridge 建议运行在同一台测试设备上。

## 7. 推荐启动顺序

完整网页打点测试建议按这个顺序：

```bash
# 1. 车端 ROS
cd "$RTK_ROOT"
./nav/scripts/start.sh

# 2. 后端
./backend/start.sh

# 3. 天地图代理，可选
./tianditu-proxy/start.sh

# 4. 前端
cd web
npm run dev -- --host 0.0.0.0
```

## 8. 离线准备

如果现场网络不好，建议提前在有网环境执行：

```bash
cd "$RTK_ROOT/backend"
./install_deps.sh

cd "$RTK_ROOT/tianditu-proxy"
./install_deps.sh

cd "$RTK_ROOT/web"
npm install
```

然后把整个项目目录拷贝到测试设备。需要保留：

```text
backend/.deps
tianditu-proxy/.deps
web/node_modules
```

这样现场一般不需要再下载 Python 或 npm 依赖。

## 9. 常见端口

| 服务 | 端口 | 说明 |
| --- | --- | --- |
| 后端 API | 5000 | Flask 后端 |
| 前端开发服务 | 5173 | Vite |
| rosbridge | 9090 | WebSocket 连接 ROS |
| 天地图代理 | 5001 | 天地图瓦片代理 |

## 10. 最小测试目标

前端打点前，建议先确认：

```bash
rostopic echo /rtk/fix_quality
rostopic echo /rtk/heading
rostopic echo /odometry/rtk
rostopic echo /navigation/state
```

其中：

- `/rtk/fix_quality` 应为 `4`，表示固定解
- `/rtk/heading` 是前端需要的指南针角度：北 `0°`，东 `90°`
- `/odometry/rtk` 是导航节点使用的 RTK 位姿
- `/navigation/state` 是前端查看导航状态的话题
