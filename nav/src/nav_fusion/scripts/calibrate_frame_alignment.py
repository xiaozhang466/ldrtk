#!/usr/bin/env python3
"""Calibrate the 2D transform from LiDAR camera_init frame to RTK map frame."""

from __future__ import annotations

import math
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, List, Optional, Tuple

import numpy as np
import rospy
import yaml
from nav_msgs.msg import Odometry
from std_msgs.msg import String, UInt8


@dataclass
class PoseSample:
    stamp: float
    x: float
    y: float
    yaw: float


@dataclass
class PosePair:
    rtk: PoseSample
    lidar: PoseSample


def yaw_from_quaternion(q: Any) -> Optional[float]:
    norm = math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w)
    if norm < 0.5:
        return None
    x = q.x / norm
    y = q.y / norm
    z = q.z / norm
    w = q.w / norm
    siny_cosp = 2.0 * (w * z + x * y)
    cosy_cosp = 1.0 - 2.0 * (y * y + z * z)
    return math.atan2(siny_cosp, cosy_cosp)


def angle_diff(a: float, b: float) -> float:
    return math.atan2(math.sin(a - b), math.cos(a - b))


def yaw_span_rad(yaws: List[float]) -> float:
    if len(yaws) < 2:
        return 0.0
    values = np.unwrap(np.array(yaws, dtype=float))
    return float(values.max() - values.min())


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


def pose_from_odom(msg: Odometry, receipt_time: rospy.Time) -> Optional[PoseSample]:
    stamp = msg.header.stamp
    if stamp == rospy.Time(0):
        stamp = receipt_time
    yaw = yaw_from_quaternion(msg.pose.pose.orientation)
    if yaw is None:
        return None
    position = msg.pose.pose.position
    return PoseSample(
        stamp=stamp.to_sec(),
        x=float(position.x),
        y=float(position.y),
        yaw=yaw,
    )


def solve_transform(pairs: List[PosePair]) -> Tuple[float, float, float, float, float, float]:
    lidar_points = np.array([[pair.lidar.x, pair.lidar.y] for pair in pairs], dtype=float)
    rtk_points = np.array([[pair.rtk.x, pair.rtk.y] for pair in pairs], dtype=float)

    lidar_centroid = lidar_points.mean(axis=0)
    rtk_centroid = rtk_points.mean(axis=0)
    lidar_centered = lidar_points - lidar_centroid
    rtk_centered = rtk_points - rtk_centroid

    h_matrix = lidar_centered.T @ rtk_centered
    u_matrix, _singular, vt_matrix = np.linalg.svd(h_matrix)
    rotation = vt_matrix.T @ u_matrix.T
    if np.linalg.det(rotation) < 0.0:
        vt_matrix[-1, :] *= -1.0
        rotation = vt_matrix.T @ u_matrix.T

    translation = rtk_centroid - rotation @ lidar_centroid
    predicted = (rotation @ lidar_points.T).T + translation
    errors = np.linalg.norm(rtk_points - predicted, axis=1)

    yaw = math.atan2(rotation[1, 0], rotation[0, 0])
    rmse = float(math.sqrt(np.mean(errors * errors)))
    max_error = float(errors.max())
    return float(translation[0]), float(translation[1]), yaw, rmse, max_error, float(np.linalg.det(rotation))


class FrameAlignmentCalibrator:
    def __init__(self) -> None:
        self.map_name = str(rospy.get_param("~map_name", "")).strip()
        self.map_base_path = string_param("~map_base_path", "~paths/map_base_path")
        self.alignment_file = string_param("~alignment_file", "~paths/alignment_file")

        self.rtk_odom_topic = rospy.get_param("~topics/rtk_odom", "/odometry/rtk")
        self.lidar_odom_topic = rospy.get_param("~topics/lidar_odom", "/Odometry")
        self.rtk_quality_topic = rospy.get_param("~topics/rtk_quality", "/rtk/fix_quality")
        self.output_odom_topic = rospy.get_param("~topics/lidar_in_rtk_odom", "/odometry/lidar_in_rtk")
        self.status_topic = rospy.get_param("~topics/status", "/nav_fusion/alignment_status")

        self.parent_frame = rospy.get_param("~frames/parent", "map")
        self.child_frame = rospy.get_param("~frames/child", "camera_init")

        self.time_tolerance = float(rospy.get_param("~calibration/time_sync_tolerance_sec", 0.1))
        self.min_rtk_quality = int(rospy.get_param("~calibration/min_rtk_quality", 4))
        self.min_pairs = int(rospy.get_param("~calibration/min_pairs", 30))
        self.min_spatial_spread = float(rospy.get_param("~calibration/min_spatial_spread_m", 10.0))
        self.min_yaw_span = math.radians(float(rospy.get_param("~calibration/min_yaw_span_deg", 30.0)))
        self.max_rmse = float(rospy.get_param("~calibration/max_rmse_m", 0.5))
        self.max_yaw_error = math.radians(float(rospy.get_param("~calibration/max_yaw_check_error_deg", 10.0)))
        self.min_sample_distance = float(rospy.get_param("~calibration/min_sample_distance_m", 0.2))

        self.output_path = configured_alignment_path(self.map_name, self.map_base_path, self.alignment_file)
        self.status_pub = rospy.Publisher(self.status_topic, String, queue_size=10, latch=True)

        self.last_rtk: Optional[PoseSample] = None
        self.last_lidar: Optional[PoseSample] = None
        self.last_quality: Optional[int] = None
        self.pairs: List[PosePair] = []
        self.last_pair_key: Optional[Tuple[float, float]] = None
        self.finalized = False

        self.rtk_sub = rospy.Subscriber(self.rtk_odom_topic, Odometry, self.rtk_callback, queue_size=50)
        self.lidar_sub = rospy.Subscriber(self.lidar_odom_topic, Odometry, self.lidar_callback, queue_size=50)
        self.quality_sub = rospy.Subscriber(self.rtk_quality_topic, UInt8, self.quality_callback, queue_size=20)
        rospy.on_shutdown(self.finalize)

        self.publish_status(
            "collecting map_name=%s output=%s rtk=%s lidar=%s"
            % (self.map_name or "<none>", self.output_path, self.rtk_odom_topic, self.lidar_odom_topic)
        )

    def publish_status(self, text: str) -> None:
        self.status_pub.publish(String(data=text))
        rospy.loginfo("frame alignment: %s", text)

    def publish_error(self, text: str) -> None:
        self.status_pub.publish(String(data="error " + text))
        rospy.logerr("frame alignment: %s", text)

    def quality_callback(self, msg: UInt8) -> None:
        self.last_quality = int(msg.data)

    def rtk_callback(self, msg: Odometry) -> None:
        sample = pose_from_odom(msg, rospy.Time.now())
        if sample is None:
            rospy.logwarn_throttle(5.0, "Skipping RTK odom without a valid orientation")
            return
        self.last_rtk = sample
        self.try_accept_pair()

    def lidar_callback(self, msg: Odometry) -> None:
        sample = pose_from_odom(msg, rospy.Time.now())
        if sample is None:
            rospy.logwarn_throttle(5.0, "Skipping LiDAR odom without a valid orientation")
            return
        self.last_lidar = sample
        self.try_accept_pair()

    def try_accept_pair(self) -> None:
        if self.last_quality != self.min_rtk_quality:
            return
        if self.last_rtk is None or self.last_lidar is None:
            return
        if abs(self.last_rtk.stamp - self.last_lidar.stamp) > self.time_tolerance:
            return

        key = (self.last_rtk.stamp, self.last_lidar.stamp)
        if key == self.last_pair_key:
            return

        if self.pairs:
            previous = self.pairs[-1]
            rtk_step = math.hypot(self.last_rtk.x - previous.rtk.x, self.last_rtk.y - previous.rtk.y)
            lidar_step = math.hypot(self.last_lidar.x - previous.lidar.x, self.last_lidar.y - previous.lidar.y)
            if rtk_step < self.min_sample_distance and lidar_step < self.min_sample_distance:
                return

        self.pairs.append(PosePair(rtk=self.last_rtk, lidar=self.last_lidar))
        self.last_pair_key = key

        if len(self.pairs) == 1 or len(self.pairs) % 10 == 0:
            spread = self.spatial_spread()
            yaw_span = math.degrees(yaw_span_rad([pair.rtk.yaw for pair in self.pairs]))
            self.publish_status("collecting pairs=%d spread=%.2fm yaw_span=%.1fdeg" % (len(self.pairs), spread, yaw_span))

    def spatial_spread(self) -> float:
        if not self.pairs:
            return 0.0
        points = np.array([[pair.rtk.x, pair.rtk.y] for pair in self.pairs], dtype=float)
        span = points.max(axis=0) - points.min(axis=0)
        return float(np.linalg.norm(span))

    def validate_dataset(self) -> Tuple[bool, str, float, float]:
        count = len(self.pairs)
        if count < self.min_pairs:
            return False, "not enough pairs: %d < %d" % (count, self.min_pairs), 0.0, 0.0
        spread = self.spatial_spread()
        if spread < self.min_spatial_spread:
            return False, "spatial spread %.2fm < %.2fm" % (spread, self.min_spatial_spread), spread, 0.0
        span = yaw_span_rad([pair.rtk.yaw for pair in self.pairs])
        if span < self.min_yaw_span:
            return False, "yaw span %.1fdeg < %.1fdeg" % (math.degrees(span), math.degrees(self.min_yaw_span)), spread, span
        return True, "", spread, span

    def finalize(self) -> None:
        if self.finalized:
            return
        self.finalized = True

        ok, reason, spread, span = self.validate_dataset()
        if not ok:
            self.publish_error(reason)
            return

        tx, ty, yaw, rmse, max_error, determinant = solve_transform(self.pairs)
        yaw_errors = [
            angle_diff(pair.rtk.yaw, pair.lidar.yaw + yaw)
            for pair in self.pairs
        ]
        yaw_check = math.sqrt(float(np.mean(np.square(yaw_errors))))

        if determinant < 0.9:
            self.publish_error("invalid rotation determinant %.3f" % determinant)
            return
        if rmse > self.max_rmse:
            self.publish_error("rmse %.3fm > %.3fm" % (rmse, self.max_rmse))
            return
        if yaw_check > self.max_yaw_error:
            self.publish_error("yaw check %.2fdeg > %.2fdeg" % (math.degrees(yaw_check), math.degrees(self.max_yaw_error)))
            return

        payload = {
            "parent_frame": self.parent_frame,
            "child_frame": self.child_frame,
            "coordinate_system": {
                "type": "utm",
                "frame_id": self.parent_frame,
                "source_topic": self.rtk_odom_topic,
                "output_topic": self.output_odom_topic,
            },
            "translation": {
                "x": tx,
                "y": ty,
                "z": 0.0,
            },
            "rotation": {
                "yaw_rad": yaw,
                "yaw_deg": math.degrees(yaw),
            },
            "calibration": {
                "map_name": self.map_name,
                "num_pairs": len(self.pairs),
                "rmse_m": rmse,
                "max_error_m": max_error,
                "spatial_spread_m": spread,
                "yaw_check_error_deg": math.degrees(yaw_check),
                "yaw_span_deg": math.degrees(span),
                "target": "lidar_odometry_to_rtk_utm",
                "rtk_odom_topic": self.rtk_odom_topic,
                "lidar_odom_topic": self.lidar_odom_topic,
                "created_at": datetime.now(timezone.utc).isoformat(),
            },
        }

        self.output_path.parent.mkdir(parents=True, exist_ok=True)
        with self.output_path.open("w", encoding="utf-8") as handle:
            yaml.safe_dump(payload, handle, sort_keys=False)

        self.publish_status(
            "saved output=%s pairs=%d tx=%.3f ty=%.3f yaw=%.3fdeg rmse=%.3fm max=%.3fm yaw_check=%.2fdeg"
            % (
                self.output_path,
                len(self.pairs),
                tx,
                ty,
                math.degrees(yaw),
                rmse,
                max_error,
                math.degrees(yaw_check),
            )
        )


def main() -> None:
    rospy.init_node("calibrate_frame_alignment")
    FrameAlignmentCalibrator()
    rospy.spin()


if __name__ == "__main__":
    main()
