# rtk_interfaces

耘小智 01 ROS 自定义消息包，定义 RTK 状态、任务、导航状态、电机动作和障碍物消息。

## 消息文件

```text
msg/
├── GpsStatus.msg
├── MotorCommand.msg
├── MotorStatus.msg
├── Obstacle.msg
├── Task.msg
├── TaskNode.msg
└── TaskStatus.msg
```

## GpsStatus.msg

```ros
Header header
int32 status
int32 star
bool ntrip_ok
```

字段说明：

- `status`：`-1` 无信号，`0` 普通，`1` 差分。
- `star`：卫星数量。
- `ntrip_ok`：NTRIP/基站连接状态。当前 UM982 主流程使用果园基站/接收机链路，该字段仍保留给兼容状态展示。

## Task.msg

```ros
Header header
bool repeat
string taskid
string type
string name
rtk_interfaces/TaskNode[] nodes
```

任务由前端导航页发布到 `/task`。`nodes` 是路径点和动作节点序列。

## TaskNode.msg

```ros
string nodetype
geometry_msgs/Pose pose

float64 distance_error
float64 yaw_error
float64 uniform_speed

string motor_action
uint32 action_duration
uint32 action_timeout
string action_description
```

常用 `nodetype`：

- `forwardgoal`：前进到目标点。
- `backgoal`：后退到目标点。
- `motor_action`：执行电机/作业动作。

## TaskStatus.msg

```ros
Header header
string taskid
string status
float64 progress
uint32 current_waypoint_idx
uint32 total_waypoints
string detail
```

当前导航状态发布到 `/navigation/state`。常用状态：

| 状态 | 说明 |
| --- | --- |
| `idle` | 空闲 |
| `running` | 执行中 |
| `paused` | 暂停 |
| `completed` | 完成 |
| `stopped` | 停止 |
| `aborted` | 中止/急停 |
| `waiting_for_odom` | 等待里程计 |
| `waiting_for_fixed` | 等待 RTK 固定解 |
| `error` | 错误 |

## MotorCommand.msg

```ros
uint8 action_id
uint8 action_type
uint32 duration
string description
```

- `action_type`：`0` 停止，`1` 启动，`2` 急停。
- `duration`：持续时间，单位毫秒，`0` 表示不限制。

## MotorStatus.msg

```ros
uint8 action_id
uint8 status
uint8 completion_signal
string error_message
time timestamp
```

- `status`：`0` 失败，`1` 成功，`2` 超时。
- `completion_signal`：底层完成信号。

## Obstacle.msg

```ros
Header header
float64 distance
```

`distance` 单位为毫米。

## 编译

在 `nav` 工作空间编译：

```bash
cd nav
catkin_make
source devel/setup.bash
```

验证消息：

```bash
rosmsg show rtk_interfaces/Task
rosmsg show rtk_interfaces/TaskStatus
```

## 维护

新增或修改 `.msg` 后，需要同步更新：

- `msg/` 下的消息文件。
- `CMakeLists.txt` 的 `add_message_files()`。
- 依赖包的 `package.xml`。
- 本 README 和前后端发布/订阅代码。

最后整理：2026-05-18
