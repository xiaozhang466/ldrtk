#!/usr/bin/env python3
"""Publish calibrated map->camera_init TF and LiDAR odometry in RTK map frame."""

from __future__ import annotations

import math
import os
from pathlib import Path
from typing import Any, Tuple

import rospy
import tf2_ros
import yaml
from geometry_msgs.msg import TransformStamped
from nav_msgs.msg import Odometry
from std_msgs.msg import String


def find_project_root() -> Path:
    env_root = os.environ.get("RTK_ROOT")
    if env_root:
        return Path(env_root).resolve()
    current = Path(__file__).resolve()
    for parent in [current] + list(current.parents):
        if (parent / "nav" / "launch" / "bringup.launch").exists():
            return parent
    return Path.cwd().resolve()


def configured_alignment_path(map_name: str, map_base_path: str, alignment_file: str) -> Path:
    if alignment_file:
        return Path(alignment_file).expanduser().resolve()
    if not map_name:
        raise ValueError("map_name is required when alignment_file is empty")
    base = Path(map_base_path).expanduser().resolve() if map_base_path else find_project_root() / "data" / "maps"
    return base / map_name / "calibration" / "rtk_lidar.yaml"


def string_param(primary: str, fallback: str, default: str = "") -> str:
    value = str(rospy.get_param(primary, "")).strip()
    if value:
        return value
    return str(rospy.get_param(fallback, default)).strip()


def yaw_to_quaternion(yaw: float) -> Tuple[float, float, float, float]:
    half = yaw * 0.5
    return 0.0, 0.0, math.sin(half), math.cos(half)


def quaternion_multiply(a: Tuple[float, float, float, float], b: Any) -> Tuple[float, float, float, float]:
    ax, ay, az, aw = a
    bx, by, bz, bw = b.x, b.y, b.z, b.w
    return (
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
        aw * bw - ax * bx - ay * by - az * bz,
    )


def normalize_quaternion(q: Tuple[float, float, float, float]) -> Tuple[float, float, float, float]:
    x, y, z, w = q
    norm = math.sqrt(x * x + y * y + z * z + w * w)
    if norm < 1e-9:
        return 0.0, 0.0, 0.0, 1.0
    return x / norm, y / norm, z / norm, w / norm


def require_number(data: dict, section: str, key: str) -> float:
    try:
        return float(data[section][key])
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError("alignment file missing numeric %s.%s" % (section, key)) from exc


def load_alignment(path: Path) -> dict:
    if not path.exists():
        raise FileNotFoundError("alignment file not found: %s" % path)
    with path.open("r", encoding="utf-8") as handle:
        data = yaml.safe_load(handle) or {}
    if not isinstance(data, dict):
        raise ValueError("alignment file must be a YAML mapping: %s" % path)

    parent = str(data.get("parent_frame", "")).strip()
    child = str(data.get("child_frame", "")).strip()
    if not parent or not child:
        raise ValueError("alignment file must define parent_frame and child_frame")

    tx = require_number(data, "translation", "x")
    ty = require_number(data, "translation", "y")
    tz = require_number(data, "translation", "z")
    yaw = require_number(data, "rotation", "yaw_rad")

    return {
        "parent_frame": parent,
        "child_frame": child,
        "tx": tx,
        "ty": ty,
        "tz": tz,
        "yaw": yaw,
    }


class FrameAlignmentPublisher:
    def __init__(self) -> None:
        self.map_name = str(rospy.get_param("~map_name", "")).strip()
        self.map_base_path = string_param("~map_base_path", "~paths/map_base_path")
        self.alignment_file = string_param("~alignment_file", "~paths/alignment_file")

        self.lidar_odom_topic = rospy.get_param("~topics/lidar_odom", "/Odometry")
        self.output_odom_topic = rospy.get_param("~topics/lidar_in_rtk_odom", "/odometry/lidar_in_rtk")
        self.status_topic = rospy.get_param("~topics/status", "/nav_fusion/alignment_status")
        self.output_child_frame = rospy.get_param("~frames/output_child", "base_link")

        self.alignment_path = configured_alignment_path(self.map_name, self.map_base_path, self.alignment_file)
        self.alignment = load_alignment(self.alignment_path)

        self.parent_frame = self.alignment["parent_frame"]
        self.child_frame = self.alignment["child_frame"]
        self.tx = self.alignment["tx"]
        self.ty = self.alignment["ty"]
        self.tz = self.alignment["tz"]
        self.yaw = self.alignment["yaw"]
        self.cos_yaw = math.cos(self.yaw)
        self.sin_yaw = math.sin(self.yaw)
        self.yaw_quaternion = yaw_to_quaternion(self.yaw)

        self.status_pub = rospy.Publisher(self.status_topic, String, queue_size=10, latch=True)
        self.odom_pub = rospy.Publisher(self.output_odom_topic, Odometry, queue_size=20)
        self.static_broadcaster = tf2_ros.StaticTransformBroadcaster()

        self.publish_static_transform()
        self.odom_sub = rospy.Subscriber(self.lidar_odom_topic, Odometry, self.odom_callback, queue_size=50)
        self.publish_status(
            "loaded file=%s tf=%s->%s lidar=%s output=%s"
            % (self.alignment_path, self.parent_frame, self.child_frame, self.lidar_odom_topic, self.output_odom_topic)
        )

    def publish_status(self, text: str) -> None:
        self.status_pub.publish(String(data=text))
        rospy.loginfo("frame alignment: %s", text)

    def publish_static_transform(self) -> None:
        transform = TransformStamped()
        transform.header.stamp = rospy.Time.now()
        transform.header.frame_id = self.parent_frame
        transform.child_frame_id = self.child_frame
        transform.transform.translation.x = self.tx
        transform.transform.translation.y = self.ty
        transform.transform.translation.z = self.tz
        qx, qy, qz, qw = self.yaw_quaternion
        transform.transform.rotation.x = qx
        transform.transform.rotation.y = qy
        transform.transform.rotation.z = qz
        transform.transform.rotation.w = qw
        self.static_broadcaster.sendTransform(transform)

    def odom_callback(self, msg: Odometry) -> None:
        position = msg.pose.pose.position
        out = Odometry()
        out.header.stamp = msg.header.stamp if msg.header.stamp != rospy.Time(0) else rospy.Time.now()
        out.header.frame_id = self.parent_frame
        out.child_frame_id = self.output_child_frame or msg.child_frame_id

        out.pose.pose.position.x = self.cos_yaw * position.x - self.sin_yaw * position.y + self.tx
        out.pose.pose.position.y = self.sin_yaw * position.x + self.cos_yaw * position.y + self.ty
        out.pose.pose.position.z = position.z + self.tz

        qx, qy, qz, qw = normalize_quaternion(quaternion_multiply(self.yaw_quaternion, msg.pose.pose.orientation))
        out.pose.pose.orientation.x = qx
        out.pose.pose.orientation.y = qy
        out.pose.pose.orientation.z = qz
        out.pose.pose.orientation.w = qw

        out.pose.covariance = list(msg.pose.covariance)
        out.twist = msg.twist
        self.odom_pub.publish(out)


def main() -> None:
    rospy.init_node("frame_alignment_publisher")
    try:
        FrameAlignmentPublisher()
    except Exception as exc:
        rospy.logfatal("frame alignment startup failed: %s", exc)
        raise SystemExit(1)
    rospy.spin()


if __name__ == "__main__":
    main()
