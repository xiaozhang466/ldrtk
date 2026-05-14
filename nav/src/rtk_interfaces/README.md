# rtk_interfaces

**耘小智 01 机器人 ROS 接口定义包**

版本：v2.0.0  
维护者：Sir  
许可：MIT

---

## 📋 项目简介

`rtk_interfaces` 是耘小智 01 机器人的自定义 ROS 消息/服务接口定义包，提供统一的通信协议标准。

**核心功能:**
- 🛰️ GPS 状态消息（RTK 定位状态）
- 🤖 电机控制消息（动作指令 + 状态反馈）
- 🚧 障碍物检测消息
- 📋 任务管理消息（任务定义 + 节点 + 状态）

---

## 📦 消息定义

### 1. GpsStatus.msg - GPS 状态消息

**用途:** 发布 RTK GPS 定位状态

```ros
Header header            # 标准头信息
int32 status             # -1=无信号，0=普通，1=差分
int32 star               # 搜星数量
```

**使用场景:**
- RTK 定位状态监控
- 定位质量评估
- 导航系统状态反馈

**话题示例:**
```bash
/gps/status    - rtk_interfaces/GpsStatus
```

---

### 2. MotorCommand.msg - 电机控制指令

**用途:** 发送电机动作控制指令（通过 RS485 Modbus 协议）

```ros
uint8 action_id        # 动作 ID (0-8 对应 D0-D8)
uint8 action_type      # 动作类型：0=停止，1=启动，2=急停
uint32 duration        # 持续时间（毫秒），0=无限
string description     # 动作描述
```

**动作 ID 映射:**
| ID | 动作 | 说明 |
|----|------|------|
| 0 | D0 | 预留 |
| 1 | D1 | 升降机构上升 |
| 2 | D2 | 升降机构下降 |
| 3 | D3 | 旋转机构启动 |
| 4 | D4 | 搅拌机构启动 |
| 5 | D5 | 风机启动 |
| 6-8 | D6-D8 | 预留 |

**使用场景:**
- 农具控制（升降、旋转、搅拌）
- 风机控制（喷洒作业）
- 执行器动作控制

**话题示例:**
```bash
/motor/command    - rtk_interfaces/MotorCommand
```

---

### 3. MotorStatus.msg - 电机状态反馈

**用途:** 发布电机动作完成状态

```ros
uint8 action_id         # 完成的动作 ID (0-8)
uint8 status            # 状态：0=失败，1=成功，2=超时
uint8 completion_signal # 完成信号值 (0=未完成，1=完成)
string error_message    # 错误信息（失败时）
time timestamp          # 完成时间戳
```

**状态说明:**
| 状态码 | 说明 |
|--------|------|
| 0 | 失败（检查 error_message） |
| 1 | 成功 |
| 2 | 超时 |

**使用场景:**
- 动作执行结果反馈
- 故障诊断
- 任务流程控制

**话题示例:**
```bash
/motor/status    - rtk_interfaces/MotorStatus
```

---

### 4. Obstacle.msg - 障碍物检测消息

**用途:** 发布障碍物检测信息

```ros
Header header      # 标准头信息
float64 distance   # 障碍物距离，单位：mm
```

**使用场景:**
- 超声波传感器数据
- 激光雷达障碍物检测
- 避障系统输入

**话题示例:**
```bash
/obstacle/front    - rtk_interfaces/Obstacle
/obstacle/back     - rtk_interfaces/Obstacle
```

---

### 5. Task.msg - 任务定义消息

**用途:** 定义完整的作业任务

```ros
Header header              # 标准头信息
bool repeat                # 是否重复执行
string taskid              # 任务唯一标识
string type                # 任务类型
string name                # 任务名称
TaskNode[] nodes           # 任务节点列表
```

**任务类型:**
- `navigation` - 导航任务
- `work` - 作业任务
- `inspection` - 巡检任务

**使用场景:**
- 任务下发
- 任务队列管理
- 多任务调度

**话题示例:**
```bash
/task/current    - rtk_interfaces/Task
```

---

### 6. TaskNode.msg - 任务节点消息

**用途:** 定义任务中的单个节点（支持导航和电机控制）

```ros
# 节点类型
string nodetype                     # "forwardgoal"(前进到目标), "backgoal"(后退到目标), "motor_action"(电机动作)

# 导航节点参数
geometry_msgs/Pose pose             # 目标位置和朝向
float64 distance_error              # 位置容差（米），0=使用默认值
float64 yaw_error                   # 朝向容差（弧度），0=使用默认值
float64 uniform_speed               # 恒速覆盖（m/s），0=禁用

# 电机动作节点参数
string motor_action                 # 动作名称（如"lift_up", "lift_down", "rotate"等）
uint32 action_duration              # 动作持续时间（毫秒）
uint32 action_timeout               # 动作超时时间（毫秒）
string action_description           # 动作描述
```

**节点类型说明:**
| 类型 | 说明 | 参数 |
|------|------|------|
| `forwardgoal` | 前进到目标点 | pose, distance_error, yaw_error |
| `backgoal` | 后退到目标点 | pose, distance_error, yaw_error |
| `motor_action` | 执行电机动作 | motor_action, duration, timeout |

**使用场景:**
- 任务路径点定义
- 复合任务编排（导航 + 作业）
- 自动作业流程

**示例:**
```ros
# 导航到果园 A 点并启动风机
TaskNode node1:
  nodetype: "forwardgoal"
  pose: {x: 10.0, y: 5.0, yaw: 1.57}
  distance_error: 0.1
  
TaskNode node2:
  nodetype: "motor_action"
  motor_action: "blower"
  action_duration: 30000  # 30 秒
```

---

### 7. TaskStatus.msg - 任务状态消息

**用途:** 发布任务执行状态

```ros
Header header
string taskid
string status
float64 progress
uint32 current_waypoint_idx
uint32 total_waypoints
string detail
```

**状态定义:**
| 状态 | 说明 |
|------|------|
| idle | 空闲 |
| running | 执行中 |
| paused | 已暂停 |
| completed | 已完成 |
| stopped | 已停止 |
| aborted | 已急停/中止 |
| waiting_for_odom | 等待里程计 |
| waiting_for_fixed | 等待 RTK 固定解 |
| error | 错误 |

**使用场景:**
- 任务进度监控
- 任务状态同步
- Web UI 状态显示

**话题示例:**
```bash
/navigation/state    - rtk_interfaces/TaskStatus
```

---

## 🔧 编译说明

### 依赖

```bash
sudo apt-get install ros-noetic-message-generation ros-noetic-message-runtime
```

### 编译步骤

```bash
# 1. 克隆到工作空间
cd ~/catkin_ws/src
git clone <repository_url>

# 2. 编译
cd ~/catkin_ws
catkin_make

# 3. 验证
rostopic list | grep sigucar
```

### 生成的消息类型

编译后会在 `devel/share/rtk_interfaces/cmake/` 生成以下文件：
- `rtk_interfaces-msg-paths.cmake`
- `rtk_interfacesConfig.cmake`

---

## 💡 使用示例

### Python 示例

#### 发布 GPS 状态

```python
#!/usr/bin/env python3
import rospy
from rtk_interfaces.msg import GpsStatus
from std_msgs.msg import Header

pub = rospy.Publisher('/gps/status', GpsStatus, queue_size=10)

def publish_gps_status():
    msg = GpsStatus()
    msg.header = Header()
    msg.header.stamp = rospy.Time.now()
    msg.status = 1  # 差分定位
    msg.star = 15   # 15 颗星
    pub.publish(msg)

if __name__ == '__main__':
    rospy.init_node('gps_publisher')
    rate = rospy.Rate(1)  # 1Hz
    while not rospy.is_shutdown():
        publish_gps_status()
        rate.sleep()
```

#### 订阅任务状态

```python
#!/usr/bin/env python3
import rospy
from rtk_interfaces.msg import TaskStatus

def task_status_callback(msg):
    rospy.loginfo(f"任务 {msg.taskid} 状态：{msg.status}")

rospy.init_node('task_monitor')
sub = rospy.Subscriber('/task/status', TaskStatus, task_status_callback)
rospy.spin()
```

### C++ 示例

#### 发布电机控制指令

```cpp
#include <ros/ros.h>
#include <rtk_interfaces/MotorCommand.h>

int main(int argc, char** argv) {
    ros::init(argc, argv, "motor_controller");
    ros::NodeHandle nh;
    
    ros::Publisher pub = nh.advertise<rtk_interfaces::MotorCommand>(
        "/motor/command", 10);
    
    rtk_interfaces::MotorCommand msg;
    msg.action_id = 1;           // 升降上升
    msg.action_type = 1;         // 启动
    msg.duration = 5000;         // 5 秒
    msg.description = "升起升降机构";
    
    ros::Rate rate(1);
    while (ros::ok()) {
        pub.publish(msg);
        ROS_INFO("发布电机控制指令");
        rate.sleep();
    }
    
    return 0;
}
```

---

## 📊 消息依赖关系

```
Task.msg
├── Header (std_msgs)
├── TaskNode[] (自定义)
│   ├── Pose (geometry_msgs)
│   └── 电机动作参数
└── 任务元数据

MotorCommand.msg
└── 动作控制参数

MotorStatus.msg
└── 动作反馈参数

GpsStatus.msg
└── Header (std_msgs)

Obstacle.msg
└── Header (std_msgs)

TaskStatus.msg
└── Header (std_msgs)
```

---

## 🛠️ 维护说明

### 添加新消息

1. 在 `msg/` 目录创建 `.msg` 文件
2. 更新 `CMakeLists.txt` 中的 `add_message_files()`
3. 更新 `package.xml` 中的依赖
4. 重新编译 `catkin_make`

### 版本管理

- **主版本号:** 不兼容的 API 变更
- **次版本号:** 向后兼容的功能新增
- **修订号:** 向后兼容的问题修复

---

## 🤝 协作者

- **Sir** - 初始设计和实现

---

## 📄 许可证

MIT License

Copyright © 2026 耘小智 01 团队
