# @civicpress/transcription

The optional CivicPress **transcription worker** (BroadcastBox W2). It turns a
captured meeting's A/V into a transcript and writes it back onto the meeting's
`session` record. Separate + optional: if it's disabled or the engine is
unavailable, the A/V is still public — AI never blocks the primary evidence.

Design: [`docs/specs/2026-06-20-transcription-service-design.md`](../../docs/specs/2026-06-20-transcription-service-design.md) (§10 = the build decisions).

## What's here (Step 2 — the worker core)

Pure, fully-tested worker logic behind narrow contracts (`src/types.ts`):

- **`TranscriptionWorker`** (`src/worker.ts`) — one poll cycle:
  1. if the engine is unavailable → stay idle (A/V stays public);
  2. scan for sessions with `capture.av_file` and no `transcript_status`;
  3. exclude in-camera content (`computePublicRanges`), transcribe the public audio;
  4. **atomically** write `media.transcript` + `transcript_status: automated`,
     guarded by a re-read so re-runs are idempotent (design §10.4).
- **`TranscriptionEngine`** — pluggable backend; `NoopEngine` (always unavailable)
  is the no-engine-configured default.
- **`RecordsGateway`** — the worker's view of the records API (validation + Git +
  audit behind it). Faked in tests.

## Not yet wired (next step)

- A real `RecordsGateway` over `@civicpress/core`'s `RecordManager` + storage.
- A `whisper.cpp` `TranscriptionEngine` (model default `small`, `fr-CA`).
- `civic start` launch-or-skip (config `transcription.enabled` + `available()`).

## Scripts

```sh
pnpm --filter @civicpress/transcription test:run   # unit tests
pnpm --filter @civicpress/transcription build       # tsc -> dist
```
