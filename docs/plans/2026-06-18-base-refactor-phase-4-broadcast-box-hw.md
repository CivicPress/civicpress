# Phase 4 — BroadcastBox Hardware: Audit + Fix Implementation Plan

> **Design update (2026-06-20):** the architecture is now specified in
> `docs/specs/2026-06-20-broadcast-box-architecture-design.md` (the source of
> truth). Key reframes since this plan was first written:
> - **Capture at the edge; derive in a service; core stays source-of-truth.** The
>   AI/transcription pipeline is a **separate optional service** (`civic start`-
>   managed, pluggable local/cloud), NOT on the appliance and NOT in core. This
>   reshapes **W2** (BB-HW-003) from "AI on the device" to that service.
> - **No new record type — extend the existing `session` type** (single evolving
>   record per meeting; `visibility`/`minutes_status` added to core; capture
>   fields via the broadcast-box module's `schemaExtensions`). Done as prep:
>   core `session` schema + a seam contract test.
> - **Greenfield protocol** (nothing public → no legacy migration) and a
>   **headless device** (kill the control UI, BB-HW-017). Detail in
>   `docs/plans/2026-06-18-base-refactor-phase-4-w1-protocol-artifact.md`.
> - **Live streaming** = external RTMP restream only (reuse `rtmp_service.py`).

**Goal:** Take the `civicpress-broadcast-box` hardware repo from "alpha, not
pilot-ready" to pilot-ready, and build the manifesto's core path — *public
meeting → Markdown civic record* — instead of the current `.mp4`-blobs-only
output.

**Master plan reference:** `docs/plans/2026-05-17-base-refactor-master-plan.md`
§5 Phase 4.

**Audit reference:** `docs/audits/sections/civicpress-broadcast-box-hardware.md`
(findings BB-HW-001 … BB-HW-017) + workspace-003/004.

**Target repo:** `/home/claude/civicpress/civicpress-broadcast-box` (separate
repo, local-only, **no git remote** — workspace-003). 22.5k LoC Python +
a Nuxt 4 frontend. Current branch tip `6b45fc9`.

**Policy reminders:**
- No push to `origin/main` until the audit is done (memory:
  `[No push to main until audit done]`). Hardware-repo work happens on
  branches in that repo; this base-repo plan doc is the only thing that lands
  here.
- Findings are tracked open → closed-with-commit-SHA in
  `docs/audits/2026-05-16-manifesto-fit-findings.md`; closure commits in the
  hardware repo list the BB-HW IDs they close.

---

## 0. Scoping verdict (2026-06-18) — the repo is runnable on this VM

The pivotal Phase-4 unknown ("can we even build/run/test the hardware here, or
does it need a Pi?") is **answered: yes, it runs on the dev VM** (ARM/aarch64,
Python 3.12). The stale macOS `.venv` hid this. Reproducible recipe:

1. Fresh venv: `python3.12 -m venv .venv-linux` (the committed `.venv` is a dead
   macOS venv — see cruft below).
2. `pip install -e ".[dev]"`.
3. Swap headless OpenCV: `pip install --force-reinstall --no-deps
   opencv-python-headless` (no `libGL.so.1` on a headless box; also the correct
   choice for a Pi appliance — see N2).
4. Install the `requirements.txt`-only deps that `pyproject.toml` omits:
   `pip install fastapi "uvicorn[standard]" av aiortc` (see N1).
5. `sudo apt-get install -y ffmpeg` (the code shells out to the `ffmpeg`
   *binary*; PyAV only bundles the *libraries* — see N3-context).

**Test result after the recipe: 282 passed, 1 failed, 7 skipped** (~2.5 min;
the one failure is finding N3 below, a real test bug). Before `ffmpeg`: 45
failed, all the identical "ffmpeg binary missing" cause.

---

## 1. New findings discovered during scoping

These were not in the original audit; they fall inside Phase 4 scope.

- **N1 — `pyproject.toml` dependency drift (functional bug).**
  `[project.dependencies]` omits `fastapi`, `uvicorn`, `av`, and `aiortc`, all
  of which `requirements.txt` declares and which `src/` imports at module load
  (`web/api/routes.py`, `services/preview/{webrtc,encoder}.py`,
  `services/ap_mode/web_server.py`). A clean `pip install` from `pyproject`
  yields a **non-importable app**. Fix: reconcile `pyproject` to be the single
  source of truth; either delete `requirements.txt` or generate it from
  `pyproject`. *Effort: S.*

- **N2 — `opencv-python` vs `opencv-python-headless` (appliance correctness).**
  The appliance is a headless SBC; `opencv-python` pulls GUI libs (`libGL`)
  that don't exist there. Pin `opencv-python-headless`. Ties directly into
  **BB-HW-009** (Pi install path). *Effort: S.*

- **N3 — `test_encoder_detection` rejects the Pi's own hardware encoder
  (real test bug).** `tests/unit/test_unified_encoder.py:63` asserts the
  detected encoder is in `{APPLE_VIDEOTOOLBOX, INTEL_QUICKSYNC, NVIDIA_NVENC,
  SOFTWARE}` — but production defines and selects `EncoderType.V4L2_M2M`
  (`services/encoder/detection.py:17,210`), the Raspberry Pi's `h264_v4l2m2m`
  hardware encoder. So the test is **green on a Mac dev box and red on the
  actual target hardware** — the inverse of what a hardware appliance's test
  suite should do. Fix: add `EncoderType.V4L2_M2M` to the allowed set.
  *Effort: S (one line). Closes the suite to green on this VM and on a Pi.*

- **N4 — macOS / build cruft committed.** `.DS_Store` (multiple), the dead
  macOS `.venv/`, `.coverage`, `coverage.xml`, `htmlcov/`. Gitignore + remove.
  Folds into **workspace-004** cleanup. *Effort: S.*

---

## 2. Finding reconciliation (re-verified against current code, 2026-06-18)

**Already closed (Phase 4 quick-wins, prior commits):**

| ID | What | Commit |
|---|---|---|
| BB-HW-002 | AGPL-3.0-or-later license | `f63edaf` |
| BB-HW-008 | self-grade `engineering-analysis.md` deleted | `6c881db` |
| BB-HW-011 | AP-mode auto-deactivate timeout (15-min default) | `afda81d` |
| BB-HW-012 | credential encryption verified real (Fernet+PBKDF2) | recon |
| BB-HW-015 | version/status reconciled to "0.1.0 alpha, unreleased" | `6b45fc9` |

**Open — re-verified present:**

| ID | Sev/Effort | Verified-now evidence |
|---|---|---|
| **BB-HW-003** | Critical / L | `storage/` has **75 `.mp4`, 1 `.json`**. Zero transcript/AI deps in the tree. The "AI port" cited by the master plan **does not exist in code**, and the `broadcast-box-ai-port` design memory it references **is not present**. This is design-from-scratch. |
| BB-HW-001 | S+M | `connector/websocket_client.py` + doc disagree; no shared protocol artifact. |
| BB-HW-004 | M | 3 wire-message shapes parsed in `connector/websocket_client.py`. |
| BB-HW-005 | M | `connector/command_handler.py` 25-action `elif` router (audit said `services/` root; actual path is `services/connector/`). |
| BB-HW-006 | M | `connector/websocket_client.py` ~1,432 LoC, overlapping reconnect paths. |
| BB-HW-007 | S | HW repo absent from `docs/roadmap.md` + `docs/project-status.md`. |
| BB-HW-009 | L | `docker/` is **empty**; no ISO; curl-pipe install only. |
| BB-HW-010 | S | token in both `Authorization` header and `?token=` query param. |
| BB-HW-013 | M | enrollment code stored as plain config string, auto-reused on `AUTH_FAILED`. |
| BB-HW-014 | M | **69 markdown docs** under `docs/`+`agent/` for a 22.5k-LoC alpha. |
| BB-HW-016 | S | `agent/manifesto-slim.md` drift-prone copy. |
| BB-HW-017 | M | `frontend/` is a full Nuxt 4 + `@nuxt/ui-pro` app (second flagship UI). |
| workspace-003 | M | no git remote on the hardware repo. |
| workspace-004 | M | backup dirs + macOS cruft (N4) to clean. |

---

## 3. Workstreams (proposed sequencing)

**W0 — Unblock + green (fast; do first).**
- Commit the env recipe as a `Makefile`/`scripts/dev-setup.sh` target so the
  build is reproducible (folds N1, N2).
- Fix N3 (1-line) → suite green on this VM and on a Pi.
- N4 cruft removal + `.gitignore`.
- workspace-003: create the git remote and push (needs maintainer decision on
  host/visibility — see Open Questions).
- BB-HW-007: add the HW repo to `roadmap.md` + `project-status.md` (base repo).
*Closes: N1–N4, BB-HW-007, workspace-003, workspace-004.*

**W1 — Canonical protocol artifact.** One JSON-Schema (or `.proto`) consumed by
both repos; generated types both sides; sunset 2 of the 3 wire shapes; dispatch
table for the `elif` router; shrink the reconnect god-file.
*Closes: BB-HW-001, BB-HW-004, BB-HW-005, BB-HW-006 (+ base-side
broadcast-box-010 in Phase 5).*

**W2 — Civic-artifact pipeline (the mission; multi-week).** Design + build
`video → transcript → enhanced transcript → audio version → Markdown civic
record` (timestamps, motion markers, attendee list, speaker turns). Output must
be **ingest-compatible** — mirror `civicpress-ingest`, whose job is exactly
"produce Markdown civic records." Write the missing `broadcast-box-ai-port`
design note first.
*Closes: BB-HW-003 (+ base-side broadcast-box-002 in Phase 5).*

**W3 — Installer / appliance.** Docker-compose + tested Ansible for a Pi-class
device first; ISO/USB as stretch. Pin headless OpenCV (N2) here.
*Closes: BB-HW-009.*

**W4 — Security + cleanup tail.** BB-HW-010 (drop query-param token — flagged in
prior recon as a multi-site auth-flow refactor, now testable since the suite
runs), BB-HW-013 (re-enrollment hardening), BB-HW-014 (33→core docs),
BB-HW-016 (manifesto-slim), BB-HW-017 (decide on the second Nuxt UI).
*Closes: BB-HW-010, 013, 014, 016, 017.*

---

## 4. Open questions (need maintainer decision)

1. **Local-vs-remote AI** for the transcript/enhancement pipeline (W2). Affects
   vendor-lock-in posture and whether a Pi can run it standalone. *Blocks W2
   design.*
2. **Git remote** for workspace-003: which host, public or private, and does
   "no push to main until audit done" extend to first-publish of this
   *separate* repo? (Reading: it does not — that memory is about
   `civicpress/origin/main`; but confirm.)
3. **Second Nuxt UI (BB-HW-017):** keep `frontend/` as the on-device enrollment
   UI, fold it into the main UI, or replace with something lighter for a Pi?

---

## 5. Exit criteria (from master plan §5)

- [ ] Hardware repo has a license (BB-HW-002) ✅ done.
- [ ] Canonical protocol-spec artifact exists; both repos consume it; one wire
      format only.
- [ ] Recordings ship with a Markdown civic-record sidecar (+ audio version)
      automatically.
- [ ] A clerk-installable path exists (ISO **or** tested install script).
- [ ] Hardware repo is pushed to a remote.
- [ ] Test suite green and reproducible (W0).
