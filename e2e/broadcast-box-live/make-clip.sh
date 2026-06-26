#!/bin/bash
# Build the synthetic meeting clip: 20s testsrc2 video + a speech sample placed at
# t=4..15s, silence elsewhere. The in-camera window [~3.5,~15.5] then brackets ALL
# the speech, so a correctly-excluding transcript comes back blank.
#
# Usage: make-clip.sh <speech.wav> <out.mp4>
#   speech.wav defaults to whisper.cpp's bundled JFK sample.
set -euo pipefail
SPEECH="${1:-/home/claude/whisper.cpp/samples/jfk.wav}"
OUT="${2:-$(dirname "$0")/synthetic-meeting.mp4}"

ffmpeg -y -hide_banner -loglevel error \
  -f lavfi -t 20 -i testsrc2=size=640x360:rate=15 \
  -i "$SPEECH" \
  -filter_complex "[1:a]adelay=4000,apad=whole_dur=20[aud]" \
  -map 0:v -map "[aud]" -c:v libx264 -preset veryfast -pix_fmt yuv420p \
  -c:a aac -ar 48000 -ac 2 -t 20 "$OUT"
echo "built $OUT"
