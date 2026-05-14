#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
python3 -m pip install --target "$SCRIPT_DIR/.deps" -r "$SCRIPT_DIR/requirements.txt"
