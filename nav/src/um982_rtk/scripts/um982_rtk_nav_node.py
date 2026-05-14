#!/usr/bin/env python3
"""RTK-first pure pursuit navigation node.

This node intentionally keeps the first navigation chain small:

  /task + /odometry/rtk + /rtk/fix_quality -> /cmd_vel

It does not depend on move_base, waypoint_patrol, LiDAR, or source manager.
"""

from __future__ import annotations

import math
import os
import signal
import time
from dataclasses import dataclass
from typing import Any

import rospy
import yaml
from geometry_msgs.msg import Point, PoseStamped, Twist
from nav_msgs.msg import Odometry, Path
from rtk_interfaces.msg import Task, TaskNode, TaskStatus
from std_msgs.msg import String, UInt8


NAV_NODE_TYPES = {"forwardgoal", "backgoal", "waypoint", "work_point"}
CONTROL_TASK_TYPES = {"pause", "resume", "stop", "abort"}


@dataclass
class Waypoint:
    x: float
    y: float
    z: float
    yaw: float
    nodetype: str
    distance_tolerance: float
    yaw_tolerance: float
    uniform_speed: float


def load_yaml(path: str) -> dict[str, Any]:
    if not path:
        return {}
    with open(path, "r", encoding="utf-8") as handle:
        data = yaml.safe_load(handle) or {}
    if not isinstance(data, dict):
        raise ValueError(f"config must be a YAML mapping: {path}")
    return data


def nested_get(data: dict[str, Any], path: str, default: Any) -> Any:
    current: Any = data
    for key in path.split("."):
        if not isinstance(current, dict) or key not in current:
            return default
        current = current[key]
    return current


def clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


def shortest_angular_distance(target: float, current: float) -> float:
    error = target - current
    while error > math.pi:
        error -= 2.0 * math.pi
    while error < -math.pi:
        error += 2.0 * math.pi
    return error


def yaw_from_quaternion(x: float, y: float, z: float, w: float) -> float:
    siny_cosp = 2.0 * (w * z + x * y)
    cosy_cosp = 1.0 - 2.0 * (y * y + z * z)
    return math.atan2(siny_cosp, cosy_cosp)


def yaw_from_pose(node: TaskNode) -> float:
    q = node.pose.orientation
    return yaw_from_quaternion(q.x, q.y, q.z, q.w)


def distance_xy(a: Point, b: Waypoint) -> float:
    return math.hypot(b.x - a.x, b.y - a.y)


class UM982RtkNavNode:
    def __init__(self) -> None:
        config_path = os.path.abspath(rospy.get_param("~config", ""))
        cfg = load_yaml(config_path) if config_path else {}

        self.odom_topic = rospy.get_param("~odom_topic", nested_get(cfg, "topics.odom", "/odometry/rtk"))
        self.task_topic = rospy.get_param("~task_topic", nested_get(cfg, "topics.task", "/task"))
        self.cmd_vel_topic = rospy.get_param("~cmd_vel_topic", nested_get(cfg, "topics.cmd_vel", "/cmd_vel"))
        self.fix_quality_topic = rospy.get_param("~fix_quality_topic", nested_get(cfg, "topics.fix_quality", "/rtk/fix_quality"))
        self.state_topic = rospy.get_param("~state_topic", nested_get(cfg, "topics.state", "/navigation/state"))
        self.active_path_topic = rospy.get_param("~active_path_topic", nested_get(cfg, "topics.active_path", "/um982_rtk/active_path"))
        self.status_topic = rospy.get_param("~status_topic", nested_get(cfg, "topics.status", "/um982_rtk/navigation_status"))

        self.frequency = float(nested_get(cfg, "control.frequency", 20.0))
        self.odom_timeout = float(nested_get(cfg, "control.odom_timeout", 1.0))
        self.require_rtk_fixed = bool(nested_get(cfg, "control.require_rtk_fixed", True))
        self.fixed_quality_value = int(nested_get(cfg, "control.fixed_quality_value", 4))

        self.lookahead_distance = float(nested_get(cfg, "tracking.lookahead_distance", 0.8))
        self.waypoint_tolerance = float(nested_get(cfg, "tracking.waypoint_tolerance", 0.5))
        self.goal_tolerance = float(nested_get(cfg, "tracking.goal_tolerance", 0.35))
        self.max_linear_speed = float(nested_get(cfg, "tracking.max_linear_speed", 0.2))
        self.max_angular_speed = float(nested_get(cfg, "tracking.max_angular_speed", 0.35))
        self.min_linear_speed = float(nested_get(cfg, "tracking.min_linear_speed", 0.04))
        self.slowdown_distance = float(nested_get(cfg, "tracking.slowdown_distance", 1.2))
        self.rotate_in_place_threshold = float(nested_get(cfg, "tracking.rotate_in_place_threshold", 0.85))
        self.yaw_align_speed = float(nested_get(cfg, "tracking.yaw_align_speed", 0.25))
        self.turn_slowdown_angular = float(nested_get(cfg, "tracking.turn_slowdown_angular", 0.25))
        self.allow_reverse = bool(nested_get(cfg, "tracking.allow_reverse", False))

        self.smoothing_enabled = bool(nested_get(cfg, "smoothing.enabled", True))
        self.linear_acceleration = float(nested_get(cfg, "smoothing.linear_acceleration", 0.12))
        self.angular_acceleration = float(nested_get(cfg, "smoothing.angular_acceleration", 0.25))

        self.enforce_goal_yaw = bool(nested_get(cfg, "goal.enforce_goal_yaw", False))
        self.default_yaw_tolerance = float(nested_get(cfg, "goal.default_yaw_tolerance", 0.15))

        self.current_odom: Odometry | None = None
        self.last_odom_time = 0.0
        self.last_fix_quality: int | None = None
        self.path: list[Waypoint] = []
        self.current_idx = 0
        self.last_total_waypoints = 0
        self.taskid = ""
        self.state = "idle"
        self.detail = "waiting_for_task"
        self.last_cmd = Twist()
        self.last_control_time = time.monotonic()

        self.cmd_pub = rospy.Publisher(self.cmd_vel_topic, Twist, queue_size=10)
        self.state_pub = rospy.Publisher(self.state_topic, TaskStatus, queue_size=10, latch=True)
        self.path_pub = rospy.Publisher(self.active_path_topic, Path, queue_size=1, latch=True)
        self.status_pub = rospy.Publisher(self.status_topic, String, queue_size=5, latch=True)

        self.odom_sub = rospy.Subscriber(self.odom_topic, Odometry, self.odom_callback, queue_size=10)
        self.task_sub = rospy.Subscriber(self.task_topic, Task, self.task_callback, queue_size=5)
        self.fix_sub = rospy.Subscriber(self.fix_quality_topic, UInt8, self.fix_quality_callback, queue_size=10)

        self.control_timer = rospy.Timer(rospy.Duration(1.0 / self.frequency), self.control_loop)
        self.status_timer = rospy.Timer(rospy.Duration(0.5), lambda _event: self.publish_state())

        rospy.loginfo(
            "um982_rtk_nav configured: odom=%s task=%s cmd_vel=%s fixed_required=%s max_v=%.2f max_w=%.2f",
            self.odom_topic,
            self.task_topic,
            self.cmd_vel_topic,
            self.require_rtk_fixed,
            self.max_linear_speed,
            self.max_angular_speed,
        )
        self.publish_state()

    def odom_callback(self, msg: Odometry) -> None:
        self.current_odom = msg
        self.last_odom_time = time.monotonic()

    def fix_quality_callback(self, msg: UInt8) -> None:
        self.last_fix_quality = int(msg.data)

    def task_callback(self, msg: Task) -> None:
        task_type = msg.type.strip().lower()
        if task_type in CONTROL_TASK_TYPES:
            self.handle_control_task(task_type, msg.taskid)
            return

        waypoints = self.extract_waypoints(msg)
        if not waypoints:
            self.stop_motion()
            self.state = "idle"
            self.detail = "task_has_no_navigation_waypoints"
            self.publish_state()
            rospy.logwarn("UM982 navigation task ignored: no navigation waypoints")
            return

        self.path = waypoints
        self.current_idx = 0
        self.last_total_waypoints = len(waypoints)
        self.taskid = msg.taskid
        self.state = "running"
        self.detail = f"accepted {len(waypoints)} waypoints"
        self.last_cmd = Twist()
        self.publish_active_path()
        self.publish_state()
        rospy.loginfo("UM982 navigation task accepted: taskid=%s waypoints=%d", self.taskid, len(self.path))

    def handle_control_task(self, task_type: str, taskid: str) -> None:
        if task_type == "pause":
            if self.state == "running":
                self.state = "paused"
                self.detail = "paused"
            self.stop_motion()
        elif task_type == "resume":
            if self.path and self.state in ("paused", "stopped", "waiting_for_odom", "waiting_for_fixed"):
                self.state = "running"
                self.detail = "resumed"
        elif task_type == "stop":
            self.state = "stopped"
            self.detail = "stopped"
            self.clear_task()
            self.stop_motion()
        elif task_type == "abort":
            self.state = "aborted"
            self.detail = "aborted"
            self.clear_task()
            self.stop_motion()
        if taskid:
            self.taskid = taskid
        self.publish_state()
        rospy.loginfo("UM982 navigation control task: %s", task_type)

    def extract_waypoints(self, msg: Task) -> list[Waypoint]:
        waypoints: list[Waypoint] = []
        for node in msg.nodes:
            if node.nodetype not in NAV_NODE_TYPES:
                continue
            tolerance = node.distance_error if node.distance_error > 0.0 else self.waypoint_tolerance
            yaw_tolerance = node.yaw_error if node.yaw_error > 0.0 else self.default_yaw_tolerance
            waypoints.append(
                Waypoint(
                    x=float(node.pose.position.x),
                    y=float(node.pose.position.y),
                    z=float(node.pose.position.z),
                    yaw=yaw_from_pose(node),
                    nodetype=node.nodetype,
                    distance_tolerance=float(tolerance),
                    yaw_tolerance=float(yaw_tolerance),
                    uniform_speed=max(0.0, float(node.uniform_speed)),
                )
            )
        return waypoints

    def clear_task(self, reset_taskid: bool = True) -> None:
        self.path = []
        if reset_taskid:
            self.current_idx = 0
            self.taskid = ""
            self.last_total_waypoints = 0
        self.publish_active_path()

    def current_pose(self) -> tuple[Point, float] | None:
        if self.current_odom is None:
            return None
        pose = self.current_odom.pose.pose
        q = pose.orientation
        return pose.position, yaw_from_quaternion(q.x, q.y, q.z, q.w)

    def odom_is_fresh(self) -> bool:
        return self.current_odom is not None and (time.monotonic() - self.last_odom_time) <= self.odom_timeout

    def rtk_is_fixed(self) -> bool:
        if not self.require_rtk_fixed:
            return True
        return self.last_fix_quality == self.fixed_quality_value

    def advance_waypoints(self, position: Point, yaw: float) -> None:
        while self.current_idx < len(self.path):
            target = self.path[self.current_idx]
            is_goal = self.current_idx == len(self.path) - 1
            tolerance = self.goal_tolerance if is_goal else target.distance_tolerance
            if distance_xy(position, target) > tolerance:
                return
            if is_goal and self.enforce_goal_yaw:
                if abs(shortest_angular_distance(target.yaw, yaw)) > target.yaw_tolerance:
                    return
            self.current_idx += 1

    def find_lookahead(self, position: Point) -> Waypoint:
        if self.current_idx >= len(self.path):
            return self.path[-1]
        for waypoint in self.path[self.current_idx:]:
            if distance_xy(position, waypoint) >= self.lookahead_distance:
                return waypoint
        return self.path[-1]

    def compute_command(self, position: Point, yaw: float) -> Twist:
        self.advance_waypoints(position, yaw)
        cmd = Twist()

        if self.current_idx >= len(self.path):
            self.last_total_waypoints = len(self.path)
            self.current_idx = max(0, len(self.path) - 1)
            self.state = "completed"
            self.detail = "goal_reached"
            self.clear_task(reset_taskid=False)
            return cmd

        target = self.find_lookahead(position)
        final_target = self.path[-1]
        dx = target.x - position.x
        dy = target.y - position.y
        x_local = dx * math.cos(-yaw) - dy * math.sin(-yaw)
        y_local = dx * math.sin(-yaw) + dy * math.cos(-yaw)
        lookahead_dist = math.hypot(x_local, y_local)

        if lookahead_dist < 1e-6:
            return cmd

        heading_error = math.atan2(y_local, x_local)
        if abs(heading_error) > self.rotate_in_place_threshold:
            cmd.linear.x = 0.0
            cmd.angular.z = clamp(heading_error, -self.yaw_align_speed, self.yaw_align_speed)
            return cmd

        speed_limit = target.uniform_speed if target.uniform_speed > 0.0 else self.max_linear_speed
        speed_limit = min(speed_limit, self.max_linear_speed)

        dist_to_goal = math.hypot(final_target.x - position.x, final_target.y - position.y)
        if self.slowdown_distance > 0.0:
            speed_scale = clamp(dist_to_goal / self.slowdown_distance, 0.0, 1.0)
            linear = speed_limit * speed_scale
            if dist_to_goal > self.goal_tolerance:
                linear = max(self.min_linear_speed, linear)
        else:
            linear = speed_limit

        if target.nodetype == "backgoal" and self.allow_reverse:
            linear = -linear

        curvature = 2.0 * y_local / (lookahead_dist * lookahead_dist)
        angular = curvature * linear
        angular = clamp(angular, -self.max_angular_speed, self.max_angular_speed)

        if abs(angular) > self.turn_slowdown_angular and self.max_angular_speed > 0.0:
            turn_scale = clamp(1.0 - abs(angular) / self.max_angular_speed * 0.5, 0.35, 1.0)
            linear *= turn_scale

        cmd.linear.x = clamp(linear, -self.max_linear_speed, self.max_linear_speed)
        cmd.angular.z = angular
        return cmd

    def smooth_command(self, raw: Twist) -> Twist:
        if not self.smoothing_enabled:
            return raw

        now = time.monotonic()
        dt = max(1e-3, now - self.last_control_time)
        self.last_control_time = now

        cmd = Twist()
        max_dv = self.linear_acceleration * dt
        max_dw = self.angular_acceleration * dt
        cmd.linear.x = self.last_cmd.linear.x + clamp(raw.linear.x - self.last_cmd.linear.x, -max_dv, max_dv)
        cmd.angular.z = self.last_cmd.angular.z + clamp(raw.angular.z - self.last_cmd.angular.z, -max_dw, max_dw)
        return cmd

    def control_loop(self, _event: rospy.timer.TimerEvent) -> None:
        if self.state not in ("running", "waiting_for_odom", "waiting_for_fixed"):
            if self.state in ("paused", "stopped", "aborted", "completed"):
                self.stop_motion()
            return

        if not self.odom_is_fresh():
            self.state = "waiting_for_odom"
            self.detail = "waiting_for_fresh_odometry"
            self.stop_motion()
            return

        if not self.rtk_is_fixed():
            self.state = "waiting_for_fixed"
            self.detail = f"waiting_for_rtk_fixed quality={self.last_fix_quality}"
            self.stop_motion()
            return

        if not self.path:
            self.state = "idle"
            self.detail = "waiting_for_task"
            self.stop_motion()
            return

        self.state = "running"
        pose = self.current_pose()
        if pose is None:
            self.stop_motion()
            return
        position, yaw = pose
        raw_cmd = self.compute_command(position, yaw)
        if self.state == "completed":
            self.stop_motion()
            self.publish_state()
            return
        cmd = self.smooth_command(raw_cmd)
        self.last_cmd = cmd
        self.cmd_pub.publish(cmd)
        if self.state == "running":
            self.detail = (
                f"idx={self.current_idx}/{len(self.path)} "
                f"cmd_v={cmd.linear.x:.3f} cmd_w={cmd.angular.z:.3f}"
            )

    def stop_motion(self) -> None:
        cmd = Twist()
        self.last_cmd = cmd
        self.last_control_time = time.monotonic()
        self.cmd_pub.publish(cmd)

    def progress(self) -> float:
        if not self.path:
            if self.state == "completed":
                return 100.0
            return 0.0
        return clamp(float(self.current_idx) / float(len(self.path)) * 100.0, 0.0, 100.0)

    def publish_state(self) -> None:
        msg = TaskStatus()
        msg.header.stamp = rospy.Time.now()
        msg.header.frame_id = "map"
        msg.taskid = self.taskid
        msg.status = self.state
        msg.progress = self.progress()
        total_waypoints = len(self.path) if self.path else self.last_total_waypoints
        max_idx = max(0, total_waypoints - 1)
        msg.current_waypoint_idx = min(self.current_idx, max_idx)
        msg.total_waypoints = total_waypoints
        msg.detail = self.detail
        self.state_pub.publish(msg)

        self.status_pub.publish(
            String(
                data=(
                    f"state={self.state} taskid={self.taskid} progress={msg.progress:.1f} "
                    f"idx={msg.current_waypoint_idx}/{msg.total_waypoints} detail={self.detail}"
                )
            )
        )

    def publish_active_path(self) -> None:
        path_msg = Path()
        path_msg.header.stamp = rospy.Time.now()
        path_msg.header.frame_id = "map"
        for waypoint in self.path:
            pose = PoseStamped()
            pose.header = path_msg.header
            pose.pose.position.x = waypoint.x
            pose.pose.position.y = waypoint.y
            pose.pose.position.z = waypoint.z
            pose.pose.orientation.w = 1.0
            path_msg.poses.append(pose)
        self.path_pub.publish(path_msg)

    def shutdown(self) -> None:
        self.stop_motion()


def main() -> int:
    signal.signal(signal.SIGINT, signal.SIG_DFL)
    rospy.init_node("um982_rtk_nav_node", anonymous=False)
    node = UM982RtkNavNode()
    rospy.on_shutdown(node.shutdown)
    rospy.spin()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
