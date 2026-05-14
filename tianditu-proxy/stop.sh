#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RTK_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="$RTK_ROOT/data/logs"
PID_FILE="$LOG_DIR/tianditu_proxy.pid"

if [ ! -f "$PID_FILE" ]; then
  echo "Tianditu proxy is not running."
  exit 0
fi

PID="$(cat "$PID_FILE")"
if kill -0 "$PID" 2>/dev/null; then
  kill "$PID"
  sleep 1
  if kill -0 "$PID" 2>/dev/null; then
    kill -9 "$PID"
  fi
  echo "Tianditu proxy stopped. PID: $PID"
else
  echo "Tianditu proxy process not found. PID: $PID"
fi

rm -f "$PID_FILE"
