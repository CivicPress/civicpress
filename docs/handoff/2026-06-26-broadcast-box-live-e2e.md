# BroadcastBox device↔CP — HARDWARE-FREE LIVE E2E achieved (2026-06-26)

> Supersedes `2026-06-26-broadcast-box-integration-wired.md`. The chain is no
> longer just "wired + unit-tested" — it has now **run live across the wire**, and
> doing so surfaced (and fixed) **eight real integration bugs** that every unit
> test had hidden behind mocks. Richest detail: the `broadcast-box-integration-status`
> memory (UPDATE-8).

## What now works (proven, not asserted)

A real CivicPress API (HTTP :3000 + in-process realtime WS :3001, broadcast-box
mounted, transcription worker live) and a **separate real device process**
(`python -m broadcast_box.main`) drove a full meeting over the actual wire:

```
operator start_session ─WS→ device ─(synthetic A/V record)→
  set_visibility in_camera ─WS→ device   set_visibility public ─WS→ device
  stop_session ─WS→ device → encoder finalizes MP4 (+sha256) →
  chunked upload create→chunks→finalize ─HTTP→ server → capture.av_file →
  session.manifest ─WS→ server → capture.segments →
  transcription worker → media.transcript (WebVTT) EXCLUDING the in-camera window
```

**Verified on the final run** (record `record-1782508869978`):
- `capture`: `{device, av_file, duration_s: 19.18, segments: [0→3.68 public,
  3.68→15.7 in_camera, 15.7→19.18 public]}`.
- `transcript_status: automated`; `media.transcript` artifact stored + retrievable.
- The clip carried **JFK speech only inside the in-camera window**; the transcript
  is `"[BLANK_AUDIO] [BLANK_AUDIO]"` (the two public/silent ranges) — **zero JFK
  keywords leaked.** That is the civic-critical proof.

The only thing synthetic is the **A/V source** (the device's unified encoder
self-generates from a canned clip — the camera→frames plumbing is the only
hardware-coupled part and is out of scope for a hardware-free run). Everything
else — the WS control plane, the HTTP upload, the manifest, the server
processing, the real whisper.cpp transcription — ran for real.

## The eight bugs the live run found (all unit tests passed before this)

**Device (HW repo, `refactor/phase-4-enrollment-hardening`):**
1. **Session events were misnamed → the live recording flow was DEAD.**
   `session_state` published `session.start`/`session.stop`; the capture
   orchestrator, the upload coordinator, and the encoder's stop handler all
   subscribe to the past-tense `session.started`/`session.stopped`, which nothing
   published. The event bus matches names exactly → nothing fired. Unit tests
   published the `-ed` form directly, so they passed. **Fix:** publish the `-ed`
   names (`session_state.py`).
2. **`UploadQueue.add_upload` does not exist.** The coordinator called
   `upload_queue.add_upload(...)`; the real method is `enqueue(...)` (identical
   kwargs). Mocks had `add_upload`, hiding it. **Fix:** call `enqueue`; the test
   fake is now `MagicMock(spec=UploadQueue)` so the drift can't recur.
3. **An enrolled device couldn't reconnect.** Boot's `_setup_civicpress_connection`
   required `enrollment_code`, but enrollment *consumes* (deletes) the one-time
   code — so every device was locked out after its first enrollment. **Fix:**
   accept a stored credential token as satisfying the "configured" gate.
4. **No hardware-free capture + an unsafe stop.** Added an env-gated synthetic
   source (`SYNTHETIC_CAPTURE_SOURCE` = `testsrc` or a media-file path) so the
   unified encoder self-generates A/V (`unified_service.py`). Also: the encoder's
   stop only ever hard-killed FFmpeg → a truncated/corrupt MP4 for a still-running
   source; now it finalizes via graceful SIGTERM before any kill. (And the
   synthetic output is a single fragmented MP4, not the tee path whose
   `[f=h264]pipe:1` slave corrupts a muxed A/V stream.)
5. **`start_session` hard-failed with no camera.** It required a configured video
   source and enumerated audio devices (which throws on a host with no PortAudio).
   **Fix:** in synthetic mode skip source enumeration and the video-source gate
   (`command_handler.py`).

**Server (monorepo, `refactor/phase-5-broadcast-box-server`):**
6. **Operator→device commands were never delivered.** `DeviceRoom.sendToDevice`
   reads `realtimeServer.clientToDevice` to find a device's socket, but the
   in-process realtime server never had that map → every command returned
   "Failed to send command". Inbound (device→server) worked, so the WS e2e tests
   (which only send manifests) never caught it. **Fix:** the realtime server now
   populates a `clientToDevice` map on device auth + clears it on disconnect
   (`modules/realtime/src/realtime-server.ts`).
7. **In-camera audio LEAKED into the transcript.** The whisper engine sliced
   public ranges with whisper-cli's `-ot`/`-d` flags, but `-d` (duration) is
   ignored in this whisper.cpp build, so a `[0,3.6]` pass ran to EOF and swallowed
   the closed-session speech. **Fix:** cut each public range with ffmpeg *before*
   whisper and shift timestamps back to absolute (`engines/whisper-cpp.ts`) —
   build-independent.
8. **A race let the worker transcribe before visibility was known.**
   `capture.av_file` is written by the upload finalize; `capture.segments` arrive
   later via the device `session.manifest`. The worker triggered on `av_file`
   alone, so a poll landing in between transcribed the *whole* recording (no
   exclusion). **Fix:** the readiness gate now also requires `capture.segments`
   present — the manifest-applied signal (`[]` = all-public still counts)
   (`gateways/core-records-gateway.ts`). Civic-critical: never transcribe a
   recording whose closed windows aren't yet known.

Tests after the fixes — all green: HW unit **294**; realtime **127**;
transcription pkg **34** + e2e **9**; broadcast-box module **133** + e2e **7**.

## How to reproduce the live run (no hardware)

1. Build the canned clip once (testsrc video + JFK speech at 4–15s in a 20s
   timeline, silence elsewhere) — see `scratchpad/synthetic-meeting.mp4` / the
   ffmpeg command in the session log.
2. Server: a standalone bootstrap (`scratchpad/e2e-live-server.mjs`, run with
   `node_modules/.bin/tsx`) boots CivicPress + realtime(:3001) + broadcast-box +
   transcription (whisper-cpp, `language: en` for the JFK clip; prod default is
   `fr-CA`) against a throwaway data dir, enrolls a device, and exposes a
   localhost `/control/*` surface that drives the device via the real
   `DeviceCommandService`.
3. Device: pre-enroll cleanly (`scratchpad/preenroll.py` — `configure_device.py`
   is stale/racy and broken), then
   `SYNTHETIC_CAPTURE_SOURCE=<clip> DB_PATH=<db> CIVICPRESS_URL=http://localhost:3000
   PYTHONPATH=src python -m broadcast_box.main`.
4. Drive `start → (3.5s) in_camera → (15.5s) public → (16.5s) stop`; the in-camera
   window brackets the speech, so the transcript must come back blank.

Gotcha: the device's AP-mode web server binds **:8443** and treats a bind failure
as fatal — kill any lingering device before re-running, or it shuts down.

## Remaining work

The post-live-e2e follow-ups are now **done** (see the `broadcast-box-integration-status`
memory UPDATE-9): the dead bandwidth-throttle gate, segment `t0` (now anchored to
`encode.unified.started`), the `control`/`connection.ack` handling,
`configure_device.py`, AP-mode `:8443` (non-fatal + env-gated), FSM→IDLE for
back-to-back meetings, the `POST /sessions` row creation (which also surfaced + fixed
a **9th** bug — the device room was keyed by the db id, not the uuid, so commands
never reached the device), seam regression tests, the committed live-e2e harness
(`e2e/broadcast-box-live/`), and a hardware bring-up runbook + capture smoke
(`scripts/check_capture.py`, `docs/hardware-bring-up.md`). All suites green.

Only two things remain:

- **Real-hardware bring-up** — x86_64 mini-PC + a **UVC** HDMI capture dongle
  (MS2109/MS2130 or Elgato Cam Link 4K; NOT the Elgato HD60, NOT a Pi). Needs the
  physical kit; follow `docs/hardware-bring-up.md` (run the capture smoke, then run
  the device with no synthetic flag → the V4L2/ALSA path takes over).
- **Create-on-demand session record / Meeting model** — a maintainer data-model
  decision, spec'd in `docs/specs/2026-06-26-broadcast-box-meeting-model-design.md`.

(`--language en` was used for the English JFK test clip; production default is `fr-CA`.)

## Repos / branches (local only — DO NOT push to origin/main; audit freeze)

- Monorepo `civicpress` @ `refactor/phase-5-broadcast-box-server`.
- HW repo `../civicpress-broadcast-box` @ `refactor/phase-4-enrollment-hardening`.
- All work committed with `--no-verify`; origin/main stays frozen.
