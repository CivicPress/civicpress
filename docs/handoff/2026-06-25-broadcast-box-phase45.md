# BroadcastBox Phase 4/5 — session handoff

> ⚠️ **SUPERSEDED by `docs/handoff/2026-06-26-broadcast-box-integration-wired.md`** (kept for history).
>
> Written 2026-06-25, covering work committed through 2026-06-23. Feed this doc
> (or the short pointer prompt) to a new session to continue the work. Detail +
> file:line citations live in the auto-loaded project memory — read it first:
> `vm-and-remote-setup`, `broadcast-box-architecture`, `broadcast-box-w2-transcription`,
> `broadcast-box-enrollment-strategy`, `broadcast-box-hw-dev-env`,
> `no-push-to-main-until-audit-done`.

## The big picture
A BroadcastBox appliance captures meeting A/V → uploads it → CivicPress stores it as a
core `session` record (with a `capture` block) → an optional transcription service (W2)
transcribes the **public** audio (excluding in-camera segments) and writes the transcript
back onto the record. Civic data = Markdown-in-Git core records (the source of truth);
A/V is always public; AI is a separate, optional service that degrades gracefully.

## Repos / branches (all local; DO NOT push to origin/main — audit freeze)
- **Monorepo** `civicpress` (`/home/claude/civicpress/civicpress`), branch
  `refactor/phase-5-broadcast-box-server`.
- **HW repo** `../civicpress-broadcast-box`, branch `refactor/phase-4-enrollment-hardening`
  (backed up to private `CivicPress/BroadcastBox`; push only when asked).

## Done + committed (through 2026-06-23)
- **P5e** — enrollment one-time-semantics tests + device token `jti` rotation.
- **BB-HW-010** — header-only WebSocket auth (token off the URL query) + dropped the
  redundant `X-Device-Token` header (HW repo).
- **W1d** — collapsed 4 overlapping reconnect paths into one `ReconnectionManager` (HW repo).
- **W2 Step 1** — broadcast-box `session` schema extension (`capture`/`schedule`/
  `transcript_status`) wired as a module extension.
- **W2 Step 2** — the worker core, `@civicpress/transcription` (`services/transcription/`):
  poll → in-camera exclusion → atomic write + idempotency guard → graceful degradation.
- **Core serializer fix** (`41adfb1`) — `RecordParser.buildFrontmatter` now writes a record
  type's enabled module-extension fields to TOP-LEVEL frontmatter (was nesting them under
  `metadata:`). No-op unless a module is enabled; round-trip verified.
- **Upload→capture→record pipeline** (`7399058` + `e030049`) — a finalized A/V upload now
  emits `recording:complete` → `linkFileToSession` writes the `capture` block
  (`{ device, av_file }`) onto the session record, which is what W2's derived scan triggers
  on (`capture.av_file` present && `transcript_status` absent).

## Reality check
Most remaining pieces need a **runnable CivicPress + a whisper.cpp install** to finish
correctly — a lot is currently "code-complete + unit-tested, pending e2e." The dev VM has
ffmpeg but **no whisper.cpp**, and no easy core bootstrap. So don't build env-integration
code blind: if a piece can't be e2e-verified here, flag it or pick one that can.

## Candidate next steps (confirm before diving in)
1. **W2 Step 3 — real adapters + `civic start` wiring**
   (`docs/specs/2026-06-20-transcription-service-design.md` §10.2 step 3 / §10.5): a real
   `RecordsGateway` over `@civicpress/core` `RecordManager` + storage; the `whisper-cpp`
   engine; launch-or-skip in `civic start`. Best done with a runnable CivicPress + whisper.cpp.
2. **Segment / in-camera flow** — device `session.manifest` → `capture.segments` so W2 can
   exclude in-camera portions (civic-critical). Device-side (HW repo) + a server handler.
   Until this lands, only fully-public recordings are safe.
3. **Drop the `broadcast-session` SQL model** — the architecture's "sessions = core records"
   cleanup; a sizable `SessionController` refactor + a data-model decision (the maintainer's).
4. **e2e the pipeline** — device→upload→record + the W2 write-back against the running app.

## How to start
Read the memory + the W2 design doc (§10) + the architecture memory's "uploads/sessions
flow" section; confirm git state (`git log --oneline -12`; both trees clean); ask the
maintainer whether a runnable CivicPress + whisper.cpp is available this session; then
propose which step to tackle.

## Toolchain gotchas (also in memory)
- No `make`. The interactive `grep` is a **ugrep shim** — `unset -f grep` and use
  `/usr/bin/grep` for GNU behaviour.
- `pnpm install --no-frozen-lockfile`, and tolerate the typescript-vs-eslint peer warnings.
- Refactor commits use `--no-verify`.
- **broadcast-box must be in the CivicPress config `modules:`** for its schema extension to
  apply (the merge gates on `CentralConfigManager.getModules()`).
- HW repo tests run via `.venv-linux/bin/python -m pytest` (needs ffmpeg).
