#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Unit tests for `_check_quality_coverage` (Issue #2 fix).

Specifically verifies the bug scenario: 30-second recording where RTK is
float (quality != 4) for the first 25 seconds and recovers fixed only in
the last 5 seconds. The old code (TTL=5s buffer) would accept this; the
fixed code rejects it.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

# Reuse the stubs and module loader from test_solver.
sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_solver  # noqa: E402  (also installs ROS stubs)

cpr = test_solver.cpr


def _make_recorder(require_fixed=True):
    """Bypass ROS init by manufacturing a bare object with the methods bound.
    We only exercise `_check_quality_coverage`, which is independent of ROS.
    """
    rec = object.__new__(cpr.ControlPointRecorder)
    rec.require_fixed = require_fixed
    return rec


def assert_accept(label, ok, reason):
    if not ok:
        raise AssertionError(f"{label}: expected ACCEPT but got REJECT ({reason!r})")
    print(f"  {label}: ACCEPT  OK")


def assert_reject(label, ok, reason, must_contain=None):
    if ok:
        raise AssertionError(f"{label}: expected REJECT but got ACCEPT")
    if must_contain and must_contain not in reason:
        raise AssertionError(f"{label}: rejected ({reason!r}) but reason must contain {must_contain!r}")
    print(f"  {label}: REJECT  ({reason})")


def test_full_window_fixed():
    print("[test_full_window_fixed]")
    rec = _make_recorder()
    duration = 30.0
    start = 1000.0
    end = start + duration
    samples = [(start + i * 0.5, 4) for i in range(int(duration / 0.5) + 1)]
    ok, reason = rec._check_quality_coverage(samples, start, end, duration)
    assert_accept("all-fixed 30s @ 2Hz", ok, reason)


def test_late_recovery_only_last_5s():
    """The Issue #2 scenario: RTK float for first 25s, fixed for last 5s.
    With the old (TTL=5s) check, only the fixed samples would survive, so
    the buffer would look clean and the point would be accepted. The fixed
    code keeps the entire window, so it must reject.
    """
    print("[test_late_recovery_only_last_5s]")
    rec = _make_recorder()
    duration = 30.0
    start = 1000.0
    end = start + duration
    samples = []
    # 25s float at quality=5
    for k in range(int(25.0 / 0.5)):
        samples.append((start + k * 0.5, 5))
    # 5s fixed at quality=4
    for k in range(int(5.0 / 0.5) + 1):
        samples.append((start + 25.0 + k * 0.5, 4))
    ok, reason = rec._check_quality_coverage(samples, start, end, duration)
    assert_reject("25s float + 5s fixed", ok, reason, must_contain="dropped below 4")


def test_no_samples():
    print("[test_no_samples]")
    rec = _make_recorder()
    ok, reason = rec._check_quality_coverage([], 0.0, 30.0, 30.0)
    assert_reject("empty buffer", ok, reason, must_contain="no RTK quality samples")


def test_topic_stalled_mid_recording():
    """Samples cover only the first half of the window."""
    print("[test_topic_stalled_mid_recording]")
    rec = _make_recorder()
    duration = 30.0
    start = 1000.0
    end = start + duration
    samples = [(start + i * 0.5, 4) for i in range(int(10.0 / 0.5) + 1)]  # only 10s of samples
    ok, reason = rec._check_quality_coverage(samples, start, end, duration)
    assert_reject("only 10s of 30s covered", ok, reason)


def test_sparse_but_complete():
    """Sparse 1Hz publishing covering the whole window — should accept."""
    print("[test_sparse_but_complete]")
    rec = _make_recorder()
    duration = 30.0
    start = 1000.0
    end = start + duration
    samples = [(start + i, 4) for i in range(int(duration) + 1)]
    ok, reason = rec._check_quality_coverage(samples, start, end, duration)
    assert_accept("1Hz @ 30s all fixed", ok, reason)


def test_long_internal_gap():
    """Samples at start and end but a 15s gap in the middle — reject."""
    print("[test_long_internal_gap]")
    rec = _make_recorder()
    duration = 30.0
    start = 1000.0
    end = start + duration
    samples = []
    for i in range(11):
        samples.append((start + i * 0.5, 4))   # 0..5s
    for i in range(11):
        samples.append((start + 25.0 + i * 0.5, 4))  # 25..30s
    ok, reason = rec._check_quality_coverage(samples, start, end, duration)
    assert_reject("15s internal gap", ok, reason, must_contain="gap")


def main():
    print("Running quality-coverage tests...\n")
    test_full_window_fixed()
    print()
    test_no_samples()
    print()
    test_late_recovery_only_last_5s()
    print()
    test_topic_stalled_mid_recording()
    print()
    test_sparse_but_complete()
    print()
    test_long_internal_gap()
    print("\nAll tests passed.")


if __name__ == "__main__":
    main()
