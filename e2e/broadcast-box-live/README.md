# BroadcastBox — hardware-free live e2e harness

Runs the **whole** device↔CivicPress chain across the real wire with **no capture
hardware**: a real CivicPress server + a real device *process* recording a
synthetic A/V clip, driven start → in-camera → public → stop, ending in a
transcript that **excludes** the in-camera window.

```
operator start_session ─WS→ device ─(synthetic A/V record)→
  set_visibility in_camera/public ─WS→ device   stop ─WS→ device →
  encoder finalizes MP4 (+sha256) → chunked upload ─HTTP→ server → capture.av_file →
  session.manifest ─WS→ server → capture.segments →
  transcription worker → media.transcript EXCLUDING the in-camera window
```

This is the **on-demand full-stack proof**. The always-on CI guardrails for the
individual seams are the in-process tests under `tests/broadcast-box/` and
`services/transcription/` (e.g. `device-ws-e2e` covers the outbound operator
command + the manifest → capture-block path; `transcription-e2e` covers
in-camera exclusion). Only the A/V *source* is synthetic — the camera→frames
plumbing is the one hardware-coupled part and is out of scope here.

## Prereqs

- Both repos checked out side by side: this repo and `../civicpress-broadcast-box`.
- This repo built (`pnpm -r build`, or at least core / api / realtime /
  broadcast-box / storage / transcription `dist/`).
- The device's Python venv (`../civicpress-broadcast-box/.venv-linux`).
- `ffmpeg`, and whisper.cpp (`whisper-cli` + a real `ggml-*.bin` model). Point at
  them with `WHISPER_CPP_BIN` / `WHISPER_CPP_MODEL` (defaults assume the dev VM).
- A speech sample for the clip (defaults to whisper.cpp's bundled `samples/jfk.wav`).

## Run

```bash
HERE=e2e/broadcast-box-live
HW=../civicpress-broadcast-box

# 1. Build the synthetic meeting clip (testsrc video + JFK speech at 4..15s).
bash $HERE/make-clip.sh                       # -> $HERE/synthetic-meeting.mp4

# 2. Start the server (HTTP :3000 + realtime :3001, bb + transcription).
node_modules/.bin/tsx $HERE/server.mjs &      # writes .e2e-live/bootstrap.json
until curl -sf localhost:3000/control/health >/dev/null; do sleep 0.5; done

# 3. Enroll + boot the device (synthetic capture, AP-mode off so :8443 is free).
read UUID CODE < <(python3 -c "import json;d=json.load(open('.e2e-live/bootstrap.json'));print(d['deviceUuid'],d['enrollmentCode'])")
( cd $HW
  PYTHONPATH=src .venv-linux/bin/python scripts/configure_device.py \
    --device-uuid "$UUID" --enrollment-code "$CODE" \
    --civicpress-url http://localhost:3000 --db-path /tmp/bb-device.db --enroll
  SYNTHETIC_CAPTURE_SOURCE="$OLDPWD/$HERE/synthetic-meeting.mp4" \
  DB_PATH=/tmp/bb-device.db CIVICPRESS_URL=http://localhost:3000 \
  AP_MODE_ENABLED=false PYTHONUNBUFFERED=1 PYTHONPATH=src \
    .venv-linux/bin/python -m broadcast_box.main & )
# wait for "Connected to CivicPress" in the device's stdout

# 4. Drive start -> in_camera -> public -> stop.
bash $HERE/drive.sh

# 5. Verify (capture block + an in-camera-excluding transcript).
REC=$(python3 -c "import json;print(json.load(open('.e2e-live/bootstrap.json'))['recordId'])")
curl -s localhost:3000/control/record/$REC | python3 -m json.tool
```

Expected: `capture.segments` has a middle `in_camera` window, `transcript_status:
automated`, and `media.transcript_data.text` is blank/`[BLANK_AUDIO]` — i.e. the
speech that sat inside the in-camera window is **absent** from the public
transcript. (Run `make-clip.sh` without the in-camera toggle as a control to see
the full speech transcribed.)

## Notes / gotchas

- `/control/*` stands in for an authenticated operator UI: `start`/`stop` go
  through the real `SessionController.startSession/stopSession` (which create the
  `broadcast_sessions` row + deliver the command), `set_visibility` through the
  real `DeviceCommandService` — only the user-JWT wrapper is skipped.
- Set `AP_MODE_ENABLED=false` on the device (done above) so its local config UI
  doesn't fight for `:8443` across re-runs.
- Kill a lingering device between runs (it holds the device DB + any AP-mode port).
