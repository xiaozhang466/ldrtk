#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ ! -d "$SCRIPT_DIR/.deps/flask" ]; then
  echo "Backend dependencies are missing. Run: $SCRIPT_DIR/install_deps.sh" >&2
  exit 1
fi
export PYTHONPATH="$SCRIPT_DIR/.deps:$PYTHONPATH"
cd "$SCRIPT_DIR"
exec python3 app.py
