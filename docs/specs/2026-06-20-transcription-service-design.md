---
title: CivicPress Transcription Service (BroadcastBox W2) — Design
status: design (draft)
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

## 9. Open questions
- `services/transcription/` vs `modules/transcription/` (module-contract fit).
- whisper.cpp model size vs the server resource floor (accuracy/latency tradeoff).
- The "needs transcription" query: a real API filter vs a derived scan.
- French-first (the Richmond data is `fr-CA`) — model/language defaults.
