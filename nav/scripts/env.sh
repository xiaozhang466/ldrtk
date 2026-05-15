#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -n "${RTK_ROOT:-}" ]; then
  export RTK_ROOT="$(cd "$RTK_ROOT" && pwd)"
else
  export RTK_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
fi
export RTK_NAV_WS="$RTK_ROOT/nav"
export RTK_DATA_DIR="$RTK_ROOT/data"
export RTK_LOG_DIR="$RTK_DATA_DIR/logs"

mkdir -p "$RTK_LOG_DIR" "$RTK_DATA_DIR/maps" "$RTK_DATA_DIR/config"

source /opt/ros/noetic/setup.bash
if [ -f "$RTK_NAV_WS/devel/setup.bash" ]; then
  source "$RTK_NAV_WS/devel/setup.bash"
else
  export ROS_PACKAGE_PATH="$RTK_NAV_WS/src:/opt/ros/noetic/share:${ROS_PACKAGE_PATH:-}"
fi
