#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RTK_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="$RTK_ROOT/data/logs"
PID_FILE="$LOG_DIR/tianditu_proxy.pid"
LOG_FILE="$LOG_DIR/tianditu_proxy.log"

mkdir -p "$LOG_DIR"

if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "Tianditu proxy is already running. PID: $(cat "$PID_FILE")"
  exit 0
fi

if [ -d "$SCRIPT_DIR/.deps" ]; then
  export PYTHONPATH="$SCRIPT_DIR/.deps:${PYTHONPATH:-}"
fi

cd "$SCRIPT_DIR"
nohup python3 app.py >> "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"

sleep 1
if kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "Tianditu proxy started."
  echo "PID: $(cat "$PID_FILE")"
  echo "URL: http://localhost:5001/api/tianditu/health"
  echo "Log: $LOG_FILE"
else
  echo "Tianditu proxy failed to start. Log: $LOG_FILE" >&2
  tail -40 "$LOG_FILE" >&2 || true
  exit 1
fi
