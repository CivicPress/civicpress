---
title: BroadcastBox — Meeting Capture → Civic Record Architecture
status: design (draft)
date: 2026-06-20
related:
  - docs/plans/2026-06-18-base-refactor-phase-4-broadcast-box-hw.md
  - docs/plans/2026-06-18-base-refactor-phase-4-w1-protocol-artifact.md
  - docs/plans/2026-05-17-base-refactor-master-plan.md (§5 Phase 4/5)
  - core/src/schemas/record-type-schemas/session-schema.json (the type we extend)
---

# BroadcastBox — Meeting Capture → Civic Record (Architecture Design)

> Status: **design draft** from the 2026-06-19/20 architecture brainstorm. This
> is the source-of-truth for the BroadcastBox redesign. Nothing has shipped
> publicly, so existing code may be freely scrapped/refactored — there is **no
> backward-compat or wire-format migration to honor.**

## 1. Mission

Turn a **public meeting** into a **structured, verifiable, durable civic record**
— minutes-grade (who attended, what motions, how they voted, what was decided),
timestamp-linked to the audio/video, living as **Markdown in Git**: transparent,
diffable, permanent, vendor-neutral. If the AI is unavailable, the **A/V is still
public** — the primary evidence is never blocked.

## 2. Goals / non-goals

**Goals:** reliable capture in low-IT council chambers; A/V always public;
optional transcription/minutes; external live-stream when a jurisdiction requires
it; clerk-operated from CivicPress; trustworthy records (no AI masquerading as
authority); no vendor lock-in.

**Non-goals (MVP):** our own streaming platform/player; on-device AI; full
agenda/governance workflow; multi-room orchestration; structured auto-minutes
without human review; **wire-format back-compat** (greenfield protocol).

## 3. Components

```
[Appliance — headless Pi]          [CivicPress core]               [AI service — optional]
 capture A/V on cached schedule     CONTROL PLANE (clerk → CP UI)    pluggable engine:
 records the whole meeting even      SOURCE OF TRUTH (Git records)    local default / cloud opt-in
 with no internet ───── upload ───►  A/V storage + auto-publish       transcribe → labeled transcript
 restream to YouTube/FB/Twitch       EXTENDS `session` record    ◄──  → populate session topics[] (draft)
 NO local control UI                 serves public                    AI down ⇒ A/V still public
 (control via CP, dials out)         `civic start` boots core (+ AI service if configured)
```

### 3.1 Appliance (`civicpress-broadcast-box`, separate repo)
- **Dumb and reliable.** Capture A/V; encode (incl. Pi `h264_v4l2m2m`); upload.
- **Headless — no standalone control UI** (kill the `frontend/` control app →
  closes **BB-HW-017**). Minimal local surface only for **enrollment / network
  setup** (existing AP mode) + optional status LED / emergency-stop.
- **Dials out** to CivicPress over a WebSocket → no inbound ports.
- **Offline autonomy (control plane ≠ data plane).** The schedule is **pushed in
  advance**; the device starts AND stops the scheduled meeting on its cached
  schedule even with no connectivity, buffers locally, uploads when CP returns.
- **Restream** to an external RTMP provider — reuses existing
  `services/streaming/rtmp_service.py` (already multi-platform).

### 3.2 CivicPress core
- **Source of truth** for civic documents (Markdown in Git) — NOT a compute
  workhorse.
- **Control plane:** clerk operates the device through the CP UI; CP relays
  commands over the device's outbound WebSocket and pushes the schedule.
- **A/V storage + auto-publish** via the existing UUID storage + `attached_files`.
- **Extends the existing `session` record type** (see §4) — no new record type,
  no new subsystem.

### 3.3 AI / transcription service (separate, optional)
- A **separate service**, not in core. Boots with `civic start` **when
  configured**. If absent/down, A/V still publishes; transcription just doesn't
  happen (or queues).
- **Pluggable engine:** local (e.g. Whisper-class) default; cloud/external offload
  opt-in. Engine-agnostic interface.
- Consumes A/V + the session's agenda → produces a transcript and populates the
  session's `topics[]` as a **draft**. Built fresh — do NOT use
  `civicpress-ingest` (private PDF→.md demo-data helper).

## 4. Data model — extend the existing `session` record (decision: single evolving record)

**Decision (Option B):** one meeting = **one `session` record**, updated
throughout its lifecycle. The clerk creates the session in advance with the
*ordre du jour* (agenda) + schedule; BroadcastBox captures against it; the **same
record** is then enriched with the recording, transcript, and minutes. Rationale:
the agenda becomes the scaffold the minutes/transcript are structured against
(agenda items → `topics[]`); the device deals with one record; and the file's Git
history becomes the meeting's civic audit trail (agenda → A/V → draft minutes →
adopted). If a jurisdiction later needs the agenda and minutes as
independently-adopted, separately-citable documents, CivicPress's
**linked-records system** lets us split B → linked records without redesign
(splitting out is non-breaking; merging would not be).

**What `session` already provides** (`core/src/schemas/record-type-schemas/session-schema.json`):
`session_type` (regular/emergency/special), `date`, `duration`, `location`,
`attendees[]` {name, role, present, email}, `topics[]` →
`votes[]` {motion, result: passed|failed|tabled|referred, votes_for/against,
abstentions} + `decisions[]`, and `media` {livestream(uri), recording,
transcript, minutes, agenda}. Plus base: `status` (config enum:
draft → pending_review → under_review → approved → published → …),
`attached_files[]` on UUID storage.

**BroadcastBox extensions** — added via the broadcast-box module's manifest
`capabilities.schemaExtensions` (the legal-register pattern), NOT in core's
session schema, NOT as a new type:

```yaml
# existing session fields (date, location, attendees[], topics[], media{…}) … plus:
visibility: public            # public | in_camera   (gates publication AND livestream)
schedule:                     # the pre-meeting "event" state the device caches
  scheduled_start: 2026-06-09T19:00:00Z
  scheduled_end:   2026-06-09T21:00:00Z
  assigned_device: bb-001
capture:                      # recording provenance (A/V blob itself → attached_files[])
  device: bb-001
  av_file: <storage-uuid>
  started_at: …
  ended_at: …
  duration_s: 9000
  segments:                   # per-segment in-camera handling
    - { start: 0, end: 8400, visibility: public }
    - { start: 8400, end: 9000, visibility: in_camera }
transcript_status: automated  # automated | reviewed     (trust label)
minutes_status: draft         # draft | under_review | adopted
```

**Status lifecycle (one record):**
`scheduled` → `recording` → **`published`** (A/V public, immediately) with
`transcript_status: automated` once the transcript lands → clerk review →
`minutes_status: adopted`. `scheduled` and `recording` are **new status values
added via config** (status is config-driven — no code change). `visibility:
in_camera` keeps a record/segment out of publication and out of livestream.

## 5. Structured minutes — already modeled, we populate it

No new "minutes" entity. The structured minutes ARE the session's existing
`topics[] → {decisions[], votes[]}` plus `attendees[]`. The AI service fills these
as a **draft** (`minutes_status: draft`); a clerk reviews/corrects; adoption flips
`minutes_status: adopted`. Speaker turns / timestamps that link back to the A/V
live in the record body (Markdown) and/or `topics[]`.

## 6. Trust model (tiered by artifact)

| Artifact | Risk | Policy | Field |
|---|---|---|---|
| **A/V recording** | none — it *is* the evidence | **auto-publish** immediately | record `status: published` |
| **Transcript** | low *if labeled* | auto-publish, clearly labeled "🤖 automated, unverified" | `transcript_status: automated` |
| **Structured minutes** | catastrophic (fake motion) | draft → clerk review → adopted | `minutes_status` |

The meeting record goes public as soon as A/V is up (watch it + read the labeled
auto-transcript); the formal minutes are adopted later — matching civic reality
(minutes are typically adopted at the *next* meeting).

## 7. Control plane vs data plane

- **CP controls/manages:** schedule push, start/stop/pause/extend/cancel, mark
  in-camera, configure livestream, monitor via clerk preview (WebRTC).
- **Device executes/owns the data:** runs the cached schedule autonomously,
  records locally, uploads via the existing upload queue when CP is reachable.
- The clerk **preview** (WebRTC via CP) is monitoring — distinct from public
  livestream — and stays.

## 8. Live streaming (external restream only)

- Device pushes ONE extra RTMP output (FFmpeg already multi-outputs) to a
  configured external ingest on YouTube/FB/Twitch. We **delegate distribution,
  scale, player, archiving** to the provider.
- The public URL goes in `media.livestream` (field already exists).
- **Hard rules:** stream keys are secrets → stored encrypted (device already has
  Fernet credential encryption), pushed via the control plane, never logged.
  **`visibility: in_camera` ⇒ no livestream and no publication.**
- Sovereignty: the external stream is an optional compliance/convenience output;
  the A/V in CP remains canonical → no lock-in.

## 9. Wire protocol (the W1 artifact — greenfield)

One canonical JSON-Schema artifact (`packages/broadcast-protocol/`), consumed by
both repos (server binding completes in Phase 5). **No legacy migration:** define
the clean typed format and implement it; delete the old defensive multi-shape
parsing outright (nothing public depends on it). Message catalog:
- **schedule push** (CP → device): upcoming `session`s (schedule + agenda +
  visibility) the device caches for offline autonomy.
- **session manifest** (device → CP): which `session` an upload belongs to + the
  `capture` block (device, segments, timing).
- **A/V upload** (device → CP storage → `attached_files`).
- **stream control** (CP → device): configure/start/stop external restream
  (reuses existing `stream.*` commands).
- existing: status, ack, command/event, preview.*, device.connected.

## 10. What gets cut or changed

- **Extend `session`** — do NOT add `meeting`/`minutes` record types.
- **Kill the device control UI** (`frontend/`) → closes **BB-HW-017**; keep only
  enrollment/setup.
- **Greenfield protocol** — delete the three defensive wire shapes; no sunset
  dance (**BB-HW-004** trivially); dispatch table (**BB-HW-005**); reconnect
  consolidation (**BB-HW-006**); regenerate the 1,626-line protocol doc from
  schema (**BB-HW-001**/**014**).
- **AI moves OFF the appliance** → server-side optional service (reshapes
  **BB-HW-003**).
- **Do not use `civicpress-ingest`.**

## 11. Open questions (remaining)

- AI-service packaging: monorepo module vs sibling service vs container.
- Local transcription engine choice + server resource floor.
- Multi-room / multi-device per municipality (out of MVP).
- Exact `schedule`/`capture` field names (draft above) — finalize with the schema.

## 12. Mapping to plan / findings

- **CivicPress core:** extend `session` via module `schemaExtensions`; add
  `scheduled`/`recording` statuses (config); A/V auto-publish; control-plane relay
  + schedule push. (Intersects v0.4.x governance; ships incrementally.)
- **Phase 4 W1 (appliance↔CP protocol):** greenfield canonical artifact incl.
  schedule push + session manifest + A/V upload + stream control; dispatch table;
  reconnect consolidation; kill device UI. Closes BB-HW-001/004/005/006/017 (+014).
- **Phase 4 W2 → reframed:** the optional CivicPress transcription service that
  populates session `topics[]`. Reshapes BB-HW-003.
- **Phase 4 W3:** installer (unchanged).
- **Phase 5:** broadcast-box server module re-enters the monorepo, binds the
  protocol artifact, receives uploads, triggers the AI service, writes sessions.
- **Live streaming:** small — reuse `rtmp_service.py` + in-camera exclusion.

## 13. Minor findings surfaced during design

- `session-schema.json` references `docs/record-format-standard.md`, which
  **does not exist** (doc gap — write it or drop the reference).
- The imported demo `session` records carry a pathological quadruple-nested
  `metadata` block (ingest-import artifact) — data-quality cleanup, not urgent.
