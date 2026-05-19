#!/usr/bin/env python3
"""GCP-based RTK <-> LiDAR alignment.

Workflow:
  1. Operator drives the robot to a well-conditioned spot and stops.
  2. Operator triggers ~record_control_point; node accumulates synchronized RTK
     and LiDAR poses for `duration_sec`, then accepts or rejects the point
     based on static / quality criteria.
  3. After >= min_points_to_solve accepted control points, operator triggers
     ~solve_alignment; node runs a weighted joint least-squares solve
     (position + heading) with Gauss-Newton refinement, leave-one-out
     validation, and writes data/maps/<map>/calibration/rtk_lidar.yaml in
     the same schema consumed by publish_frame_alignment.py.

Subscribed topics:
  /odometry/rtk          nav_msgs/Odometry        base_link pose in map (UTM)
  /Odometry              nav_msgs/Odometry        base_link pose in camera_init
  /rtk/fix_quality       std_msgs/UInt8           RTK solution quality flag

Published topics:
  ~status     std_msgs/String  (latched, JSON)    current state + point list
  ~progress   std_msgs/String  (JSON, 5 Hz)       live stats while recording

Services:
  ~record_control_point   rtk_interfaces/RecordControlPoint
  ~solve_alignment        rtk_interfaces/SolveAlignment
  ~manage_control_point   rtk_interfaces/ManageControlPoint
"""

from __future__ import annotations

import json
import math
import os
import threading
import uuid
from collections import deque
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Deque, Dict, List, Optional, Tuple

import numpy as np
import rospy
import yaml
from nav_msgs.msg import Odometry
from std_msgs.msg import String, UInt8

from rtk_interfaces.srv import (
    ManageControlPoint,
    ManageControlPointResponse,
    RecordControlPoint,
    RecordControlPointResponse,
    SolveAlignment,
    SolveAlignmentResponse,
)


# --------------------------------------------------------------------- utils


def find_project_root() -> Path:
    env_root = os.environ.get("RTK_ROOT")
    if env_root:
        return Path(env_root).resolve()
    current = Path(__file__).resolve()
    for parent in [current] + list(current.parents):
        if (parent / "nav" / "launch" / "bringup.launch").exists():
            return parent
    return Path.cwd().resolve()


def string_param(primary: str, fallback: str, default: str = "") -> str:
    value = str(rospy.get_param(primary, "")).strip()
    if value:
        return value
    return str(rospy.get_param(fallback, default)).strip()


def to_yaml_builtin(value: Any) -> Any:
    """Convert numpy/path helper values into types PyYAML safe_dump supports."""
    if isinstance(value, np.generic):
        return value.item()
    if isinstance(value, np.ndarray):
        return [to_yaml_builtin(item) for item in value.tolist()]
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, dict):
        return {to_yaml_builtin(key): to_yaml_builtin(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [to_yaml_builtin(item) for item in value]
    return value


def yaw_from_quaternion(q: Any) -> Optional[float]:
    norm = math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w)
    if norm < 0.5:
        return None
    x = q.x / norm
    y = q.y / norm
    z = q.z / norm
    w = q.w / norm
    siny = 2.0 * (w * z + x * y)
    cosy = 1.0 - 2.0 * (y * y + z * z)
    return math.atan2(siny, cosy)


def wrap_angle(a: float) -> float:
    return math.atan2(math.sin(a), math.cos(a))


def circular_mean(angles: List[float], weights: Optional[List[float]] = None) -> float:
    if not angles:
        return 0.0
    if weights is None:
        s = sum(math.sin(a) for a in angles)
        c = sum(math.cos(a) for a in angles)
    else:
        s = sum(w * math.sin(a) for a, w in zip(angles, weights))
        c = sum(w * math.cos(a) for a, w in zip(angles, weights))
    return math.atan2(s, c)


def circular_std(angles: List[float]) -> float:
    """Mardia's circular standard deviation (radians)."""
    if len(angles) < 2:
        return 0.0
    s = sum(math.sin(a) for a in angles) / len(angles)
    c = sum(math.cos(a) for a in angles) / len(angles)
    r = math.sqrt(s * s + c * c)
    r = min(max(r, 1e-12), 1.0)
    return math.sqrt(-2.0 * math.log(r))


def alignment_path(map_name: str, map_base_path: str, alignment_file: str) -> Path:
    if alignment_file:
        return Path(alignment_file).expanduser().resolve()
    if not map_name:
        raise ValueError("map_name is required when alignment_file is empty")
    base = Path(map_base_path).expanduser().resolve() if map_base_path else find_project_root() / "data" / "maps"
    return base / map_name / "calibration" / "rtk_lidar.yaml"


def persistence_path(map_name: str, map_base_path: str, override: str) -> Path:
    if override:
        return Path(override).expanduser().resolve()
    base = Path(map_base_path).expanduser().resolve() if map_base_path else find_project_root() / "data" / "maps"
    return base / map_name / "calibration" / "gcp_points.json"


def gcp_archive_dir(persistence: Path) -> Path:
    return persistence.parent / "gcp_history"


# ----------------------------------------------------------------- datatypes


@dataclass
class OdomSample:
    stamp: float
    x: float
    y: float
    yaw: float


@dataclass
class ControlPoint:
    id: str
    name: str
    rtk_x: float
    rtk_y: float
    rtk_yaw: float
    lidar_x: float
    lidar_y: float
    lidar_yaw: float
    pos_std_max_m: float
    yaw_std_max_deg: float
    sample_count: int
    duration_sec: float
    recorded_at: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @staticmethod
    def from_dict(data: Dict[str, Any]) -> "ControlPoint":
        return ControlPoint(
            id=str(data.get("id") or ""),
            name=str(data.get("name") or ""),
            rtk_x=float(data.get("rtk_x", 0.0)),
            rtk_y=float(data.get("rtk_y", 0.0)),
            rtk_yaw=float(data.get("rtk_yaw", 0.0)),
            lidar_x=float(data.get("lidar_x", 0.0)),
            lidar_y=float(data.get("lidar_y", 0.0)),
            lidar_yaw=float(data.get("lidar_yaw", 0.0)),
            pos_std_max_m=float(data.get("pos_std_max_m", 0.0)),
            yaw_std_max_deg=float(data.get("yaw_std_max_deg", 0.0)),
            sample_count=int(data.get("sample_count", 0)),
            duration_sec=float(data.get("duration_sec", 0.0)),
            recorded_at=str(data.get("recorded_at") or ""),
        )


@dataclass
class SolveResult:
    success: bool
    reason: str = ""
    tx: float = 0.0
    ty: float = 0.0
    yaw_rad: float = 0.0
    rmse_m: float = 0.0
    max_error_m: float = 0.0
    yaw_rmse_deg: float = 0.0
    yaw_max_deg: float = 0.0
    loo_rmse_m: float = 0.0
    loo_max_m: float = 0.0
    loo_yaw_rmse_deg: float = 0.0
    loo_yaw_max_deg: float = 0.0
    num_points: int = 0
    gn_iterations: int = 0
    spatial_spread_m: float = 0.0
    triangle_area_m2: float = 0.0
    output_path: str = ""
    per_point_residuals: List[Dict[str, float]] = field(default_factory=list)
    per_point_loo: List[Dict[str, float]] = field(default_factory=list)


# --------------------------------------------------------------------- solver


def signed_triangle_area(points: np.ndarray) -> float:
    """Maximum triangle area among any 3 control points (m^2)."""
    n = len(points)
    if n < 3:
        return 0.0
    best = 0.0
    for i in range(n):
        for j in range(i + 1, n):
            for k in range(j + 1, n):
                a = points[i]
                b = points[j]
                c = points[k]
                area = 0.5 * abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]))
                if area > best:
                    best = area
    return float(best)


def spatial_spread(points: np.ndarray) -> float:
    if len(points) < 2:
        return 0.0
    span = points.max(axis=0) - points.min(axis=0)
    return float(math.hypot(span[0], span[1]))


def gauss_newton_refine(
    rtk_xy: np.ndarray,
    rtk_yaw: np.ndarray,
    lid_xy: np.ndarray,
    lid_yaw: np.ndarray,
    w_pos: np.ndarray,
    w_yaw: np.ndarray,
    init_tx: float,
    init_ty: float,
    init_alpha: float,
    max_iter: int,
    eps: float,
) -> Tuple[float, float, float, int]:
    """Gauss-Newton inner loop for joint position+heading weighted LS.

    All inputs are pre-built numpy arrays so the same routine can be called
    from `solve_joint` (with closed-form init) and from unit tests (with
    deliberately perturbed init to stress the iteration).

    Convention (kept consistent across position and heading terms):
      * Position residual r_p = pred - obs (in the RTK frame).
      * Heading residual yaw_res = theta_r - theta_l - alpha (obs - pred).
        Its Jacobian wrt alpha is -1, so the gradient contribution
        +w * yaw_res * j_yaw equals +w * (pred - obs) * d(pred)/d(alpha)
        (the two negatives cancel), matching the position convention.
    """

    tx, ty, alpha = float(init_tx), float(init_ty), float(init_alpha)
    n = rtk_xy.shape[0]
    iterations = 0
    if n < 2:
        return tx, ty, alpha, iterations
    for it in range(max_iter):
        iterations = it + 1
        cos_a, sin_a = math.cos(alpha), math.sin(alpha)
        jtj = np.zeros((3, 3), dtype=float)
        jtr = np.zeros(3, dtype=float)
        for i in range(n):
            lx, ly = lid_xy[i]
            rx_pred = cos_a * lx - sin_a * ly + tx
            ry_pred = sin_a * lx + cos_a * ly + ty
            rx_obs, ry_obs = rtk_xy[i]
            rx_res = rx_pred - rx_obs
            ry_res = ry_pred - ry_obs
            # Position jacobians: d(pred - obs)/d[alpha, tx, ty]
            j_x = np.array([-sin_a * lx - cos_a * ly, 1.0, 0.0])
            j_y = np.array([cos_a * lx - sin_a * ly, 0.0, 1.0])
            wp = w_pos[i]
            jtj += wp * np.outer(j_x, j_x)
            jtj += wp * np.outer(j_y, j_y)
            jtr += wp * (rx_res * j_x + ry_res * j_y)
            # Heading: see docstring above for sign convention.
            yaw_res = wrap_angle(rtk_yaw[i] - lid_yaw[i] - alpha)
            j_yaw = np.array([-1.0, 0.0, 0.0])
            wy = w_yaw[i]
            jtj += wy * np.outer(j_yaw, j_yaw)
            jtr += wy * yaw_res * j_yaw
        try:
            delta = np.linalg.solve(jtj, -jtr)
        except np.linalg.LinAlgError:
            break
        alpha = wrap_angle(alpha + float(delta[0]))
        tx += float(delta[1])
        ty += float(delta[2])
        if float(np.linalg.norm(delta)) < eps:
            break
    return tx, ty, alpha, iterations


def solve_joint(
    points: List[ControlPoint],
    sigma_pos_floor_m: float,
    sigma_yaw_floor_deg: float,
    max_iter: int,
    eps: float,
) -> Tuple[float, float, float, int]:
    """Joint position+heading weighted LS.

    Two stages:
      1. Closed-form init: alpha = weighted circular mean of (theta_r - theta_l)
                            t     = weighted centroid difference
      2. Gauss-Newton refinement, up to `max_iter` iterations.
    """

    n = len(points)
    pos_floor2 = max(sigma_pos_floor_m, 1e-6) ** 2
    yaw_floor = max(math.radians(sigma_yaw_floor_deg), 1e-6)
    yaw_floor2 = yaw_floor * yaw_floor

    rtk_xy = np.array([[p.rtk_x, p.rtk_y] for p in points], dtype=float)
    lid_xy = np.array([[p.lidar_x, p.lidar_y] for p in points], dtype=float)
    rtk_yaw = np.array([p.rtk_yaw for p in points], dtype=float)
    lid_yaw = np.array([p.lidar_yaw for p in points], dtype=float)

    pos_sigma2 = np.array([max(p.pos_std_max_m, sigma_pos_floor_m) ** 2 for p in points])
    yaw_sigma2 = np.array(
        [max(math.radians(p.yaw_std_max_deg), yaw_floor) ** 2 for p in points]
    )
    w_pos = 1.0 / np.maximum(pos_sigma2, pos_floor2)
    w_yaw = 1.0 / np.maximum(yaw_sigma2, yaw_floor2)

    # Stage 1: closed-form init.
    yaw_diffs = [wrap_angle(rtk_yaw[i] - lid_yaw[i]) for i in range(n)]
    alpha = circular_mean(yaw_diffs, weights=w_yaw.tolist())

    sum_w = float(w_pos.sum())
    rtk_centroid = (w_pos[:, None] * rtk_xy).sum(axis=0) / sum_w
    lid_centroid = (w_pos[:, None] * lid_xy).sum(axis=0) / sum_w
    cos_a, sin_a = math.cos(alpha), math.sin(alpha)
    rotated = np.array([
        cos_a * lid_centroid[0] - sin_a * lid_centroid[1],
        sin_a * lid_centroid[0] + cos_a * lid_centroid[1],
    ])
    tx, ty = float(rtk_centroid[0] - rotated[0]), float(rtk_centroid[1] - rotated[1])

    if n < 2:
        return tx, ty, alpha, 0

    return gauss_newton_refine(
        rtk_xy, rtk_yaw, lid_xy, lid_yaw, w_pos, w_yaw,
        tx, ty, alpha, max_iter, eps,
    )


def transform_point(lx: float, ly: float, alpha: float, tx: float, ty: float) -> Tuple[float, float]:
    cos_a, sin_a = math.cos(alpha), math.sin(alpha)
    return cos_a * lx - sin_a * ly + tx, sin_a * lx + cos_a * ly + ty


def evaluate_solution(
    points: List[ControlPoint], tx: float, ty: float, alpha: float
) -> Tuple[float, float, float, float, List[Dict[str, float]]]:
    pos_errs: List[float] = []
    yaw_errs: List[float] = []
    per_point: List[Dict[str, float]] = []
    for p in points:
        rx_pred, ry_pred = transform_point(p.lidar_x, p.lidar_y, alpha, tx, ty)
        pos_err = math.hypot(rx_pred - p.rtk_x, ry_pred - p.rtk_y)
        yaw_err = wrap_angle(p.rtk_yaw - p.lidar_yaw - alpha)
        pos_errs.append(pos_err)
        yaw_errs.append(yaw_err)
        per_point.append({
            "id": p.id,
            "name": p.name,
            "pos_m": pos_err,
            "yaw_deg": math.degrees(yaw_err),
        })
    if not pos_errs:
        return 0.0, 0.0, 0.0, 0.0, per_point
    rmse = float(math.sqrt(np.mean(np.square(pos_errs))))
    max_err = float(max(pos_errs))
    yaw_rmse = float(math.degrees(math.sqrt(np.mean(np.square(yaw_errs)))))
    yaw_max = float(math.degrees(max(abs(y) for y in yaw_errs)))
    return rmse, max_err, yaw_rmse, yaw_max, per_point


def run_leave_one_out(
    points: List[ControlPoint],
    sigma_pos_floor_m: float,
    sigma_yaw_floor_deg: float,
    max_iter: int,
    eps: float,
) -> Tuple[float, float, float, float, List[Dict[str, float]]]:
    if len(points) < 3:
        return 0.0, 0.0, 0.0, 0.0, []
    pos_errs: List[float] = []
    yaw_errs: List[float] = []
    per_point: List[Dict[str, float]] = []
    for i, target in enumerate(points):
        rest = [p for j, p in enumerate(points) if j != i]
        tx, ty, alpha, _ = solve_joint(rest, sigma_pos_floor_m, sigma_yaw_floor_deg, max_iter, eps)
        rx_pred, ry_pred = transform_point(target.lidar_x, target.lidar_y, alpha, tx, ty)
        pos_err = math.hypot(rx_pred - target.rtk_x, ry_pred - target.rtk_y)
        yaw_err = wrap_angle(target.rtk_yaw - target.lidar_yaw - alpha)
        pos_errs.append(pos_err)
        yaw_errs.append(yaw_err)
        per_point.append({
            "id": target.id,
            "name": target.name,
            "pos_m": pos_err,
            "yaw_deg": math.degrees(yaw_err),
        })
    rmse = float(math.sqrt(np.mean(np.square(pos_errs))))
    max_err = float(max(pos_errs))
    yaw_rmse = float(math.degrees(math.sqrt(np.mean(np.square(yaw_errs)))))
    yaw_max = float(math.degrees(max(abs(y) for y in yaw_errs)))
    return rmse, max_err, yaw_rmse, yaw_max, per_point


# ------------------------------------------------------------------- recorder


class ControlPointRecorder:
    def __init__(self) -> None:
        # Resolved paths.
        self.map_name = str(rospy.get_param("~map_name", "")).strip()
        self.map_base_path = string_param("~map_base_path", "~paths/map_base_path")
        self.alignment_file = string_param("~alignment_file", "~paths/alignment_file")
        self.alignment_path = alignment_path(self.map_name, self.map_base_path, self.alignment_file)

        # Topic names.
        self.rtk_odom_topic = rospy.get_param("~topics/rtk_odom", "/odometry/rtk")
        self.lidar_odom_topic = rospy.get_param("~topics/lidar_odom", "/Odometry")
        self.rtk_quality_topic = rospy.get_param("~topics/rtk_quality", "/rtk/fix_quality")

        # Frame names (only used to populate the yaml output).
        self.parent_frame = rospy.get_param("~frames/parent", "map")
        self.child_frame = rospy.get_param("~frames/child", "camera_init")
        self.output_odom_topic = rospy.get_param(
            "~topics/lidar_in_rtk_odom", "/odometry/lidar_in_rtk"
        )

        # GCP parameters.
        g = lambda key, default: rospy.get_param("~gcp/" + key, default)
        self.default_duration = float(g("record_duration_sec", 30.0))
        self.progress_rate = float(g("progress_rate_hz", 5.0))
        self.max_lin_vel = float(g("static_max_linear_velocity", 0.05))
        self.max_ang_vel = float(g("static_max_angular_velocity", 0.05))
        self.max_pos_std = float(g("static_max_pos_std_m", 0.01))
        self.max_yaw_std_deg = float(g("static_max_yaw_std_deg", 0.5))
        self.min_sample_count = int(g("min_sample_count", 240))
        self.require_fixed = bool(g("require_rtk_fixed", True))
        self.min_points = int(g("min_points_to_solve", 3))
        self.min_tri_area = float(g("min_triangle_area_m2", 0.1))
        self.sigma_pos_floor_m = float(g("sigma_pos_floor_m", 0.005))
        self.sigma_yaw_floor_deg = float(g("sigma_yaw_floor_deg", 0.2))
        self.gn_max_iter = int(g("gauss_newton_max_iter", 3))
        self.gn_eps = float(g("gauss_newton_eps", 1.0e-9))
        self.max_solve_rmse = float(g("max_solve_rmse_m", 0.03))
        self.max_solve_yaw_rmse = float(g("max_solve_yaw_rmse_deg", 0.5))
        self.max_loo_rmse = float(g("max_loo_rmse_m", 0.03))
        self.max_loo_yaw_rmse = float(g("max_loo_yaw_rmse_deg", 0.8))
        self.persistence = persistence_path(
            self.map_name, self.map_base_path, str(g("persistence_file", "") or "")
        )

        # Service / topic names (so the launch file can rename them if needed).
        status_topic = rospy.resolve_name("~status")
        progress_topic = rospy.resolve_name("~progress")
        rospy.set_param("~resolved/status_topic", status_topic)
        rospy.set_param("~resolved/progress_topic", progress_topic)

        # Latest samples + ring buffers.
        self.lock = threading.RLock()
        self.latest_rtk: Optional[OdomSample] = None
        self.latest_lidar: Optional[OdomSample] = None
        self.latest_rtk_speed: float = 0.0
        self.latest_lidar_speed: float = 0.0
        self.latest_quality: Optional[int] = None
        self.rtk_window: Deque[OdomSample] = deque()
        self.lidar_window: Deque[OdomSample] = deque()
        # quality_window keeps only the last 5 seconds for snapshotting in
        # progress/status messages; the *acceptance* check uses
        # recording_quality_buffer below, which spans the entire recording.
        self.quality_window: Deque[Tuple[float, int]] = deque()
        self.speed_window: Deque[Tuple[float, float, float]] = deque()  # (stamp, vrtk, vlidar)
        # Recording-only buffer for RTK quality samples. Cleared at record start
        # and grown for the full [record_start, record_end] window so the
        # acceptance check can verify the *entire* duration was RTK fixed.
        self.recording_quality_buffer: List[Tuple[float, int]] = []

        # Recording state.
        self.recording = False
        self.record_start: Optional[float] = None
        self.record_end: Optional[float] = None
        self.record_name: str = ""

        # Persisted control points and last solve result.
        self.points: List[ControlPoint] = []
        self.last_solve: Optional[Dict[str, Any]] = None
        self.load_persistence()

        # Publishers / subscribers / services.
        self.status_pub = rospy.Publisher("~status", String, queue_size=1, latch=True)
        self.progress_pub = rospy.Publisher("~progress", String, queue_size=10)
        self.rtk_sub = rospy.Subscriber(
            self.rtk_odom_topic, Odometry, self._rtk_cb, queue_size=50
        )
        self.lidar_sub = rospy.Subscriber(
            self.lidar_odom_topic, Odometry, self._lidar_cb, queue_size=50
        )
        self.quality_sub = rospy.Subscriber(
            self.rtk_quality_topic, UInt8, self._quality_cb, queue_size=20
        )

        self.record_srv = rospy.Service(
            "~record_control_point", RecordControlPoint, self._handle_record
        )
        self.solve_srv = rospy.Service(
            "~solve_alignment", SolveAlignment, self._handle_solve
        )
        self.manage_srv = rospy.Service(
            "~manage_control_point", ManageControlPoint, self._handle_manage
        )

        self.publish_status()
        rospy.loginfo(
            "control_point_recorder ready map=%s persistence=%s rtk=%s lidar=%s",
            self.map_name or "<none>",
            self.persistence,
            self.rtk_odom_topic,
            self.lidar_odom_topic,
        )

    # ---------------- persistence ----------------

    def load_persistence(self) -> None:
        if not self.persistence.exists():
            return
        try:
            with self.persistence.open("r", encoding="utf-8") as handle:
                data = json.load(handle) or {}
            raw = data.get("points") or []
            loaded: List[ControlPoint] = []
            for item in raw:
                try:
                    loaded.append(ControlPoint.from_dict(item))
                except Exception:
                    rospy.logwarn("Skipping malformed control point: %s", item)
            self.points = loaded
            rospy.loginfo("Restored %d control points from %s", len(loaded), self.persistence)
        except Exception as exc:
            rospy.logwarn("Failed to load persistence %s: %s", self.persistence, exc)

    def save_persistence(self) -> None:
        try:
            self.persistence.parent.mkdir(parents=True, exist_ok=True)
            payload = {
                "map_name": self.map_name,
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "points": [p.to_dict() for p in self.points],
            }
            tmp = self.persistence.with_suffix(self.persistence.suffix + ".tmp")
            with tmp.open("w", encoding="utf-8") as handle:
                json.dump(payload, handle, ensure_ascii=False, indent=2)
            os.replace(tmp, self.persistence)
        except Exception as exc:
            rospy.logerr("Failed to save persistence %s: %s", self.persistence, exc)

    # ---------------- callbacks ----------------

    def _quality_cb(self, msg: UInt8) -> None:
        with self.lock:
            value = int(msg.data)
            self.latest_quality = value
            now = rospy.Time.now().to_sec()
            self.quality_window.append((now, value))
            self._trim_quality(now)
            if self.recording:
                self.recording_quality_buffer.append((now, value))

    def _rtk_cb(self, msg: Odometry) -> None:
        sample = self._odom_to_sample(msg)
        if sample is None:
            return
        with self.lock:
            self.latest_rtk = sample
            speed = math.hypot(msg.twist.twist.linear.x, msg.twist.twist.linear.y)
            self.latest_rtk_speed = speed
            if self.recording:
                self.rtk_window.append(sample)
                self.speed_window.append((sample.stamp, speed, self.latest_lidar_speed))

    def _lidar_cb(self, msg: Odometry) -> None:
        sample = self._odom_to_sample(msg)
        if sample is None:
            return
        with self.lock:
            self.latest_lidar = sample
            speed = math.hypot(msg.twist.twist.linear.x, msg.twist.twist.linear.y)
            self.latest_lidar_speed = speed
            if self.recording:
                self.lidar_window.append(sample)

    @staticmethod
    def _odom_to_sample(msg: Odometry) -> Optional[OdomSample]:
        stamp = msg.header.stamp
        if stamp == rospy.Time(0):
            stamp = rospy.Time.now()
        yaw = yaw_from_quaternion(msg.pose.pose.orientation)
        if yaw is None:
            return None
        return OdomSample(
            stamp=stamp.to_sec(),
            x=float(msg.pose.pose.position.x),
            y=float(msg.pose.pose.position.y),
            yaw=yaw,
        )

    def _trim_quality(self, now: float, ttl: float = 5.0) -> None:
        cutoff = now - ttl
        while self.quality_window and self.quality_window[0][0] < cutoff:
            self.quality_window.popleft()

    # ---------------- services ----------------

    def _handle_record(self, req: RecordControlPoint) -> RecordControlPointResponse:
        with self.lock:
            if self.recording:
                return RecordControlPointResponse(
                    accepted=False, reason="recorder is already recording a point",
                )
            duration = float(req.duration_sec) if req.duration_sec and req.duration_sec > 0.0 else self.default_duration
            if duration < 1.0:
                return RecordControlPointResponse(accepted=False, reason="duration_sec too small")
            if self.latest_rtk is None or self.latest_lidar is None:
                return RecordControlPointResponse(
                    accepted=False, reason="waiting for /odometry/rtk and /Odometry to publish",
                )
            self.recording = True
            self.record_start = rospy.Time.now().to_sec()
            self.record_end = self.record_start + duration
            self.record_name = (req.name or "").strip()
            self.rtk_window.clear()
            self.lidar_window.clear()
            self.speed_window.clear()
            self.recording_quality_buffer = []
            # Seed the recording quality buffer with the latest known quality
            # value so a missing /rtk/fix_quality publish at exactly t=record_start
            # does not fool the gap check.
            if self.latest_quality is not None:
                self.recording_quality_buffer.append((self.record_start, self.latest_quality))
            rospy.loginfo("Recording control point '%s' for %.1fs", self.record_name or "<auto>", duration)
            self.publish_status()

        rate = rospy.Rate(max(self.progress_rate, 1.0))
        try:
            while not rospy.is_shutdown():
                with self.lock:
                    now = rospy.Time.now().to_sec()
                    if self.record_end is None or now >= self.record_end:
                        break
                    progress = self._snapshot_progress(now)
                    duration_active = duration
                self.progress_pub.publish(String(data=json.dumps(progress, ensure_ascii=False)))
                rate.sleep()
        except rospy.ROSInterruptException:
            pass

        with self.lock:
            rtk_samples = list(self.rtk_window)
            lidar_samples = list(self.lidar_window)
            speed_samples = list(self.speed_window)
            recording_quality = list(self.recording_quality_buffer)
            record_start_active = self.record_start
            record_end_active = rospy.Time.now().to_sec()
            duration_active = duration
            self.recording = False
            self.record_start = None
            self.record_end = None
            self.recording_quality_buffer = []
            name = self.record_name or ("cp_%d" % (len(self.points) + 1))
            self.record_name = ""

        accepted, reason, point = self._evaluate_recording(
            rtk_samples,
            lidar_samples,
            speed_samples,
            recording_quality,
            record_start_active,
            record_end_active,
            duration_active,
            name,
        )

        if accepted and point is not None:
            with self.lock:
                self.points.append(point)
                self.save_persistence()
                self.publish_status()
            return RecordControlPointResponse(
                accepted=True,
                reason="",
                point_id=point.id,
                rtk_x=point.rtk_x,
                rtk_y=point.rtk_y,
                rtk_yaw_rad=point.rtk_yaw,
                lidar_x=point.lidar_x,
                lidar_y=point.lidar_y,
                lidar_yaw_rad=point.lidar_yaw,
                pos_std_max_m=point.pos_std_max_m,
                yaw_std_max_deg=point.yaw_std_max_deg,
                sample_count=point.sample_count,
            )

        with self.lock:
            self.publish_status()
        return RecordControlPointResponse(accepted=False, reason=reason)

    def _handle_solve(self, req: SolveAlignment) -> SolveAlignmentResponse:
        with self.lock:
            if self.recording:
                return SolveAlignmentResponse(success=False, reason="recording in progress, try again later")
            points = list(self.points)
            override_map = (req.map_name or "").strip()
            map_for_output = override_map or self.map_name
        if not map_for_output:
            return SolveAlignmentResponse(
                success=False, reason="map_name is empty; pass map_name in service request or launch parameter",
            )
        if len(points) < self.min_points:
            return SolveAlignmentResponse(
                success=False, reason=f"need at least {self.min_points} control points, have {len(points)}",
            )
        rtk_xy = np.array([[p.rtk_x, p.rtk_y] for p in points], dtype=float)
        spread = spatial_spread(rtk_xy)
        tri_area = signed_triangle_area(rtk_xy)
        if tri_area < self.min_tri_area:
            return SolveAlignmentResponse(
                success=False,
                reason=f"triangle area {tri_area:.3f} m^2 < {self.min_tri_area:.3f} m^2 (points are nearly collinear)",
            )

        try:
            tx, ty, alpha, iters = solve_joint(
                points, self.sigma_pos_floor_m, self.sigma_yaw_floor_deg, self.gn_max_iter, self.gn_eps
            )
            rmse, max_err, yaw_rmse_deg, yaw_max_deg, residuals = evaluate_solution(points, tx, ty, alpha)
            loo_rmse, loo_max, loo_yaw_rmse, loo_yaw_max, loo_per_point = run_leave_one_out(
                points, self.sigma_pos_floor_m, self.sigma_yaw_floor_deg, self.gn_max_iter, self.gn_eps
            )
        except Exception as exc:
            rospy.logerr("Solve failed: %s", exc)
            return SolveAlignmentResponse(success=False, reason=f"solver error: {exc}")

        warnings: List[str] = []
        if rmse > self.max_solve_rmse:
            warnings.append(f"position rmse {rmse*100:.2f}cm exceeds {self.max_solve_rmse*100:.2f}cm threshold")
        if yaw_rmse_deg > self.max_solve_yaw_rmse:
            warnings.append(f"yaw rmse {yaw_rmse_deg:.2f}deg exceeds {self.max_solve_yaw_rmse:.2f}deg threshold")
        if loo_rmse > self.max_loo_rmse:
            warnings.append(f"loo position rmse {loo_rmse*100:.2f}cm exceeds {self.max_loo_rmse*100:.2f}cm threshold")
        if loo_yaw_rmse > self.max_loo_yaw_rmse:
            warnings.append(f"loo yaw rmse {loo_yaw_rmse:.2f}deg exceeds {self.max_loo_yaw_rmse:.2f}deg threshold")

        try:
            output_file = self._write_alignment_yaml(
                map_name=map_for_output,
                points=points,
                tx=tx,
                ty=ty,
                alpha=alpha,
                rmse=rmse,
                max_err=max_err,
                yaw_rmse_deg=yaw_rmse_deg,
                yaw_max_deg=yaw_max_deg,
                loo_rmse=loo_rmse,
                loo_max=loo_max,
                loo_yaw_rmse=loo_yaw_rmse,
                loo_yaw_max=loo_yaw_max,
                iters=iters,
                spread=spread,
                tri_area=tri_area,
                residuals=residuals,
                loo_per_point=loo_per_point,
            )
        except Exception as exc:
            rospy.logerr("Failed to write alignment yaml: %s", exc)
            return SolveAlignmentResponse(success=False, reason=f"write failed: {exc}")

        with self.lock:
            self.last_solve = {
                "tx": tx,
                "ty": ty,
                "yaw_rad": alpha,
                "yaw_deg": math.degrees(alpha),
                "rmse_m": rmse,
                "max_error_m": max_err,
                "yaw_rmse_deg": yaw_rmse_deg,
                "yaw_max_deg": yaw_max_deg,
                "loo_rmse_m": loo_rmse,
                "loo_max_m": loo_max,
                "loo_yaw_rmse_deg": loo_yaw_rmse,
                "loo_yaw_max_deg": loo_yaw_max,
                "num_points": len(points),
                "gn_iterations": iters,
                "triangle_area_m2": tri_area,
                "spatial_spread_m": spread,
                "output_path": str(output_file),
                "warnings": warnings,
                "per_point_residuals": residuals,
                "per_point_loo": loo_per_point,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            self.publish_status()

        return SolveAlignmentResponse(
            success=True,
            reason="; ".join(warnings),
            tx=tx,
            ty=ty,
            yaw_rad=alpha,
            rmse_m=rmse,
            max_error_m=max_err,
            yaw_rmse_deg=yaw_rmse_deg,
            yaw_max_deg=yaw_max_deg,
            loo_rmse_m=loo_rmse,
            loo_max_m=loo_max,
            loo_yaw_rmse_deg=loo_yaw_rmse,
            loo_yaw_max_deg=loo_yaw_max,
            num_points=len(points),
            gauss_newton_iterations=iters,
            output_path=str(output_file),
        )

    def _handle_manage(self, req: ManageControlPoint) -> ManageControlPointResponse:
        action = (req.action or "").strip().lower()
        point_id = (req.point_id or "").strip()
        with self.lock:
            if action == "clear":
                count_before = len(self.points)
                self.points.clear()
                self.save_persistence()
                self.publish_status()
                return ManageControlPointResponse(
                    success=True,
                    reason=f"cleared {count_before} control points",
                    remaining_count=0,
                )
            if action == "delete":
                if not point_id:
                    return ManageControlPointResponse(
                        success=False, reason="point_id is required for delete", remaining_count=len(self.points),
                    )
                before = len(self.points)
                self.points = [p for p in self.points if p.id != point_id]
                if len(self.points) == before:
                    return ManageControlPointResponse(
                        success=False, reason=f"no point with id={point_id}", remaining_count=before,
                    )
                self.save_persistence()
                self.publish_status()
                return ManageControlPointResponse(
                    success=True, reason="deleted", remaining_count=len(self.points),
                )
        return ManageControlPointResponse(
            success=False, reason=f"unknown action: {action}", remaining_count=len(self.points),
        )

    # ---------------- status / progress ----------------

    def _snapshot_progress(self, now: float) -> Dict[str, Any]:
        rtk_samples = list(self.rtk_window)
        lidar_samples = list(self.lidar_window)
        rtk_speed = self.latest_rtk_speed
        lidar_speed = self.latest_lidar_speed
        quality = self.latest_quality

        elapsed = 0.0 if self.record_start is None else max(now - self.record_start, 0.0)
        duration = self.default_duration if self.record_end is None or self.record_start is None else (self.record_end - self.record_start)

        pos_std, yaw_std_deg = self._compute_running_std(rtk_samples)
        l_pos_std, l_yaw_std_deg = self._compute_running_std(lidar_samples)

        return {
            "state": "recording",
            "elapsed_sec": elapsed,
            "duration_sec": duration,
            "remaining_sec": max(duration - elapsed, 0.0),
            "rtk_sample_count": len(rtk_samples),
            "lidar_sample_count": len(lidar_samples),
            "rtk_pos_std_m": pos_std,
            "rtk_yaw_std_deg": yaw_std_deg,
            "lidar_pos_std_m": l_pos_std,
            "lidar_yaw_std_deg": l_yaw_std_deg,
            "rtk_speed_mps": rtk_speed,
            "lidar_speed_mps": lidar_speed,
            "rtk_quality": quality,
            "name": self.record_name,
        }

    def _check_quality_coverage(
        self,
        recording_quality: List[Tuple[float, int]],
        record_start: Optional[float],
        record_end: Optional[float],
        duration: float,
    ) -> Tuple[bool, str]:
        """Validate that RTK quality stayed at 4 (fixed) for the entire recording.

        Three failure modes are caught:
          1. No samples at all → /rtk/fix_quality might not be publishing.
          2. Any sample != 4 → RTK lost fix at some point during the window.
          3. Coverage gap → samples cluster only at the start/end (e.g. topic
             stalled mid-recording, or lock recovered just at the end).
        """
        if not recording_quality:
            return False, "no RTK quality samples received during the recording window"
        bad = [q for _, q in recording_quality if q != 4]
        if bad:
            return False, f"RTK quality dropped below 4 ({len(bad)} bad readings during recording)"
        if record_start is None or record_end is None or duration <= 0.0:
            # Without a known window we cannot run the gap check; the all-fixed
            # check above is still meaningful.
            return True, ""
        stamps = [t for t, _ in recording_quality]
        first_stamp = min(stamps)
        last_stamp = max(stamps)
        # Require samples to span at least 80% of the recording window.
        if (last_stamp - first_stamp) < 0.8 * duration:
            return False, (
                f"RTK quality samples only span {last_stamp - first_stamp:.1f}s "
                f"of {duration:.1f}s recording (topic likely stalled)"
            )
        # Require the first sample close to record_start and last close to record_end.
        edge_tol = max(0.2 * duration, 1.0)
        if first_stamp - record_start > edge_tol:
            return False, (
                f"first RTK quality sample {first_stamp - record_start:.1f}s after "
                f"record start (topic late)"
            )
        if record_end - last_stamp > edge_tol:
            return False, (
                f"last RTK quality sample {record_end - last_stamp:.1f}s before "
                f"record end (topic stalled)"
            )
        # Detect long internal gaps (e.g. 25s of float-then-fixed where the
        # float samples were dropped because publisher rate dropped).
        max_gap = 0.0
        prev = stamps[0]
        for t in stamps[1:]:
            gap = t - prev
            if gap > max_gap:
                max_gap = gap
            prev = t
        gap_limit = max(2.0, 0.2 * duration)
        if max_gap > gap_limit:
            return False, (
                f"RTK quality stream has a {max_gap:.1f}s gap (> {gap_limit:.1f}s); "
                "cannot guarantee fixed status throughout"
            )
        return True, ""

    @staticmethod
    def _compute_running_std(samples: List[OdomSample]) -> Tuple[float, float]:
        if len(samples) < 2:
            return 0.0, 0.0
        xs = [s.x for s in samples]
        ys = [s.y for s in samples]
        yaws = [s.yaw for s in samples]
        pos_std = float(math.sqrt(np.var(xs) + np.var(ys)))
        yaw_std_deg = float(math.degrees(circular_std(yaws)))
        return pos_std, yaw_std_deg

    def _evaluate_recording(
        self,
        rtk_samples: List[OdomSample],
        lidar_samples: List[OdomSample],
        speed_samples: List[Tuple[float, float, float]],
        recording_quality: List[Tuple[float, int]],
        record_start: Optional[float],
        record_end: Optional[float],
        duration: float,
        name: str,
    ) -> Tuple[bool, str, Optional[ControlPoint]]:
        if len(rtk_samples) < self.min_sample_count:
            return False, f"only {len(rtk_samples)} RTK samples (< {self.min_sample_count})", None
        if len(lidar_samples) < self.min_sample_count // 2:
            return False, f"only {len(lidar_samples)} LiDAR samples", None

        if self.require_fixed:
            ok, reason = self._check_quality_coverage(
                recording_quality, record_start, record_end, duration
            )
            if not ok:
                return False, reason, None

        if speed_samples:
            max_rtk_speed = max(v for _, v, _ in speed_samples)
            max_lidar_speed = max(v for _, _, v in speed_samples)
            if max_rtk_speed > self.max_lin_vel:
                return False, f"RTK speed {max_rtk_speed:.3f} m/s > {self.max_lin_vel:.3f} m/s", None
            if max_lidar_speed > self.max_lin_vel:
                return False, f"LiDAR speed {max_lidar_speed:.3f} m/s > {self.max_lin_vel:.3f} m/s", None

        rtk_pos_std, rtk_yaw_std_deg = self._compute_running_std(rtk_samples)
        lidar_pos_std, lidar_yaw_std_deg = self._compute_running_std(lidar_samples)
        pos_std_max = max(rtk_pos_std, lidar_pos_std)
        yaw_std_max = max(rtk_yaw_std_deg, lidar_yaw_std_deg)
        if rtk_pos_std > self.max_pos_std:
            return False, f"RTK position std {rtk_pos_std*1000:.1f}mm > {self.max_pos_std*1000:.1f}mm", None
        if lidar_pos_std > self.max_pos_std * 2.0:
            return False, f"LiDAR position std {lidar_pos_std*1000:.1f}mm > {self.max_pos_std*2.0*1000:.1f}mm", None
        if rtk_yaw_std_deg > self.max_yaw_std_deg:
            return False, f"RTK yaw std {rtk_yaw_std_deg:.2f}deg > {self.max_yaw_std_deg:.2f}deg", None
        if lidar_yaw_std_deg > self.max_yaw_std_deg * 2.0:
            return False, f"LiDAR yaw std {lidar_yaw_std_deg:.2f}deg > {self.max_yaw_std_deg*2.0:.2f}deg", None

        rtk_xy = (float(np.mean([s.x for s in rtk_samples])), float(np.mean([s.y for s in rtk_samples])))
        rtk_yaw = circular_mean([s.yaw for s in rtk_samples])
        lid_xy = (float(np.mean([s.x for s in lidar_samples])), float(np.mean([s.y for s in lidar_samples])))
        lid_yaw = circular_mean([s.yaw for s in lidar_samples])

        point = ControlPoint(
            id=f"cp_{uuid.uuid4().hex[:8]}",
            name=name,
            rtk_x=rtk_xy[0],
            rtk_y=rtk_xy[1],
            rtk_yaw=rtk_yaw,
            lidar_x=lid_xy[0],
            lidar_y=lid_xy[1],
            lidar_yaw=lid_yaw,
            pos_std_max_m=pos_std_max,
            yaw_std_max_deg=yaw_std_max,
            sample_count=len(rtk_samples),
            duration_sec=duration,
            recorded_at=datetime.now(timezone.utc).isoformat(),
        )
        return True, "", point

    def publish_status(self) -> None:
        payload = {
            "state": "recording" if self.recording else "idle",
            "map_name": self.map_name,
            "persistence_file": str(self.persistence),
            "alignment_file": str(self.alignment_path),
            "min_points_to_solve": self.min_points,
            "control_points": [self._point_to_dict(p) for p in self.points],
            "config": {
                "record_duration_sec": self.default_duration,
                "max_pos_std_m": self.max_pos_std,
                "max_yaw_std_deg": self.max_yaw_std_deg,
                "max_solve_rmse_m": self.max_solve_rmse,
                "max_solve_yaw_rmse_deg": self.max_solve_yaw_rmse,
                "max_loo_rmse_m": self.max_loo_rmse,
                "max_loo_yaw_rmse_deg": self.max_loo_yaw_rmse,
            },
            "last_solve": self.last_solve,
        }
        self.status_pub.publish(String(data=json.dumps(payload, ensure_ascii=False)))

    @staticmethod
    def _point_to_dict(p: ControlPoint) -> Dict[str, Any]:
        return {
            "id": p.id,
            "name": p.name,
            "rtk": {"x": p.rtk_x, "y": p.rtk_y, "yaw_rad": p.rtk_yaw, "yaw_deg": math.degrees(p.rtk_yaw)},
            "lidar": {"x": p.lidar_x, "y": p.lidar_y, "yaw_rad": p.lidar_yaw, "yaw_deg": math.degrees(p.lidar_yaw)},
            "std": {"pos_m": p.pos_std_max_m, "yaw_deg": p.yaw_std_max_deg},
            "sample_count": p.sample_count,
            "duration_sec": p.duration_sec,
            "recorded_at": p.recorded_at,
        }

    # ---------------- yaml writer ----------------

    def _write_alignment_yaml(
        self,
        map_name: str,
        points: List[ControlPoint],
        tx: float,
        ty: float,
        alpha: float,
        rmse: float,
        max_err: float,
        yaw_rmse_deg: float,
        yaw_max_deg: float,
        loo_rmse: float,
        loo_max: float,
        loo_yaw_rmse: float,
        loo_yaw_max: float,
        iters: int,
        spread: float,
        tri_area: float,
        residuals: List[Dict[str, float]],
        loo_per_point: List[Dict[str, float]],
    ) -> Path:
        output_path = alignment_path(map_name, self.map_base_path, self.alignment_file)
        residual_by_id = {item["id"]: item for item in residuals}
        loo_by_id = {item["id"]: item for item in loo_per_point}

        payload = {
            "parent_frame": self.parent_frame,
            "child_frame": self.child_frame,
            "coordinate_system": {
                "type": "utm",
                "frame_id": self.parent_frame,
                "source_topic": self.rtk_odom_topic,
                "output_topic": self.output_odom_topic,
            },
            "translation": {"x": tx, "y": ty, "z": 0.0},
            "rotation": {"yaw_rad": alpha, "yaw_deg": math.degrees(alpha)},
            "calibration": {
                "method": "gcp_static_joint",
                "map_name": map_name,
                "num_pairs": len(points),
                "num_points": len(points),
                "rmse_m": rmse,
                "max_error_m": max_err,
                "yaw_rmse_deg": yaw_rmse_deg,
                "yaw_max_deg": yaw_max_deg,
                "loo_rmse_m": loo_rmse,
                "loo_max_m": loo_max,
                "loo_yaw_rmse_deg": loo_yaw_rmse,
                "loo_yaw_max_deg": loo_yaw_max,
                "yaw_check_error_deg": yaw_rmse_deg,
                "gauss_newton_iterations": iters,
                "spatial_spread_m": spread,
                "triangle_area_m2": tri_area,
                "target": "lidar_odometry_to_rtk_utm",
                "rtk_odom_topic": self.rtk_odom_topic,
                "lidar_odom_topic": self.lidar_odom_topic,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "control_points": [
                    {
                        "id": p.id,
                        "name": p.name,
                        "rtk": {"x": p.rtk_x, "y": p.rtk_y, "yaw_rad": p.rtk_yaw},
                        "lidar": {"x": p.lidar_x, "y": p.lidar_y, "yaw_rad": p.lidar_yaw},
                        "std": {"pos_m": p.pos_std_max_m, "yaw_deg": p.yaw_std_max_deg},
                        "sample_count": p.sample_count,
                        "duration_sec": p.duration_sec,
                        "recorded_at": p.recorded_at,
                        "residual": {
                            "pos_m": residual_by_id.get(p.id, {}).get("pos_m", 0.0),
                            "yaw_deg": residual_by_id.get(p.id, {}).get("yaw_deg", 0.0),
                        },
                        "loo": {
                            "pos_m": loo_by_id.get(p.id, {}).get("pos_m", 0.0),
                            "yaw_deg": loo_by_id.get(p.id, {}).get("yaw_deg", 0.0),
                        },
                    }
                    for p in points
                ],
            },
        }
        payload = to_yaml_builtin(payload)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with output_path.open("w", encoding="utf-8") as handle:
            yaml.safe_dump(payload, handle, sort_keys=False, allow_unicode=True)

        archive_dir = gcp_archive_dir(self.persistence)
        archive_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        archive_path = archive_dir / f"rtk_lidar_{stamp}.yaml"
        with archive_path.open("w", encoding="utf-8") as handle:
            yaml.safe_dump(payload, handle, sort_keys=False, allow_unicode=True)

        rospy.loginfo("Wrote alignment yaml: %s (archive: %s)", output_path, archive_path)
        return output_path


def main() -> None:
    rospy.init_node("control_point_recorder")
    try:
        ControlPointRecorder()
    except Exception as exc:
        rospy.logfatal("control_point_recorder startup failed: %s", exc)
        raise SystemExit(1)
    rospy.spin()


if __name__ == "__main__":
    main()
