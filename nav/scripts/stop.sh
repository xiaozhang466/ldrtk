#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/env.sh"

PID_FILE="$RTK_LOG_DIR/rtk_navigation.pid"

rosnode kill /um982_rtk_node /um982_rtk_nav_node /ranger_base_node 2>/dev/null || true
pkill -f "/home/ros/ZMG/sigu/rtk/nav/launch/bringup.launch" 2>/dev/null || true
pkill -f "rosbridge_websocket.*9090" 2>/dev/null || true

if [ -f "$PID_FILE" ]; then
  pid="$(cat "$PID_FILE")"
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
fi

echo "RTK navigation stopped."
