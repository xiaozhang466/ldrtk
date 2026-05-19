#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Synthetic-data unit tests for the GCP joint LS solver.

These tests run *without* ROS — they import `control_point_recorder.py`
through a stub for `rospy`, `std_msgs`, etc. They focus on the math:

  1. test_perfect_data           : zero-noise sanity check.
  2. test_yaw_sign_pure_rotation : pure rotation around the LiDAR centroid;
                                    the position term carries no information
                                    about alpha, so GN MUST drive convergence
                                    via the yaw term alone. A wrong sign on
                                    the yaw gradient diverges this case.
  3. test_gn_corrects_perturbed_init : perturb the initial guess and confirm
                                        Gauss-Newton drives it back. Catches
                                        sign / scale errors in the gradient.
  4. test_finite_difference_gradient : numerical gradient vs. analytical
                                        contributions accumulated by GN.

Run directly: `python3 nav/src/nav_fusion/test/test_solver.py`
"""

from __future__ import annotations

import importlib.util
import math
import os
import sys
import types
from pathlib import Path

import numpy as np
import yaml


# ---------------------------------------------------------------------------
# Stub the ROS modules so we can import control_point_recorder.py headlessly.
# ---------------------------------------------------------------------------

def _install_ros_stubs() -> None:
    rospy = types.ModuleType("rospy")
    rospy.Time = type("Time", (), {"now": staticmethod(lambda: 0)})
    rospy.Publisher = lambda *a, **k: types.SimpleNamespace(publish=lambda *a, **k: None)
    rospy.Subscriber = lambda *a, **k: None
    rospy.Service = lambda *a, **k: None
    rospy.loginfo = rospy.logwarn = rospy.logerr = lambda *a, **k: None
    rospy.is_shutdown = lambda: False
    rospy.get_param = lambda key, default=None: default
    rospy.Rate = lambda hz: types.SimpleNamespace(sleep=lambda: None)
    rospy.ROSInterruptException = Exception
    rospy.ServiceException = Exception
    rospy.spin = lambda: None
    sys.modules.setdefault("rospy", rospy)

    std_msgs = types.ModuleType("std_msgs")
    std_msgs_msg = types.ModuleType("std_msgs.msg")
    std_msgs_msg.String = type("String", (), {"__init__": lambda self, data="": setattr(self, "data", data)})
    std_msgs_msg.UInt8 = type("UInt8", (), {"__init__": lambda self, data=0: setattr(self, "data", data)})
    std_msgs.msg = std_msgs_msg
    sys.modules.setdefault("std_msgs", std_msgs)
    sys.modules.setdefault("std_msgs.msg", std_msgs_msg)

    nav_msgs = types.ModuleType("nav_msgs")
    nav_msgs_msg = types.ModuleType("nav_msgs.msg")
    nav_msgs_msg.Odometry = type("Odometry", (), {})
    nav_msgs.msg = nav_msgs_msg
    sys.modules.setdefault("nav_msgs", nav_msgs)
    sys.modules.setdefault("nav_msgs.msg", nav_msgs_msg)

    geom = types.ModuleType("geometry_msgs")
    geom_msg = types.ModuleType("geometry_msgs.msg")
    geom_msg.PoseStamped = type("PoseStamped", (), {})
    geom_msg.TransformStamped = type("TransformStamped", (), {})
    geom.msg = geom_msg
    sys.modules.setdefault("geometry_msgs", geom)
    sys.modules.setdefault("geometry_msgs.msg", geom_msg)

    tf2 = types.ModuleType("tf2_ros")
    tf2.TransformBroadcaster = lambda *a, **k: None
    sys.modules.setdefault("tf2_ros", tf2)

    rtk = types.ModuleType("rtk_interfaces")
    rtk_srv = types.ModuleType("rtk_interfaces.srv")
    for name in (
        "RecordControlPoint",
        "RecordControlPointResponse",
        "SolveAlignment",
        "SolveAlignmentResponse",
        "ManageControlPoint",
        "ManageControlPointResponse",
    ):
        setattr(rtk_srv, name, type(name, (), {}))
    rtk.srv = rtk_srv
    sys.modules.setdefault("rtk_interfaces", rtk)
    sys.modules.setdefault("rtk_interfaces.srv", rtk_srv)


_install_ros_stubs()


def _load_recorder():
    repo_root = Path(__file__).resolve().parents[4]
    src = repo_root / "nav/src/nav_fusion/scripts/control_point_recorder.py"
    spec = importlib.util.spec_from_file_location("cpr", src)
    cpr = importlib.util.module_from_spec(spec)
    sys.modules["cpr"] = cpr
    spec.loader.exec_module(cpr)
    return cpr


cpr = _load_recorder()


# ---------------------------------------------------------------------------
# Helpers.
# ---------------------------------------------------------------------------

def make_arrays(rtk_xy, rtk_yaw, lid_xy, lid_yaw, sigma_pos_m=0.02, sigma_yaw_deg=1.0):
    rtk_xy = np.asarray(rtk_xy, dtype=float)
    lid_xy = np.asarray(lid_xy, dtype=float)
    rtk_yaw = np.asarray(rtk_yaw, dtype=float)
    lid_yaw = np.asarray(lid_yaw, dtype=float)
    n = rtk_xy.shape[0]
    sigma_pos2 = np.full(n, sigma_pos_m * sigma_pos_m)
    sigma_yaw2 = np.full(n, math.radians(sigma_yaw_deg) ** 2)
    w_pos = 1.0 / sigma_pos2
    w_yaw = 1.0 / sigma_yaw2
    return rtk_xy, rtk_yaw, lid_xy, lid_yaw, w_pos, w_yaw


def transform(points_xy, alpha, tx, ty):
    c, s = math.cos(alpha), math.sin(alpha)
    out = np.zeros_like(points_xy)
    out[:, 0] = c * points_xy[:, 0] - s * points_xy[:, 1] + tx
    out[:, 1] = s * points_xy[:, 0] + c * points_xy[:, 1] + ty
    return out


def assert_close(label, got, want, tol):
    err = abs(cpr.wrap_angle(got - want)) if "yaw" in label or "alpha" in label else abs(got - want)
    if err > tol:
        raise AssertionError(f"{label}: got {got!r}, want {want!r}, err={err:.3e} > tol {tol:.3e}")
    print(f"  {label}: OK  (err={err:.3e})")


# ---------------------------------------------------------------------------
# Tests.
# ---------------------------------------------------------------------------

def test_perfect_data():
    print("[test_perfect_data]")
    gt_alpha = math.radians(37.0)
    gt_tx, gt_ty = 12.5, -3.7
    lid_xy = np.array([[0.0, 0.0], [10.0, 0.0], [0.0, 10.0], [-5.0, 5.0]])
    rtk_xy = transform(lid_xy, gt_alpha, gt_tx, gt_ty)
    body_yaw = np.array([0.1, -0.4, 0.8, 1.2])
    lid_yaw = body_yaw
    rtk_yaw = body_yaw + gt_alpha

    rtk_xy_a, rtk_yaw_a, lid_xy_a, lid_yaw_a, w_pos, w_yaw = make_arrays(
        rtk_xy, rtk_yaw, lid_xy, lid_yaw
    )
    tx, ty, alpha, iters = cpr.gauss_newton_refine(
        rtk_xy_a, rtk_yaw_a, lid_xy_a, lid_yaw_a, w_pos, w_yaw,
        gt_tx, gt_ty, gt_alpha, max_iter=10, eps=1e-12,
    )
    assert_close("alpha", alpha, gt_alpha, 1e-9)
    assert_close("tx", tx, gt_tx, 1e-9)
    assert_close("ty", ty, gt_ty, 1e-9)
    print(f"  iterations={iters}")


def test_yaw_sign_pure_rotation():
    """Three control points all collected at the LiDAR origin (e.g. the
    robot rotated in place at the same spot). The position term gives the
    same equation 3x: tx,ty determined by translation only — alpha is
    completely unobservable from position. Only the yaw term constrains
    alpha, so a wrong sign on the yaw gradient diverges.
    """
    print("[test_yaw_sign_pure_rotation]")
    gt_alpha = math.radians(20.0)
    gt_tx, gt_ty = 1.0, 2.0
    n = 3
    lid_xy = np.zeros((n, 2))                # all at LiDAR origin
    rtk_xy = np.tile([gt_tx, gt_ty], (n, 1))  # all rotate to (tx, ty)
    body_yaw = np.array([0.0, 1.0, -1.0])
    lid_yaw = body_yaw
    rtk_yaw = body_yaw + gt_alpha

    rtk_xy_a, rtk_yaw_a, lid_xy_a, lid_yaw_a, w_pos, w_yaw = make_arrays(
        rtk_xy, rtk_yaw, lid_xy, lid_yaw
    )
    bad_init_alpha = gt_alpha + math.radians(5.0)
    tx, ty, alpha, iters = cpr.gauss_newton_refine(
        rtk_xy_a, rtk_yaw_a, lid_xy_a, lid_yaw_a, w_pos, w_yaw,
        gt_tx, gt_ty, bad_init_alpha, max_iter=20, eps=1e-12,
    )
    assert_close("alpha (perturbed init, yaw-only)", alpha, gt_alpha, math.radians(0.01))
    assert_close("tx", tx, gt_tx, 1e-6)
    assert_close("ty", ty, gt_ty, 1e-6)
    print(f"  iterations={iters}")


def test_gn_corrects_perturbed_init():
    print("[test_gn_corrects_perturbed_init]")
    rng = np.random.default_rng(0)
    gt_alpha = math.radians(-15.0)
    gt_tx, gt_ty = -2.0, 4.0
    lid_xy = rng.uniform(-5.0, 5.0, size=(6, 2))
    rtk_xy = transform(lid_xy, gt_alpha, gt_tx, gt_ty)
    body_yaw = rng.uniform(-math.pi, math.pi, size=6)
    lid_yaw = body_yaw
    rtk_yaw = body_yaw + gt_alpha

    rtk_xy_a, rtk_yaw_a, lid_xy_a, lid_yaw_a, w_pos, w_yaw = make_arrays(
        rtk_xy, rtk_yaw, lid_xy, lid_yaw
    )
    perturbations = [
        (math.radians(10.0), 1.0, -1.0),
        (math.radians(-25.0), 5.0, 3.0),
        (math.radians(45.0), -10.0, 8.0),
    ]
    for d_alpha, d_tx, d_ty in perturbations:
        tx, ty, alpha, iters = cpr.gauss_newton_refine(
            rtk_xy_a, rtk_yaw_a, lid_xy_a, lid_yaw_a, w_pos, w_yaw,
            gt_tx + d_tx, gt_ty + d_ty, gt_alpha + d_alpha,
            max_iter=50, eps=1e-12,
        )
        label = f"d_alpha={math.degrees(d_alpha):+.1f}deg"
        assert_close(f"alpha [{label}]", alpha, gt_alpha, 1e-7)
        assert_close(f"tx    [{label}]", tx, gt_tx, 1e-7)
        assert_close(f"ty    [{label}]", ty, gt_ty, 1e-7)
        print(f"  {label}: iterations={iters}")


def _cost(rtk_xy, rtk_yaw, lid_xy, lid_yaw, w_pos, w_yaw, alpha, tx, ty):
    cos_a, sin_a = math.cos(alpha), math.sin(alpha)
    pred_x = cos_a * lid_xy[:, 0] - sin_a * lid_xy[:, 1] + tx
    pred_y = sin_a * lid_xy[:, 0] + cos_a * lid_xy[:, 1] + ty
    rx = pred_x - rtk_xy[:, 0]
    ry = pred_y - rtk_xy[:, 1]
    yaw_res = np.array([cpr.wrap_angle(rtk_yaw[i] - lid_yaw[i] - alpha) for i in range(len(rtk_yaw))])
    return float(np.sum(w_pos * (rx * rx + ry * ry)) + np.sum(w_yaw * yaw_res * yaw_res))


def test_finite_difference_gradient():
    """Confirm the analytical gradient (which is what GN moves along, up to
    the JtJ preconditioner) matches a numerical gradient. This is the
    sharpest mathematical check of sign correctness.
    """
    print("[test_finite_difference_gradient]")
    rng = np.random.default_rng(42)
    n = 5
    lid_xy = rng.uniform(-3.0, 3.0, size=(n, 2))
    body_yaw = rng.uniform(-math.pi, math.pi, size=n)
    gt_alpha = math.radians(11.0)
    gt_tx, gt_ty = 0.5, -0.7
    rtk_xy = transform(lid_xy, gt_alpha, gt_tx, gt_ty)
    rtk_yaw = body_yaw + gt_alpha
    lid_yaw = body_yaw

    rtk_xy_a, rtk_yaw_a, lid_xy_a, lid_yaw_a, w_pos, w_yaw = make_arrays(
        rtk_xy, rtk_yaw, lid_xy, lid_yaw
    )

    alpha = gt_alpha + math.radians(3.0)
    tx = gt_tx + 0.4
    ty = gt_ty - 0.3

    cos_a, sin_a = math.cos(alpha), math.sin(alpha)
    jtr = np.zeros(3, dtype=float)
    for i in range(n):
        lx, ly = lid_xy_a[i]
        rx_pred = cos_a * lx - sin_a * ly + tx
        ry_pred = sin_a * lx + cos_a * ly + ty
        rx_obs, ry_obs = rtk_xy_a[i]
        rx_res = rx_pred - rx_obs
        ry_res = ry_pred - ry_obs
        j_x = np.array([-sin_a * lx - cos_a * ly, 1.0, 0.0])
        j_y = np.array([cos_a * lx - sin_a * ly, 0.0, 1.0])
        jtr += w_pos[i] * (rx_res * j_x + ry_res * j_y)
        yaw_res = cpr.wrap_angle(rtk_yaw_a[i] - lid_yaw_a[i] - alpha)
        j_yaw = np.array([-1.0, 0.0, 0.0])
        jtr += w_yaw[i] * yaw_res * j_yaw
    grad_analytical = 2.0 * jtr  # d/dx of sum w r^2 = 2 sum w r dr/dx

    eps = 1e-6
    grad_numerical = np.zeros(3, dtype=float)
    for k, perturb in enumerate([
        lambda a, x, y, h: (a + h, x, y),
        lambda a, x, y, h: (a, x + h, y),
        lambda a, x, y, h: (a, x, y + h),
    ]):
        ap, xp, yp = perturb(alpha, tx, ty,  eps)
        am, xm, ym = perturb(alpha, tx, ty, -eps)
        cp = _cost(rtk_xy_a, rtk_yaw_a, lid_xy_a, lid_yaw_a, w_pos, w_yaw, ap, xp, yp)
        cm = _cost(rtk_xy_a, rtk_yaw_a, lid_xy_a, lid_yaw_a, w_pos, w_yaw, am, xm, ym)
        grad_numerical[k] = (cp - cm) / (2.0 * eps)

    for k, name in enumerate(("d/d(alpha)", "d/d(tx)", "d/d(ty)")):
        rel = abs(grad_analytical[k] - grad_numerical[k]) / max(abs(grad_numerical[k]), 1.0)
        if rel > 1e-4:
            raise AssertionError(
                f"{name}: analytical={grad_analytical[k]:.6e} numerical={grad_numerical[k]:.6e} rel={rel:.3e}"
            )
        print(f"  {name}: analytical={grad_analytical[k]:+.6e}  numerical={grad_numerical[k]:+.6e}  rel={rel:.2e}")


def test_gn_step_decreases_cost():
    """One Gauss-Newton step on `gauss_newton_refine` must strictly decrease
    the cost (for a small enough perturbation). With the wrong yaw sign the
    yaw component of the step pushes uphill, which this test catches.
    """
    print("[test_gn_step_decreases_cost]")
    rng = np.random.default_rng(7)
    gt_alpha = math.radians(8.0)
    gt_tx, gt_ty = 0.3, -0.2
    n = 4
    lid_xy = rng.uniform(-2.0, 2.0, size=(n, 2))
    body_yaw = rng.uniform(-math.pi, math.pi, size=n)
    rtk_xy = transform(lid_xy, gt_alpha, gt_tx, gt_ty)
    lid_yaw = body_yaw
    rtk_yaw = body_yaw + gt_alpha
    rtk_xy_a, rtk_yaw_a, lid_xy_a, lid_yaw_a, w_pos, w_yaw = make_arrays(
        rtk_xy, rtk_yaw, lid_xy, lid_yaw
    )

    perturbations = [
        (math.radians(2.0), 0.05, -0.05),
        (math.radians(-3.0), 0.0, 0.1),
        (math.radians(5.0), -0.1, 0.0),
    ]
    for d_alpha, d_tx, d_ty in perturbations:
        a0 = gt_alpha + d_alpha
        x0 = gt_tx + d_tx
        y0 = gt_ty + d_ty
        c_before = _cost(rtk_xy_a, rtk_yaw_a, lid_xy_a, lid_yaw_a, w_pos, w_yaw, a0, x0, y0)
        x1, y1, a1, _ = cpr.gauss_newton_refine(
            rtk_xy_a, rtk_yaw_a, lid_xy_a, lid_yaw_a, w_pos, w_yaw,
            x0, y0, a0, max_iter=1, eps=0.0,
        )
        c_after = _cost(rtk_xy_a, rtk_yaw_a, lid_xy_a, lid_yaw_a, w_pos, w_yaw, a1, x1, y1)
        if c_after >= c_before:
            raise AssertionError(
                f"GN step did not decrease cost: before={c_before:.6e} after={c_after:.6e} "
                f"(d_alpha={math.degrees(d_alpha):+.2f}deg)"
            )
        print(f"  d_alpha={math.degrees(d_alpha):+5.1f}deg: cost {c_before:.4e} -> {c_after:.4e}  OK")


def test_yaml_builtin_conversion():
    print("[test_yaml_builtin_conversion]")
    points = np.array([[0.0, 0.0], [35.0, 0.0], [2.0, 48.80315128816243]], dtype=float)
    area = cpr.signed_triangle_area(points)
    payload = cpr.to_yaml_builtin({
        "triangle_area_m2": area,
        "numpy_scalar": np.float64(854.0551475428426),
        "numpy_array": np.array([np.int64(1), np.float64(2.5)]),
    })
    yaml.safe_dump(payload, sort_keys=False)
    if not isinstance(payload["triangle_area_m2"], float):
        raise AssertionError("triangle area was not converted to a Python float")
    print("  yaml safe_dump accepts numpy-derived values")


def main():
    print("Running joint-LS solver tests...\n")
    test_perfect_data()
    print()
    test_yaw_sign_pure_rotation()
    print()
    test_gn_corrects_perturbed_init()
    print()
    test_gn_step_decreases_cost()
    print()
    test_finite_difference_gradient()
    print()
    test_yaml_builtin_conversion()
    print("\nAll tests passed.")


if __name__ == "__main__":
    main()
