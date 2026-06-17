#!/usr/bin/env bash
set -euo pipefail

OPTS=/data/options.json
export CAM_NAME="$(jq -r '.camera_name // ""' "$OPTS" 2>/dev/null || echo "")"
export DEBUG_MODE="$(jq -r '.debug // true' "$OPTS" 2>/dev/null || echo "true")"
export DEBUG_DIR=/share/adc-stream-debug
mkdir -p "$DEBUG_DIR"

echo "[run] camera_name='${CAM_NAME}' debug=${DEBUG_MODE}"

if [ "$DEBUG_MODE" = "true" ]; then
  echo "[run] DEBUG mode: login + screenshots only (no streaming)."
  node /app/capture.js --debug || echo "[run] capture.js exited non-zero (expected if selectors/2FA need fixing)"
  echo "[run] Debug run done. See screenshots in ${DEBUG_DIR}. Set debug:false to stream. Idling."
  sleep infinity
else
  echo "[run] STREAM mode: starting go2rtc (stream 'adc_poc')."
  exec go2rtc -config /app/go2rtc.yaml
fi
