#!/usr/bin/env bash
# Invoked by go2rtc's exec source. $1 is the RTSP URL go2rtc wants us to publish to.
# Pipe Chromium's JPEG frames into ffmpeg, encode H.264, push to go2rtc.
set -euo pipefail

CAP=/share/adc-stream/capture.js
[ -f "$CAP" ] || CAP=/app/capture.js

node "$CAP" \
  | ffmpeg -hide_banner -loglevel warning \
      -f mjpeg -framerate 12 -i - \
      -c:v libx264 -preset ultrafast -tune zerolatency -pix_fmt yuv420p -g 24 \
      -f rtsp -rtsp_transport tcp "$1"
