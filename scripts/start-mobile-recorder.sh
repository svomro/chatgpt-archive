#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-8080}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CAPTURE_DIR="${CHATGPT_CAPTURE_DIR:-$HOME/ChatGPT-Stream-Captures}"
LISTEN_HOST="${CHATGPT_PROXY_HOST:-$(ipconfig getifaddr en0 2>/dev/null || true)}"
LISTEN_HOST="${LISTEN_HOST:-127.0.0.1}"

if ! command -v mitmdump >/dev/null 2>&1; then
  echo "mitmdump not found. Install mitmproxy first." >&2
  exit 1
fi

export CHATGPT_CAPTURE_DIR="$CAPTURE_DIR"

echo "ChatGPT mobile stream recorder"
echo "  proxy:    http://$LISTEN_HOST:$PORT"
echo "  captures: $CAPTURE_DIR"
echo "  CA page:  http://mitm.it (open this on the iPhone after setting the proxy)"
echo

exec mitmdump \
  --mode "regular@${LISTEN_HOST}:${PORT}" \
  -s "$ROOT_DIR/tools/mobile_mitm_recorder.py"
