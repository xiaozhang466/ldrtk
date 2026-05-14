# TaskNode.msg
# 任务节点 - 支持导航和电机控制节点

string nodetype                     # 节点类型: "forwardgoal", "backgoal", "motor_action"
geometry_msgs/Pose pose             # 导航节点的目标位置和朝向

# 导航节点参数
float64 distance_error              # 导航完成位置容差（米），0=使用默认值
float64 yaw_error                   # 导航完成朝向容差（弧度），0=使用默认值
float64 uniform_speed               # 恒速覆盖（m/s），0=禁用，使用比例控制

# 电机动作节点参数（nodetype="motor_action"时使用）
string motor_action                 # 电机动作名称（如"lift_up", "lift_down", "rotate", "stir", "blower"等）
uint32 action_duration              # 动作持续时间（毫秒）
uint32 action_timeout               # 动作超时时间（毫秒），超时后会被中断
string action_description           # 动作描述，用于日志和调试