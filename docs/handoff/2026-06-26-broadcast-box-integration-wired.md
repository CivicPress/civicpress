# BroadcastBox device↔CP integration — session handoff (2026-06-26)

> Supersedes `2026-06-25-broadcast-box-phase45.md`. Feed this (or the pointer
> prompt) to a new session. The richest, most current detail is in the
> auto-loaded Claude memory — read it first: `broadcast-box-integration-status`
> (UPDATE-3…7), `broadcast-box-w2-transcription`, `broadcast-box-architecture`,
> `broadcast-box-enrollment-strategy`, `no-push-to-main-until-audit-done`.

## Big picture

A BroadcastBox appliance captures meeting A/V → uploads it → CivicPress stores it
as a core `session` record (with a `capture` block) → an optional transcription
service transcribes the **public** audio (excluding in-camera segments) and writes
the transcript back. Civic data = Markdown-in-Git core records (source of truth);
A/V is always public; AI is a separate, optional, gracefully-degrading service.

## Status: the chain is WIRED end-to-end (incl. in-camera), unit-tested — NOT yet run live

```
capture ✓ → enqueue ✓ → upload ✓ → session.manifest ✓ (+segments) → server ✓ → transcript ✓
```

Every link is implemented + unit-tested on both sides. What has **not** happened:
a real device↔server socket driving a real recording all the way to a transcript.
That live e2e (and real-hardware bring-up) is the remaining work.

## Repos / branches (all local — DO NOT push to origin/main; audit freeze)

- **Monorepo** `civicpress` — branch `refactor/phase-5-broadcast-box-server`.
- **HW repo** `../civicpress-broadcast-box` (Python) — branch
  `refactor/phase-4-enrollment-hardening`. Canonical HW status: `agent/CURRENT-STATUS.md`.

## What landed this session

**Server (monorepo, `refactor/phase-5-broadcast-box-server`):**
- `1774d1c` — upload routes authenticate the **device** by bearer token + per-resource
  ownership (design §10.11). Shared `authenticateDeviceToken`; `deviceAuthMiddleware`.
- `0fe9ac3` — transcript artifact verified against **real** `CloudUuidStorageService`
  (the gateway passed a raw Buffer the service rejects → now a multer `.vtt`) (§10.12).
- `c55a787` — `set_visibility` added to the device-command allowlist (operator → in-camera).
- (Earlier, design §10.8/§10.10: module mounted in-process, live device WS auth +
  `session.manifest` → `capture.segments`, real HTTP chunked-upload → `capture.av_file`.)

**Device (HW repo, `refactor/phase-4-enrollment-hardening`):**
- `ac4057a` — real `CivicPressUploader` (create→chunk→finalize, Bearer token) wired
  into `UploadQueue`; fixed a `.gitignore` rule that left the uploader untracked.
- `6e84863` — `SessionManifestEmitter` (`upload.complete` → `session.manifest`).
- `9789025` — `UploadCoordinator` (the previously-missing capture→enqueue link) + a
  `start_session` camelCase field fix (server sends `sessionId`/`civicpressSessionId`;
  the device read snake `session_id`).
- `274762a` — in-camera: `set_visibility` command → timestamped transitions →
  `capture.segments` on the manifest.

Tests: HW upload-chain 35 green; server broadcast-box 133 green; transcription 34
+ 9 e2e green. All unit/e2e at the component level — no across-the-wire run.

## Next step (where a new session should start)

1. **Live e2e, hardware-free** — synthetic capture (`v4l2loopback` / ffmpeg
   `testsrc`, or a canned MP4) on a device pointed at a running CivicPress;
   start_session → record → set_visibility toggles → stop → confirm the upload,
   the `session.manifest`, the `capture` block, and a transcript that excludes the
   in-camera window. This is the real proof.
2. **Real-hardware bring-up** — an x86_64 mini-PC + a UVC HDMI capture dongle
   (NOT the Elgato HD60; see the architecture memory).

## Known follow-ups (non-blocking)

- HW `upload_queue.py`: the bandwidth-throttle gate is vestigial (per-chunk
  throttle removed); re-add real throttling or delete the dead gate.
- Segment `t0` uses `session.started` wall-clock (~sub-second skew from true
  recording start; fine for coarse in-camera).
- The DB `upload_queue` / `add_upload_job` table is unused (in-memory queue is the path).

## Toolchain gotchas

- HW repo tests: `.venv-linux/bin/python -m pytest …` (needs ffmpeg). The repo has
  no `make`; commits use `--no-verify`.
- Monorepo: targeted `pnpm --filter <pkg> run test:run` / `vitest run <file>`; the
  full pre-commit suite is flaky on the VM (`civicpress-precommit-suite-flaky`).
- The interactive `grep` is a ugrep shim — `unset -f grep` and use `/usr/bin/grep`.
- broadcast-box must be in the CivicPress config `modules:` for its schema
  extension + in-process mount to apply.
