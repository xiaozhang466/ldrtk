#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/env.sh"

PID_FILE="$RTK_LOG_DIR/rtk_navigation.pid"
LOG_FILE="$RTK_LOG_DIR/rtk_navigation.log"
BRINGUP_LAUNCH="$RTK_NAV_WS/launch/bringup.launch"

if pgrep -f "$BRINGUP_LAUNCH" >/dev/null 2>&1; then
  echo "RTK navigation is already running."
  exit 0
fi

if ! pgrep -f "rosmaster" >/dev/null 2>&1; then
  roscore > "$RTK_LOG_DIR/roscore.log" 2>&1 &
  sleep 3
fi

ROSBRIDGE_ARG="start_rosbridge:=false"
if rospack find rosbridge_server >/dev/null 2>&1; then
  ROSBRIDGE_ARG="start_rosbridge:=true"
else
  echo "WARN: rosbridge_server is not installed; web ROS bridge will not start."
  echo "WARN: install ros-noetic-rosbridge-server to enable ws://<host>:9090."
fi

nohup roslaunch "$BRINGUP_LAUNCH" "$ROSBRIDGE_ARG" "$@" > "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"

sleep 3

echo "RTK navigation started."
echo "PID: $(cat "$PID_FILE")"
echo "Log: $LOG_FILE"
echo "Topics: /rtk/fix /rtk/heading /odometry/rtk /task /cmd_vel /navigation/state /odom"

if ! rosnode list 2>/dev/null | grep -q '^/um982_rtk_node$'; then
  echo "WARN: um982_rtk_node is not running. Check RTK serial device and configuration."
  echo "WARN: recent log lines:"
  tail -40 "$LOG_FILE" || true
fi

if ! rosnode list 2>/dev/null | grep -q '^/um982_rtk_nav_node$'; then
  echo "WARN: um982_rtk_nav_node is not running. Check $LOG_FILE."
fi

if ! rosnode list 2>/dev/null | grep -q '^/ranger_base_node$'; then
  echo "WARN: ranger_base_node is not running. Check CAN interface and chassis model."
fi
