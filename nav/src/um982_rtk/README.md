# um982_rtk

`um982_rtk` 是当前车辆的 RTK 定位和 RTK 导航 ROS 包。

## 主要节点

- `scripts/um982_rtk_node.py`：读取 UM982 串口数据，发布 RTK 定位、航向、状态和里程计。
- `scripts/um982_rtk_nav_node.py`：订阅任务与 RTK 里程计，输出 `/cmd_vel` 并发布导航状态。

启动文件：

```bash
roslaunch um982_rtk um982_rtk.launch
roslaunch um982_rtk um982_rtk.launch launch_navigation:=false
```

## 配置文件

- `config/rtk.yaml`：串口、坐标模式、天线安装、兼容话题、接收机启动命令。
- `config/navigation.yaml`：RTK 导航控制、跟踪、速度、容差和话题配置。

当前默认串口：

```text
/dev/ttyrtk
```

## RTK 输出话题

| 话题 | 类型 | 说明 |
| --- | --- | --- |
| `/rtk/fix` | `sensor_msgs/NavSatFix` | RTK 经纬度定位 |
| `/rtk/heading` | `geometry_msgs/TwistWithCovarianceStamped` | 双天线航向，前端使用罗盘角 |
| `/odometry/rtk` | `nav_msgs/Odometry` | 导航使用的 RTK 里程计 |
| `/rtk/fix_type` | `std_msgs/String` | 解类型文本 |
| `/rtk/position_type` | `std_msgs/String` | 接收机位置类型 |
| `/rtk/fix_quality` | `std_msgs/UInt8` | 固定解质量，导航可要求值为 4 |
| `/rtk/satellites` | `std_msgs/UInt16` | 卫星数量 |
| `/um982_rtk/status` | `std_msgs/String` | 节点状态 |

默认开启兼容别名：

- `/gps/fix`
- `/gps/heading`
- `/gps/satellites`
- `/odometry/gps`

## 坐标模式

`position.coordinate_mode` 支持：

- `absolute_utm`：`/odometry/rtk.pose.position.x/y` 为 UTM easting/northing。当前前后端保存的 GPS 路径按该模式工作。
- `local_origin`：以配置原点或首个固定解为局部原点，适合隔离测试。

## 双天线安装

`config/rtk.yaml` 的 `antenna.primary` 和 `antenna.secondary` 使用 `base_link` 坐标：

- `x`：前方，单位米
- `y`：左方，单位米
- `z`：上方，单位米

`/rtk/fix` 仍是接收机给出的定位点；`/odometry/rtk` 会根据主天线偏移和航向估计 `base_link` 位姿。`heading_offset_deg` 需要按实车安装复核。

## 导航节点

订阅：

- `/task` (`rtk_interfaces/Task`)
- `/odometry/rtk` (`nav_msgs/Odometry`)
- `/rtk/fix_quality` (`std_msgs/UInt8`)

发布：

- `/cmd_vel` (`geometry_msgs/Twist`)
- `/navigation/state` (`rtk_interfaces/TaskStatus`)
- `/um982_rtk/active_path` (`nav_msgs/Path`)
- `/um982_rtk/navigation_status` (`std_msgs/String`)

导航默认要求 RTK fixed，参数在 `config/navigation.yaml` 的 `control.require_rtk_fixed` 和 `control.fixed_quality_value` 中配置。

最后整理：2026-05-18
