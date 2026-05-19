#!/usr/bin/env python3
"""Gate and weight RTK/LiDAR odometry before robot_localization fusion."""

from __future__ import annotations

import copy
import math
import time
from typing import Optional, Tuple

import rospy
from geometry_msgs.msg import TwistWithCovarianceStamped
from nav_msgs.msg import Odometry
from std_msgs.msg import String, UInt8, UInt16


MODE_OUTDOOR = "outdoor"
MODE_TRANSITION = "transition"
MODE_INDOOR = "indoor"
MODE_DEGRADED = "degraded"


def param(name: str, default):
    return rospy.get_param("~" + name, default)


def quaternion_yaw(q) -> float:
    siny_cosp = 2.0 * (q.w * q.z + q.x * q.y)
    cosy_cosp = 1.0 - 2.0 * (q.y * q.y + q.z * q.z)
    return math.atan2(siny_cosp, cosy_cosp)


def shortest_angular_distance(a: float, b: float) -> float:
    diff = a - b
    while diff > math.pi:
        diff -= 2.0 * math.pi
    while diff < -math.pi:
        diff += 2.0 * math.pi
    return diff


def stamp_key(msg: Odometry) -> Tuple[int, int]:
    return msg.header.stamp.secs, msg.header.stamp.nsecs


def pose_covariance(sigma_xy: float, sigma_z: float, sigma_roll_pitch_deg: float, sigma_yaw_deg: float) -> list[float]:
    cov = [0.0] * 36
    cov[0] = sigma_xy * sigma_xy
    cov[7] = sigma_xy * sigma_xy
    cov[14] = sigma_z * sigma_z
    roll_pitch_var = math.radians(sigma_roll_pitch_deg) ** 2
    yaw_var = math.radians(sigma_yaw_deg) ** 2
    cov[21] = roll_pitch_var
    cov[28] = roll_pitch_var
    cov[35] = yaw_var
    return cov


def conservative_twist_covariance() -> list[float]:
    cov = [0.0] * 36
    for idx in (0, 7, 14, 21, 28, 35):
        cov[idx] = 999.0
    return cov


class LocalizationHealthMonitor:
    def __init__(self) -> None:
        self.rtk_odom_topic = param("topics/rtk_odom", "/odometry/rtk")
        self.lidar_odom_topic = param("topics/lidar_odom", "/odometry/lidar_in_rtk")
        self.fix_quality_topic = param("topics/fix_quality", "/rtk/fix_quality")
        self.satellites_topic = param("topics/satellites", "/rtk/satellites")
        self.heading_topic = param("topics/heading", "/rtk/heading")
        self.rtk_weighted_topic = param("topics/rtk_weighted", "/odometry/rtk_weighted")
        self.lidar_weighted_topic = param("topics/lidar_weighted", "/odometry/lidar_weighted")
        self.mode_topic = param("topics/mode", "/localization/mode")

        self.rate_hz = float(param("rate_hz", 20.0))
        self.rtk_fresh_sec = float(param("timeouts/rtk_fresh_sec", 0.5))
        self.rtk_lost_sec = float(param("timeouts/rtk_lost_sec", 1.0))
        self.lidar_fresh_sec = float(param("timeouts/lidar_fresh_sec", 0.5))
        self.heading_fresh_sec = float(param("timeouts/heading_fresh_sec", 0.5))

        self.fixed_quality_value = int(param("rtk/fixed_quality_value", 4))
        self.bad_quality_max = int(param("rtk/bad_quality_max", 1))
        self.min_satellites = int(param("rtk/min_satellites", 10))
        self.max_valid_rtk_yaw_variance = float(param("rtk/max_valid_yaw_variance", 1.0))

        self.consistency_xy_m = float(param("consistency/xy_m", 0.5))
        self.consistency_yaw_deg = float(param("consistency/yaw_deg", 10.0))
        self.consistency_hold_sec = float(param("consistency/hold_sec", 3.0))
        self.consistency_warn_xy_m = float(param("consistency/warn_xy_m", 2.0))

        self.covariances = {
            MODE_OUTDOOR: {
                "rtk_xy": float(param("covariance/outdoor/rtk_xy", 0.03)),
                "rtk_yaw_deg": float(param("covariance/outdoor/rtk_yaw_deg", 1.0)),
                "lidar_xy": float(param("covariance/outdoor/lidar_xy", 0.5)),
                "lidar_yaw_deg": float(param("covariance/outdoor/lidar_yaw_deg", 3.0)),
            },
            MODE_TRANSITION: {
                "rtk_xy": float(param("covariance/transition/rtk_xy", 0.8)),
                "rtk_yaw_deg": float(param("covariance/transition/rtk_yaw_deg", 5.0)),
                "lidar_xy": float(param("covariance/transition/lidar_xy", 0.2)),
                "lidar_yaw_deg": float(param("covariance/transition/lidar_yaw_deg", 2.0)),
            },
            MODE_INDOOR: {
                "lidar_xy": float(param("covariance/indoor/lidar_xy", 0.1)),
                "lidar_yaw_deg": float(param("covariance/indoor/lidar_yaw_deg", 2.0)),
            },
        }
        self.sigma_z = float(param("covariance/default_z", 5.0))
        self.sigma_roll_pitch_deg = float(param("covariance/default_roll_pitch_deg", 30.0))
        self.invalid_yaw_sigma_deg = float(param("covariance/invalid_yaw_deg", 180.0))

        self.rtk_msg: Optional[Odometry] = None
        self.lidar_msg: Optional[Odometry] = None
        self.heading_msg: Optional[TwistWithCovarianceStamped] = None
        self.rtk_arrival = 0.0
        self.lidar_arrival = 0.0
        self.heading_arrival = 0.0
        self.fix_quality: Optional[int] = None
        self.satellites: Optional[int] = None
        self.mode = MODE_DEGRADED
        self.consistency_since: Optional[float] = None
        self.last_rtk_published: Optional[Tuple[int, int]] = None
        self.last_lidar_published: Optional[Tuple[int, int]] = None

        self.rtk_pub = rospy.Publisher(self.rtk_weighted_topic, Odometry, queue_size=20)
        self.lidar_pub = rospy.Publisher(self.lidar_weighted_topic, Odometry, queue_size=20)
        self.mode_pub = rospy.Publisher(self.mode_topic, String, queue_size=1, latch=True)

        rospy.Subscriber(self.rtk_odom_topic, Odometry, self.rtk_callback, queue_size=20)
        rospy.Subscriber(self.lidar_odom_topic, Odometry, self.lidar_callback, queue_size=20)
        rospy.Subscriber(self.fix_quality_topic, UInt8, self.fix_quality_callback, queue_size=10)
        rospy.Subscriber(self.satellites_topic, UInt16, self.satellites_callback, queue_size=10)
        rospy.Subscriber(self.heading_topic, TwistWithCovarianceStamped, self.heading_callback, queue_size=10)

        self.mode_pub.publish(String(data=self.mode))
        rospy.Timer(rospy.Duration(1.0 / self.rate_hz), self.timer_callback)
        rospy.loginfo(
            "localization health monitor: rtk=%s lidar=%s output=(%s,%s) mode=%s",
            self.rtk_odom_topic,
            self.lidar_odom_topic,
            self.rtk_weighted_topic,
            self.lidar_weighted_topic,
            self.mode_topic,
        )

    def rtk_callback(self, msg: Odometry) -> None:
        self.rtk_msg = msg
        self.rtk_arrival = time.monotonic()

    def lidar_callback(self, msg: Odometry) -> None:
        self.lidar_msg = msg
        self.lidar_arrival = time.monotonic()

    def fix_quality_callback(self, msg: UInt8) -> None:
        self.fix_quality = int(msg.data)

    def satellites_callback(self, msg: UInt16) -> None:
        self.satellites = int(msg.data)

    def heading_callback(self, msg: TwistWithCovarianceStamped) -> None:
        self.heading_msg = msg
        self.heading_arrival = time.monotonic()

    def rtk_yaw_valid(self, now: float) -> bool:
        if self.rtk_msg is None or self.heading_msg is None:
            return False
        if now - self.heading_arrival > self.heading_fresh_sec:
            return False
        try:
            return float(self.rtk_msg.pose.covariance[35]) <= self.max_valid_rtk_yaw_variance
        except (TypeError, ValueError, IndexError):
            return False

    def rtk_lidar_consistent(self, now: float) -> bool:
        if self.rtk_msg is None or self.lidar_msg is None:
            self.consistency_since = None
            return False

        rtk_pos = self.rtk_msg.pose.pose.position
        lidar_pos = self.lidar_msg.pose.pose.position
        dx = float(rtk_pos.x) - float(lidar_pos.x)
        dy = float(rtk_pos.y) - float(lidar_pos.y)
        distance = math.hypot(dx, dy)

        yaw_valid = self.rtk_yaw_valid(now)
        yaw_error_deg: Optional[float] = None
        yaw_consistent = True
        if yaw_valid:
            rtk_yaw = quaternion_yaw(self.rtk_msg.pose.pose.orientation)
            lidar_yaw = quaternion_yaw(self.lidar_msg.pose.pose.orientation)
            yaw_error_deg = abs(math.degrees(shortest_angular_distance(rtk_yaw, lidar_yaw)))
            yaw_consistent = yaw_error_deg <= self.consistency_yaw_deg

        if distance <= self.consistency_xy_m and yaw_consistent:
            if self.consistency_since is None:
                self.consistency_since = now
            return now - self.consistency_since >= self.consistency_hold_sec

        if distance >= self.consistency_warn_xy_m or (yaw_valid and not yaw_consistent):
            yaw_error_text = "n/a" if yaw_error_deg is None else "%.2f" % yaw_error_deg
            rospy.logwarn_throttle(
                5.0,
                "localization consistency gate failed: distance=%.3f yaw_error=%s mode=%s",
                distance,
                yaw_error_text,
                self.mode,
            )
        self.consistency_since = None
        return False

    def evaluate_mode(self, now: float) -> str:
        lidar_fresh = self.lidar_msg is not None and now - self.lidar_arrival <= self.lidar_fresh_sec
        rtk_recent = self.rtk_msg is not None and now - self.rtk_arrival <= self.rtk_lost_sec
        rtk_fresh = self.rtk_msg is not None and now - self.rtk_arrival <= self.rtk_fresh_sec
        quality = self.fix_quality if self.fix_quality is not None else 0
        satellites = self.satellites if self.satellites is not None else 0

        rtk_bad = (not rtk_recent) or quality <= self.bad_quality_max
        if rtk_bad:
            self.consistency_since = None
            return MODE_INDOOR if lidar_fresh else MODE_DEGRADED

        rtk_fixed = quality == self.fixed_quality_value and satellites >= self.min_satellites and rtk_fresh
        if rtk_fixed:
            return MODE_OUTDOOR if lidar_fresh and self.rtk_lidar_consistent(now) else MODE_TRANSITION

        self.consistency_since = None
        return MODE_TRANSITION if (lidar_fresh or rtk_recent) else MODE_DEGRADED

    def set_mode(self, mode: str) -> None:
        if mode == self.mode:
            return
        old_mode = self.mode
        self.mode = mode
        self.mode_pub.publish(String(data=mode))
        rospy.loginfo("localization mode changed: %s -> %s", old_mode, mode)

    def publish_weighted(self, source: str, msg: Odometry, sigma_xy: float, sigma_yaw_deg: float) -> None:
        out = copy.deepcopy(msg)
        out.pose.covariance = pose_covariance(
            sigma_xy,
            self.sigma_z,
            self.sigma_roll_pitch_deg,
            sigma_yaw_deg,
        )
        out.twist.covariance = conservative_twist_covariance()
        if source == "rtk":
            self.rtk_pub.publish(out)
            self.last_rtk_published = stamp_key(msg)
        else:
            self.lidar_pub.publish(out)
            self.last_lidar_published = stamp_key(msg)

    def maybe_publish_rtk(self, now: float) -> None:
        if self.rtk_msg is None or self.mode == MODE_INDOOR or self.mode == MODE_DEGRADED:
            return
        if now - self.rtk_arrival > self.rtk_lost_sec:
            return
        key = stamp_key(self.rtk_msg)
        if key == self.last_rtk_published:
            return
        mode_cov = self.covariances[MODE_OUTDOOR if self.mode == MODE_OUTDOOR else MODE_TRANSITION]
        yaw_sigma = mode_cov["rtk_yaw_deg"] if self.rtk_yaw_valid(now) else self.invalid_yaw_sigma_deg
        self.publish_weighted("rtk", self.rtk_msg, mode_cov["rtk_xy"], yaw_sigma)

    def maybe_publish_lidar(self, now: float) -> None:
        if self.lidar_msg is None or self.mode == MODE_DEGRADED:
            return
        if now - self.lidar_arrival > self.lidar_fresh_sec:
            return
        key = stamp_key(self.lidar_msg)
        if key == self.last_lidar_published:
            return
        mode_key = self.mode if self.mode in self.covariances else MODE_TRANSITION
        mode_cov = self.covariances[mode_key]
        self.publish_weighted("lidar", self.lidar_msg, mode_cov["lidar_xy"], mode_cov["lidar_yaw_deg"])

    def timer_callback(self, _event: rospy.timer.TimerEvent) -> None:
        now = time.monotonic()
        self.set_mode(self.evaluate_mode(now))
        self.maybe_publish_rtk(now)
        self.maybe_publish_lidar(now)


def main() -> None:
    rospy.init_node("localization_health_monitor")
    LocalizationHealthMonitor()
    rospy.spin()


if __name__ == "__main__":
    main()
