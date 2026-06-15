# CivicPress Post-Refactor Backlog

**Created:** 2026-06-15
**Purpose:** The home for work deliberately deferred during the 2026-05 base
refactor — master plan §8 calls for exactly this file ("New ideas go to
`docs/post-refactor-backlog.md` and wait"). Nothing here blocks a refactor
phase; each item is a real future deliverable with a recorded disposition and
rationale.

This is a tracker, not a plan. When an item is picked up it graduates to a
`docs/plans/` sub-plan and its entry here is updated to point at it.

**Related trackers (deferred work tracked elsewhere — not duplicated here):**

- `docs/audits/2026-05-16-manifesto-fit-findings.md` — the 205-finding audit
  registry (the authoritative finding tracker).
- `docs/audits/known-test-issues.md` — the pre-existing test failures, owned by
  the dedicated test-suite-repair session (master plan §9.1). The 11
  currently-documented root-vitest failures (EmailChannel ×5, oauth ×4, DNS ×1,
  date-bomb ×1) live there, **not** in this backlog.
- `docs/large-file-exemptions.md` — files intentionally over the 800-LoC bar.

---

## Phase 3 (realtime) — deferred follow-ups

Source: `docs/audits/phase-3-closure-report.md` "Carry-forward" table. Triaged
2026-06-15 (the door-closing pass before Phase 4).

### 1. Collaborative edits as auditable Git civic events

**Disposition:** design-spike — needs a governance model before implementation.

**Why deferred:** Phase 3 shipped the W5-T11 user decision *"draft now, revisit
Git later"*. Collaborative writeback currently saves a **review-gated DB draft**
(`record_drafts.markdown_body`, authored `realtime-snapshot`); a Git commit is
produced only when a human **publishes** that draft. Promoting collaborative
edits themselves into auditable Git history — a `realtime-snapshot`-authored
commit, an opt-in auto-publish, or a draft-history branch — ties directly to the
manifesto's audit-trail / "make truth true" spine, but it needs a governance
design first (who authors, how review gates, how to avoid commit noise).

**Pointers:** `modules/realtime/src/rooms/record-room-handler.ts` carries the
`TODO(phase-3-followup)`; the design spec §6.2/§6.3 carry dated as-shipped
correction notes.

### 2. Richer collaborative-editor toolbar + interactive civic-ref node-views

**Disposition:** backlog (editor UX).

**Why deferred:** the TipTap + Yjs collaborative path ships functional but
minimal. A formatting toolbar and interactive civic-ref node-views
(hover / resolve / link-through) are UX polish, out of Phase 3 scope. A natural
companion to the Phase 5 broadcast-box UI work.

### 3. Browser end-to-end tests for collaborative editing

**Disposition:** backlog (dedicated test session).

**Why deferred:** Phase 3 integration tests drive simulated y-protocol clients,
which cover the wire protocol + server behavior. Real-browser E2E (two live
editors, cursor presence, reconnect UX) is a separate harness.

### 4. Multi-node realtime (Redis / shared-state adapter)

**Disposition:** backlog (future scaling option).

**Why deferred:** room Yjs state is per-process; single-node is the supported
topology (documented in `modules/realtime/DEPLOYMENT.md`). A Redis fan-out
adapter would allow horizontal scaling but is not needed for current
single-node deployments.

---

## Phase 3 (realtime) — accepted limitations (documented; may become work later)

Deliberate as-shipped decisions, not debt. Listed so they are not silently
forgotten if priorities change.

- **CREATE-path record-not-found placeholder.** When a collaborative writeback
  can't find the source record, the draft is seeded with `title = recordId`,
  `type = 'unknown'` — a pragmatic fallback so collaborative content is never
  dropped. A cleaner CREATE flow could replace it.
- **Block-level civic-refs round-trip inline-only.** `@civicpress/editor-schema`
  round-trips inline civic-refs; an own-line (block) civic-ref is not preserved
  as a block on collaborative round-trip. Documented schema limitation.

---

## Triaged + closed (no longer carry-forward)

- **Dead legacy `SnapshotManager` API removed** — 2026-06-15. The W4 row-based
  persistence API (`persist` / `loadLatest` / `loadLatestVerified` /
  `cleanupExpired`) fully replaced the legacy `createSnapshot` / `loadSnapshot` /
  `saveSnapshot` / `applySnapshot` / `deleteSnapshot` / `cleanupOldSnapshots`
  methods, the matching `SnapshotStorage` legacy methods, and the `Snapshot`
  interface. Verified zero production callers, then deleted; the realtime suite
  stayed green (127 passed / 1 skipped), build + lint clean.
