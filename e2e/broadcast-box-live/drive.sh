#!/bin/bash
# Drive the live scenario against the running server (server.mjs):
#   start -> (3.5s) in_camera -> (to 15.5s) public -> (16.5s) stop.
# The clip's speech sits at video-time 4..15s, so the in-camera window brackets it
# and the resulting transcript must exclude it. Reads bootstrap.json for ids.
set -u
E2E_DIR="${E2E_DIR:-$(cd "$(dirname "$0")/../.." && pwd)/.e2e-live}"
HOST="${HOST:-http://127.0.0.1:3000}"
B="$E2E_DIR/bootstrap.json"
UUID=$(python3 -c "import json;print(json.load(open('$B'))['deviceUuid'])")
REC=$(python3 -c "import json;print(json.load(open('$B'))['recordId'])")
echo "device=$UUID record=$REC"
post(){ curl -s --max-time 10 -X POST "$HOST/control/$1" -H 'Content-Type: application/json' -d "$2"; echo; }

echo "[start]";      post start      "{\"deviceUuid\":\"$UUID\",\"recordId\":\"$REC\"}"
sleep 3.5
echo "[in_camera]";  post visibility "{\"deviceUuid\":\"$UUID\",\"visibility\":\"in_camera\"}"
sleep 12
echo "[public]";     post visibility "{\"deviceUuid\":\"$UUID\",\"visibility\":\"public\"}"
sleep 1
echo "[stop]";       post stop       "{\"deviceUuid\":\"$UUID\"}"
echo "driving done; poll: curl $HOST/control/record/$REC | jq .frontmatter.capture,.frontmatter.transcript_status"
