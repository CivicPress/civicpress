---
title: CivicPress Transcription Service (BroadcastBox W2) — Design
status: design (decided 2026-06-23 — see §10)
date: 2026-06-20
related:
  - docs/specs/2026-06-20-broadcast-box-architecture-design.md (parent)
  - docs/plans/2026-06-18-base-refactor-phase-4-broadcast-box-hw.md (§3 W2)
---

# CivicPress Transcription Service (W2) — Design

> Design draft. Reframes Phase 4 W2 (BB-HW-003) from "AI on the appliance" to a
> **separate, optional** service. Parent architecture:
> `docs/specs/2026-06-20-broadcast-box-architecture-design.md`.

## 1. Role & boundary

A standalone worker that turns a captured meeting's **A/V into a transcript** and
a **draft set of structured minutes**, written back onto the meeting's `session`
record. Hard boundaries:

- **NOT in CivicPress core.** Core stays the source of truth for civic documents;
  it does not crunch media. The service talks to core through the **records API**
  (validation + audit + Git), never the DB directly.
- **NOT on the appliance.** The Pi captures and uploads; heavy AI runs here.
- **Optional + degrades gracefully.** If the service is absent/disabled/unhealthy,
  the **A/V is still public** — only the transcript/minutes are missing (or
  queued). The primary evidence is never blocked on AI.

```
[appliance] →A/V→ [CivicPress core: session record + A/V in storage]
                        │  (session has capture.av_file, no transcript yet)
                        ▼
              [Transcription service (optional worker)]
                pull A/V → engine (pluggable) → transcript + draft topics[]
                        │  write back via records API
                        ▼
              session: media.transcript set, topics[] (draft),
                       transcript_status: automated   → clerk review → adopted
```

## 2. What triggers work

A session "needs transcription" when it has `capture.av_file` but no
`transcript_status`. Options:

- **(A) Poll the records API** for such sessions (simple, decoupled, resilient).
- **(B) Event/hook** from core when an A/V attachment lands (lower latency; needs
  CP's hook/event surface, which is still maturing).
- **(C) Explicit job queue.**

**Recommendation:** start with **(A) polling** (a worker loop querying
`GET sessions?needs_transcription`), evolve to **(B)** when CP's hooks mature.
Polling is trivially restartable and needs no new core surface. A claimed-job
marker (e.g. `transcript_status: processing`) prevents double-work across
workers.

## 3. Pluggable engine interface

The service is engine-agnostic; the engine is config-selected.

```ts
interface TranscriptionEngine {
  name: string;
  available(): Promise<boolean>;               // health/precondition probe
  transcribe(input: { audioPath: string; language?: string; agenda?: string[] }):
    Promise<{
      language: string;
      segments: Array<{ start: number; end: number; text: string; speaker?: string }>;
      text: string;
    }>;
}
```

Backends:
- **`whisper-cpp` (default, self-hosted):** spawn a local `whisper.cpp` binary —
  a single native binary, no Python runtime, CPU-capable. Best fit for the
  "affordable / no vendor lock-in / data-sovereignty" ethos.
- **`http` (cloud or external self-hosted GPU box):** POST audio to a configured
  endpoint. Covers both a cloud API and a municipality's own GPU machine.
- **`noop`/absent:** engine unavailable → service inactive, A/V still public.

Speaker **diarization** is an optional engine capability (`segments[].speaker`);
absent engines just omit it. Engine choice + endpoint/keys come from CivicPress
config (secrets via the existing secrets manager).

## 4. Output / write-back (onto the `session` record)

- `media.transcript` → the transcript artifact (an `attached_files[]` entry).
- `topics[]` → **draft** structuring: align transcript segments to the session's
  **agenda items** (the agenda is the scaffold) — best-effort; populates
  `topics[].title`/`description`, leaves `votes[]`/`decisions[]` for human entry.
- `transcript_status: automated` (the trust label).
- `minutes_status` stays `draft` until a clerk reviews/adopts.
- An optional **audio version** (master-plan goal) can be a derived
  `attached_files[]` audio render — later increment.

All writes go through the records API as a `session` update (Git commit + audit).

## 5. `civic start` integration

`civic start` reads config; if `transcription.enabled` and an engine is
configured, it launches the worker as a managed child process alongside
core/api/ui. If disabled or the engine's `available()` is false, it logs and
**skips** — no hard failure. The worker has its own lifecycle (start/stop/health)
in the CLI process manager. Config sketch:

```yaml
transcription:
  enabled: true
  engine: whisper-cpp            # whisper-cpp | http
  whisper_cpp: { binary: whisper, model: base }
  http: { endpoint: "...", api_key_ref: "secret://transcription" }
  poll_interval_s: 30
```

## 6. Packaging (resolves the architecture doc's open question)

Options: (A) monorepo module, (B) separate sibling service, (C) container.

**Recommendation: a thin TS worker in the monorepo** (e.g.
`services/transcription/` or `modules/transcription/`), launched by `civic start`,
with the **pluggable engine** doing the heavy lifting (spawn `whisper.cpp`
binary, or HTTP to cloud/external). Rationale:
- `civic start` is the TS CLI — a TS worker plugs in natively.
- The heavy/native part (Whisper) lives behind the engine interface, so the
  service stays light and the model is swappable/updatable.
- **Containerizable** for deployment (the engine binary + model bake into an
  image); the container is the *distribution* form, not a separate architecture.

So: TS orchestration + pluggable engine backends + optional container. Not a
separate repo (keep it in the monorepo with the rest of `civic start`).

## 7. Trust, privacy, security

- Trust tiers (parent §6): A/V auto-public; transcript auto-public but **labeled**
  `transcript_status: automated`; structured minutes gated by clerk review.
- **Privacy:** council audio can include citizens → **self-hosted default**
  (`whisper-cpp`); cloud is opt-in. In-camera segments (`capture.segments[]`
  visibility) are **excluded** from transcription/publication.
- **Secrets:** cloud/HTTP engine keys via the secrets manager; never logged.

## 8. Scope

- **MVP:** poll → whisper-cpp transcript → `media.transcript` +
  `transcript_status: automated`; A/V already public.
- **Next:** agenda-aligned draft `topics[]`; diarization (speaker turns);
  audio-version render; event-driven trigger; clerk-review UI for adoption.

## 9. Open questions *(resolved 2026-06-23 — see §10)*
- `services/transcription/` vs `modules/transcription/` (module-contract fit).
- whisper.cpp model size vs the server resource floor (accuracy/latency tradeoff).
- The "needs transcription" query: a real API filter vs a derived scan.
- French-first (the Richmond data is `fr-CA`) — model/language defaults.

## 10. Decisions (2026-06-23 brainstorm)

Converged with the maintainer; this graduates the draft toward implementation.

- **Sequencing = contract-first.** Lock the session-record transcript contract,
  then build the worker against **fixture** session records — W2 stays decoupled
  (it polls the records API) and does **not** block on the deferred Phase-5
  device→session input pipeline. Real input wires in later.
- **Packaging = `services/transcription/`** (a plain worker managed by
  `civic start`), not a `modules/` module: it is a media→records *worker*
  (infrastructure), not a civic-records module, so it does not need the module
  contract's registration hooks. (Resolves §6 / §9.)
- **MVP scope = transcript-only.** poll → whisper.cpp (`fr-CA`) →
  `media.transcript` + `transcript_status: automated`, honouring **segment-level
  in-camera exclusion**. Agenda-aligned `topics[]`, diarization, and audio-render
  are the next increment.

### 10.1 Prerequisite — session-record schema *(corrected: it's a module extension, not core)*
The write-back target is ~80 % already present in CORE `session-schema.json`
(`topics[]`, `media.transcript`, `visibility`, `minutes_status`). The two W2
fields are NOT added to core — they are contributed by the **broadcast-box module
as a `session` schema extension** (`modules/broadcast-box/schemas/record-schema-extension.json`,
wired by `module.json` `capabilities.schemaExtensions: ["session"]`, merged onto
core's `session` via the module seam). They apply at runtime **only when
broadcast-box is enabled in CivicPress config `modules:`**.

**✅ Done (W2 Step 1, 2026-06-23):** the fragment (drafted in W0/W1) was relocated
from its `docs/specs/broadcast-box/` staging home into the module and wired; pinned
by `tests/core/broadcast-box-session-extension.test.ts` (merge semantics) + a module
wiring smoke test. The two fields:
- **`transcript_status`** (trust label): the shipped fragment currently has enum
  `automated | reviewed` (`automated` = auto-published unverified; `reviewed` =
  clerk-checked; **absence** = needs transcription). Reconciling this with the
  worker claim/fail states (`processing`/`failed`) is the first §10.3 sub-decision.
- **`capture` block** mirroring the protocol `session.manifest`:
  `{ device, av_file, started_at, ended_at, duration_s, segments: [{ start, end, visibility }] }`.
  **Segment-level `visibility` is civic-critical** — it is how the worker excludes
  in-camera portions from transcription/publication.

### 10.2 First slice (contract-first)
1. **Schema contract** — ✅ **done (2026-06-23):** relocated + wired the broadcast-box
   `session` extension (`capture` / `schedule` / `transcript_status`) into the module;
   merge semantics + wiring pinned by tests. (Applies only when broadcast-box is in
   config `modules:`.)
2. **Worker skeleton** (`services/transcription/`) — poll → claim
   (`transcript_status: processing`) → engine → write `media.transcript` +
   `transcript_status: automated`, all via the **records API** (Git + audit).
   In-camera segments excluded. Graceful skip when the engine is unavailable.
3. **Engine** — `whisper-cpp` (spawn the binary, `fr-CA`) behind the
   `TranscriptionEngine` interface; `http` + `noop` stubs.
4. **`civic start`** — launch when `transcription.enabled` + `available()`,
   else log-and-skip (no hard failure).
5. **Tests** — fixture sessions + mock engine: the poll→claim→write-back loop,
   in-camera exclusion, and graceful degradation (engine down → A/V still
   public, no write).

### 10.3 Sub-decisions (resolved 2026-06-23)
- **`transcript_status` enum = `automated | reviewed`, unchanged.** MVP is a
  SINGLE worker, so no claim marker: the *write* of `transcript_status` is the
  idempotency latch (§10.4). Worker `processing`/`failed` states are deferred to a
  multi-worker / retry-capping increment (a separate operational field, not this
  public trust label).
- **whisper.cpp model default = `small`** (multilingual, good `fr-CA` accuracy on
  proper nouns, CPU-runnable on a modest server); config-overridable (`medium` as a
  quality opt-in for capable hardware, `base` only for constrained boxes).
- **"needs transcription" = a derived scan** (GET sessions, filter for
  `capture.av_file` present && `transcript_status` absent) for MVP; a real API
  filter is a later optimisation.

### 10.4 Worker idempotency (single-worker MVP)
Re-running the worker is safe — idempotent in OUTCOME:
1. **The query is the gate.** "needs transcription" requires `transcript_status`
   ABSENT, so once written the session is never re-picked.
2. **One atomic write = the latch.** Write `media.transcript` + `transcript_status:
   automated` in a SINGLE records-API update. A crash *before* it leaves the session
   cleanly re-pollable (redoes the transcription); a crash *after* it leaves it done.
   No half-states.
3. **Deterministic engine.** whisper.cpp is deterministic for the same
   input/model/params, so even a redundant reprocess yields an identical transcript —
   no divergence.
4. **Re-read-before-write guard.** Just before writing, re-fetch the session; if
   `transcript_status` is now set (another worker finished), skip. A cheap optimistic
   check covering most concurrent double-pickup without a full claim protocol; the
   real claim marker arrives with multi-worker support.
