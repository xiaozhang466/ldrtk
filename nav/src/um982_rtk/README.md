# um982_rtk

`um982_rtk` is the new RTK-first stack for the current vehicle.

Initial scope:

- Read the orchard-base-station RTK stream through the UM982 serial link.
- Publish fixed-solution position and dual-antenna heading as ROS topics.
- Provide `/odometry/rtk` as the navigation pose source.
- Keep compatibility aliases for existing frontend/ROS consumers.

Current first node:

- `scripts/um982_rtk_node.py`
- `scripts/um982_rtk_nav_node.py`

Primary topics:

- `/rtk/fix` (`sensor_msgs/NavSatFix`)
- `/rtk/heading` (`geometry_msgs/TwistWithCovarianceStamped`)
- `/odometry/rtk` (`nav_msgs/Odometry`)
- `/rtk/fix_type` (`std_msgs/String`)
- `/rtk/position_type` (`std_msgs/String`)
- `/rtk/satellites` (`std_msgs/UInt16`)
- `/um982_rtk/status` (`std_msgs/String`)

Antenna installation is configured in `config/rtk.yaml` under `antenna`.
`primary` and `secondary` are measured in `base_link` coordinates:

- `x`: forward, meters
- `y`: left, meters
- `z`: up, meters

`/rtk/fix` remains the receiver position from the RTK stream. `/odometry/rtk`
uses the primary antenna offset and heading to publish the estimated
`base_link` pose. `/rtk/heading` stays compass-style for the frontend:
north is 0 degrees, east is 90 degrees, clockwise positive. The odometry
quaternion is converted to ROS ENU yaw for path tracking.

The odometry coordinate mode is configured by `position.coordinate_mode`:

- `absolute_utm`: `/odometry/rtk.pose.position.x/y` are UTM easting/northing.
  This matches GPS paths saved by the current frontend/backend and is the
  default for RTK navigation.
- `local_origin`: `/odometry/rtk.pose.position.x/y` are relative to the
  configured origin or the first fixed RTK solution.

Compatibility aliases are enabled by default:

- `/gps/fix`
- `/gps/heading`
- `/gps/satellites`
- `/odometry/gps`

Navigation node:

- Subscribes `/task` (`rtk_interfaces/Task`)
- Subscribes `/odometry/rtk` (`nav_msgs/Odometry`)
- Subscribes `/rtk/fix_quality` (`std_msgs/UInt8`)
- Publishes `/cmd_vel` (`geometry_msgs/Twist`)
- Publishes `/navigation/state` (`rtk_interfaces/TaskStatus`)
- Publishes `/um982_rtk/active_path` (`nav_msgs/Path`)
- Publishes `/um982_rtk/navigation_status` (`std_msgs/String`)

`um982_rtk.launch` starts both RTK positioning and navigation by default.
Disable navigation with `launch_navigation:=false` when only validating RTK
topics.

Top-level `nav/launch/bringup.launch` also starts the Ranger chassis driver by
default, with `chassis_model:=ranger_mini_v2`. It subscribes `/cmd_vel` and
publishes `/odom`; RTK navigation still uses `/odometry/rtk` as its pose source.
Set `launch_chassis:=false` to test RTK without the base driver, or override
`chassis_model` if a different Ranger variant is used.
