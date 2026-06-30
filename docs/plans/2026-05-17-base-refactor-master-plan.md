# CivicPress Base Refactor — Master Plan

**Date:** 2026-05-17
**Status:** signed off 2026-05-17 (open questions §9 resolved by user); execution begins with Phase 2a
**Author:** drafted by Claude Opus 4.7, in collaboration with the user
**Branch:** `main` (this plan lives on main; sub-phase work happens on feature branches off main)
**Anchor audit:** `audit/2026-05-16-manifesto-fit` branch (LOCAL ONLY); see `docs/audits/2026-05-16-manifesto-fit-audit.md` and `docs/audits/2026-05-16-manifesto-fit-findings.md` on that branch.

---

## 1. Context — why we're doing this

The manifesto-fit audit (Phase 0/1/2/3, completed 2026-05-17) surfaced **205 findings** across 14 audit surfaces — **20 Critical, 65 High, 79 Medium, 41 Low**. The core verdict on the project's stated flagship (broadcast-box) was:

> "The implementation approach is roughly right but the seams are wrong — recommend an architectural refactor, not cleanup."

But the broader audit verdict was bigger: **the platform is overclaimed and underwired**. The base (core, api, ui, storage, notifications) has the majority of the Criticals and structural-dishonesty findings. The flagship's seams are wrong partly because the base under them is also wrong.

The user's decision (2026-05-17 evening):

1. **Re-ground in the original CivicPress mission.** Public documents hard to find / democracy needs transparency / small organizations can't afford the corporate-only supply / breaks the corporate monopoly on democracy tools. That's manifesto §1-§3. Broadcast-box was a private ambition — "only I know about it" — that grew bigger than expected. The public narrative was never updated, so de-escalating its flagship status requires no public retraction; it requires *not promoting it* until it's ready.

2. **Fix the base in isolation, before adding flagship pressure back.** Pull broadcast-box out of the active development path. Fix core/api/ui/storage/notifications/cli/legal-register. Reintroduce realtime on a fixed base. Audit + fix the broadcast-box hardware repo. Then bring broadcast-box back into CivicPress through a clean interface.

3. **"Make truth true again."** The audit found structural dishonesty as a cross-cutting pattern: notification audit log hardcodes `success: true`, API stub routers return fake `200 OK`, project-status overclaims "100% Functional" for components with TODO stubs, manifesto §3.5 still names "Ledger" as flagship, the public site mirrors all of this to municipal evaluators. The refactor's spine is: *delete every false claim from the docs; close every false-claim-creating code path*.

This refactor is bounded. None of the findings are existential. With discipline, this is a quarter or so of focused work and the project comes out the other side honest, manifesto-aligned, and ready for genuine municipal pilots.

---

## 2. Strategic principles (the rules of this refactor)

1. **Truth first.** Every commit that closes a finding either (a) makes the code true to the claim, or (b) corrects the claim to match the code. No third option. Specifically: no "we'll update the docs later" PRs — the doc change ships with the code change.

2. **One phase at a time.** Phases have entry and exit criteria. No advancing on vibes. No starting Phase 3 because Phase 2c is "mostly done."

3. **Broadcast-box stays paused.** The WIP commit `47d0ff6` on the `broadcast-box` branch is preserved. No active development on broadcast-box (monorepo module OR hardware repo) during Phase 2 base refactor. Phase 4 reopens the hardware repo. Phase 5 reintroduces the monorepo module.

4. **Findings tracked from open → closed-with-commit-SHA.** Never delete a finding without enacting it. (The Jan-2025 `CLEANUP-AND-TEST-AUDIT-REPORT.md` was deleted in commit `1181c17` without enacting most of its findings — that pattern recurred even before the project knew it was a pattern. We name it and break it now.)

5. **Each phase produces a sub-plan and a commit that closes it.** The sub-plan goes in `docs/plans/`; the closure commit's message lists every finding closed by SHA.

6. **No new features outside the audit scope.** This is a refactor, not a feature push. New ideas go to a "post-refactor backlog" doc and wait.

7. **Public narrative syncs in Phase 2b.** Roadmap, manifesto §3.5, project-status, and the public site copy all get aligned at the same time, mid-refactor, before any external sharing of the new state.

---

## 3. Finding-tracking convention

The canonical tracker is `docs/audits/2026-05-16-manifesto-fit-findings.md` (currently on the audit branch). For the refactor, we **promote it to main** during Phase 0 (below) and extend each row with a `Status` column.

### Per-finding status values

- `open` — not yet started
- `triaged` — has an owner, has a sub-phase assigned, has an estimated effort
- `in-progress` — work is underway on a feature branch
- `closed-with-commit-SHA` — fixed in a specific commit on main; commit message lists the finding ID
- `wontfix-with-rationale` — explicitly declined; rationale documented (e.g., "deferred to v2.0", "covered by replacement system", "no longer applicable")
- `superseded-by-X` — replaced by a different finding/decision (link to the replacement)

### Per-finding commit message convention

Every commit that closes findings includes a footer:

```
closes: api-001, api-002, deps-001
```

This makes it trivially `grep`-able. A small shell script can verify "every closed finding in the registry has a real commit SHA."

### Anti-deletion rule

**No finding may be removed from the registry without enacting it.** Closed findings stay in the registry with their `closed-with-commit-SHA` status as audit-trail. Only after a future audit confirms the finding is no longer present in the code can the entry be archived (moved to `docs/audits/archive/`, not deleted).

---

## 4. Phase map

| Phase | Goal | Audit findings addressed | Estimated effort | Status |
|---|---|---|---|---|
| 0 | Plan promotion + finding tracker | Lift audit registry to main; add Status column | 0.5 day | NEXT |
| 1 | (Already done) Audit complete | All findings catalogued | — | DONE 2026-05-17 |
| 2a | **Bleed-stop:** Close all 20 Criticals + the deps/CVE backlog | All Criticals; deps-004 backlog | 1-2 weeks | pending |
| 2b | **Truth restoration:** Stop the structural dishonesty | api-004, notifications-001, cli-001, ui-005, broadcast-box-004, legal-register-001, notifications-007, site-001, site-002, BB-HW-008, plus roadmap/manifesto/project-status/site sync | 1-2 weeks | pending |
| 2c | **Foundation cleanup:** Delete-or-wire all orphaned subsystems | core-005/006, storage-001/003 (fix-side), broadcast-box-003/013, notifications-008/009/013/015, api-008, realtime-007/008, storage-009, plus the docs that claim these work | 1-2 weeks | pending |
| 2d | **Structural hardening:** God-files, type-safety, module contracts | core-008, api-009/013, ui-008/011, realtime-004 (partial — without broadcast-box code), legal-register-002/005, deps-009/010, ingest-005, site-006, plus the plugin contract layer | 2-3 weeks | pending |
| 3 | **Reintroduce realtime** with its findings fixed | realtime-001/002/003/005, plus boundary work to make `@civicpress/realtime` Yjs-only | 1-2 weeks | DONE (pending --no-ff merge to dev) — all 14 realtime-* findings closed; realtime-server.ts 3,581→1,495 LoC; report at `docs/audits/phase-3-closure-report.md` |
| 4 | **Audit + fix broadcast-box hardware** | All BB-HW-* findings; canonical protocol artifact; license; civic-artifact pipeline via the AI port | 2-3 weeks | **CONDITIONAL CLOSE 2026-06-30** — security/protocol/structural done (12/17 BB-HW closed); carry-forward: installer (BB-HW-009), audio-version (BB-HW-003), docs (BB-HW-014/016). See `docs/audits/phase-4-closure-report.md` |
| 5 | **Reintroduce broadcast-box to CivicPress** through the clean module contract | broadcast-box-* findings; ingest pattern as model for civic-artifact derivation | 2-4 weeks | **CONDITIONAL CLOSE 2026-06-30** — engineering scope done + proven hardware-free (15/22 bb closed); carry-forward: real-hardware capstone, audio-version (bb-002), records-UI (bb-015), narrative sync (bb-001). See `docs/audits/phase-5-closure-report.md` |

**Total estimated effort:** ~3-5 months of focused work, depending on pace and pilot pressures.

---

## 5. Phase definitions

### Phase 0 — Plan promotion + finding tracker (NEXT)

**Goal:** Make the audit findings actionable from main, without needing to switch to the audit branch.

**Scope:**
- Copy `docs/audits/2026-05-16-manifesto-fit-audit.md`, `docs/audits/2026-05-16-manifesto-fit-findings.md`, and `docs/audits/sections/*.md` from the audit branch to main.
- Extend the findings table with a `Status` column (default `open`).
- Add a `docs/plans/finding-tracking-convention.md` describing the convention in § 3.
- Write `docs/audits/2026-05-16-manifesto-fit-findings.md`'s "Phase 3 sensitive content summary" status: workspace-001 (timesheets moved) → `closed-with-no-commit` (filesystem move, not git).
- Commit on main. **Open question:** `--no-verify` for these audit-doc commits? Same as before — these are docs, the flaky-test hook is unrelated. User to confirm.

**Entry criteria:** Audit branch exists with all deliverables (DONE).

**Exit criteria:**
- Audit deliverables exist on main.
- Findings registry has a `Status` column.
- Tracking convention is documented.
- A single Phase 0 commit closes Phase 0 itself ("phase 0 complete; refactor unblocked").

**Effort:** 0.5 day.

---

### Phase 2a — Bleed-stop (the 20 Criticals + deps backlog)

**Goal:** Close every Critical-severity finding in the audit, plus the dependency CVE backlog.

**Scope (the 20 Criticals):**
- **api-001, api-002, api-003, api-004** — fix per-request CivicPress init; add upstream auth to validation/status routes; replace stub routers with `501 Not Implemented` or remove.
- **ui-001, ui-002, ui-003** — DOMPurify the markdown→v-html pipeline; decide Nuxt UI Pro v3 license posture (confirm-free upstream OR replace); add `<noscript>` fallback + plan SSR for public read paths.
- **storage-001, storage-002** — wire `QuotaManager.checkQuota` into upload paths; apply public-folder bypass to `/folders/:folder/files`.
- **notifications-001, notifications-002, notifications-003** — make audit log truthful (inspect actual delivery, write real `success`); inspect `validateRequest`/`checkRateLimit` returns; move PII sanitization off the template variable bag.
- **broadcast-box-002, broadcast-box-007** — these address broadcast-box but the *concept* applies pre-reintroduction: define the civic-artifact-derivation contract (deferred to Phase 4/5 for implementation); for the rate-limiter, since broadcast-box stays paused, this is a `wontfix-pending-reintroduction` for now and gets re-opened in Phase 5.
- **BB-HW-001, BB-HW-002, BB-HW-003** — same as above; these are hardware-repo Criticals deferred to Phase 4. License (BB-HW-002) is a 30-second fix and could be done now to unblock the manifesto open-source claim.
- **deps-001, deps-002, deps-003** — minor-version bumps for `simple-git`, `fast-xml-parser`, `handlebars`. Fast wins. Pair with `pnpm audit` to verify the bumps close the CVEs.

**Plus deps-004:** address the 140-advisory backlog with a staged update plan (likely 1-2 days of focused bump + test).

**Entry criteria:** Phase 0 complete.

**Exit criteria:**
- All 20 Critical findings status = `closed-with-commit-SHA` OR `wontfix-with-rationale` (e.g., broadcast-box ones deferred to later phases).
- `pnpm audit` returns 0 Critical advisories (Highs may remain but tracked).
- Dependabot or Renovate config added to `.github/` (closes deps-005).
- **Note on tests:** Per resolved §9.1, the pre-existing flaky tests (`lock-endpoints`, `database-integration session-mgmt`) are NOT fixed in this phase. `--no-verify` continues for code commits during the refactor. Test-suite repair gets its own dedicated session later.

**Effort:** 1-2 weeks.

**Sub-plan:** `docs/plans/<date>-base-refactor-phase-2a-bleed-stop.md` (to be drafted next).

---

### Phase 2b — Truth restoration (stop the structural dishonesty)

**Goal:** Every claim in the docs, the code, the spec, the site, and the public narrative is true. Every code path that fakes success or hides failure is fixed.

**Scope:**
- **api-004** — already covered in 2a if not fixed (stub routers).
- **notifications-001** — already covered in 2a.
- **cli-001** — 15 of 27 CLI test files are placeholders. Either implement real tests or delete the placeholders + their false coverage claim.
- **ui-005** — "80+ tests / 85% coverage" claim is 1 file / 32 cases / 0 component coverage. Honest revision.
- **broadcast-box-004** — `api.devices.test.ts` is fake. Either implement or delete + revise the claim. (Since broadcast-box is paused, "delete and document as a Phase 5 prerequisite" is the right move.)
- **legal-register-001, legal-register-006** — spec claims `status: stable, v1.0.0` for a module that's a 210-line schema file. Per resolved §9.4: **rewrite the spec to mark `legal-register` as "planned" / "v0.3+ scope"** — do NOT build the module in 2b. (Real-module build gets its own sub-phase later with priorities reviewed.)
- **notifications-007** — spec declares "stable v1.0.0" while implementation is broken in 3 ways (covered in 2a). Spec rewrite to honest status.
- **site-001** — public site repeats overclaims. Rewrite the hero, FAQ, roadmap copy to match reality.
- **site-002** — broadcast-box invisible on the site. Since broadcast-box is paused, this stays as-is (intentional) — close as `wontfix-by-phase-strategy`, will re-open in Phase 5 to add broadcast-box marketing once it's actually ready.
- **site-003** — site docs claim `@nuxt/ui-pro`; code uses free `@nuxt/ui`. Fix the docs.
- **BB-HW-008** — hardware repo `engineering-analysis.md` self-grades "Top 0.1% Senior Engineer / 95% production-ready". Delete or honestly rewrite. (Hardware repo is in Phase 4 scope; this finding is small enough to address now in 2b since it's a doc-only change.)
- **roadmap.md** — update to reflect: v0.2.x is NOT "stable production-ready"; the in-progress real state about the base; civicpress-ingest's role as the working migration/import tool; post-refactor v0.3.x goals **for the base**. **DO NOT mention broadcast-box as a flagship** (per resolved §9.3 — broadcast-box stays paused publicly until Phase 5 finalizes it).
- **manifesto.md** — **DO NOT edit** (per resolved §9.3). Keep §3.5 (Ledger) as-is until Phase 5 reintroduces broadcast-box properly. Original-intent framing (public documents, transparency, affordable, breaks corporate democracy-tools monopoly) is the public narrative for this refactor.
- **project-status.md** — honest revision **about the base only**. Remove "100% Functional" claims for components with TODO stubs. Remove "0 critical security vulnerabilities" (audit found 20). Replace test/coverage numbers with honest counts. Add a "Known issues" section pointing at the audit registry. **DO NOT introduce broadcast-box as flagship** — keep its description (if any) as a "planned future module" until Phase 5.

**Entry criteria:** Phase 2a complete (so the false-claim code paths are fixed in code, then we update docs to say so).

**Exit criteria:**
- Every doc in `docs/` makes claims that are either true OR explicitly marked as future ("v0.3.x goal").
- Roadmap, manifesto, project-status, site copy all aligned.
- Tests that pass-because-they-assert-nothing are either real or deleted.
- A single `make audit-truth-check` script (or similar) walks the registry + greps for stale doc strings.

**Effort:** 1-2 weeks.

---

### Phase 2c — Foundation cleanup (delete or wire orphaned subsystems)

**Goal:** Apply the "fake comprehensiveness" cleanup pattern systematically across the codebase. Every subsystem is either wired into a production code path OR removed.

**Scope (orphaned subsystems):**
- `core/src/saga/saga-recovery.ts` (core-004) — wire or delete.
- `core/src/saga/saga-metrics.ts` (core-005) — wire or delete.
- `core/src/cache/warming/cache-warmer.ts` (core-005) — wire (set `warming.enabled: true` somewhere meaningful) or delete.
- `core/src/cache/types.ts` `'hybrid'` strategy (core-006) — implement or remove from the type.
- `core/src/notifications/` vs `modules/notifications/` (core-010) — one source of truth.
- `modules/api/src/middleware/jwt-auth.ts` (api-008) — dead duplicate, delete.
- `modules/api/src/routes/{workflows,hooks,export,import}.ts` (api-004 follow-up) — already addressed in 2a, verify gone.
- `modules/storage/src/uuid-storage-service.ts` (storage-009) — legacy local-only service unused by production; delete.
- `modules/storage/src/lifecycle/lifecycle-manager.ts:archiveFile` (storage-003) — make it actually move the file, OR remove the method + the `OrphanedFileCleaner` workaround.
- `modules/storage/src/failover/storage-failover-manager.ts:checkProviderRecovery` (storage-004) — implement the probe or delete the interval.
- `modules/notifications/channels/email-channel.ts` (notifications-005/006) — delete; replace with one canonical EmailChannel in core.
- `modules/notifications/src/notification-queue.ts` (notifications-008) — wire or delete.
- `modules/notifications/src/notification-security.ts:validateWebhookSignature` etc (notifications-013) — delete (no webhook endpoint exists) OR add the webhook endpoint.
- `modules/realtime/src/realtime-server.ts:generateParticipantColor` (realtime-007) — delete.
- `modules/ui/app/composables/useRealtimeEditor.ts:MAX_RECONNECT_ATTEMPTS` (realtime-008) — delete.
- `modules/broadcast-box/src/websocket/command-handlers.ts` (broadcast-box-013) — defer to Phase 5 (whole broadcast-box module is paused).
- `modules/broadcast-box/src/websocket/protocol-adapter.ts` (broadcast-box-003) — defer to Phase 4/5.

**Entry criteria:** Phase 2b complete.

**Exit criteria:**
- Every orphaned subsystem is in `git log` as "deleted in commit X" OR has a wiring commit + a test that fails if the call site disappears.
- The audit-trail unification (core-001 + core-013) is done: one audit channel, owned by core, populated by sagas at the right point.
- The two-parallel-notifications split (core-010) is resolved.

**Effort:** 1-2 weeks.

---

### Phase 2d — Structural hardening (god-files, types, module contracts)

**Goal:** Decompose god-files. Restore type safety. Define the plugin/module contract that the manifesto §3.1 promises.

**Scope:**
- **God-file decomposition:**
  - `core/src/records/record-manager.ts` (1,420 LoC) → split by responsibility (core-008).
  - `core/src/database/database-service.ts` (1,577 LoC) → split.
  - `core/src/auth/auth-service.ts` (1,319 LoC) → split.
  - `modules/api/src/routes/records.ts` (1,459 LoC) → handler layer + service (api-013).
  - `modules/api/src/routes/users.ts` (1,443 LoC) → same.
  - `modules/ui/app/components/RecordForm.vue` (1,310 LoC) → `useRecordEditor` composable + slimmer shell (ui-008).
  - `modules/ui/app/components/FileBrowser.vue` (1,156 LoC) → split.
  - (Defer ingest's `cli.py` 3,927 LoC — Phase 4/5 since ingest is sibling-repo, not in base.)
  - (Defer realtime's `realtime-server.ts` 3,581 LoC — Phase 3, since the broadcast-box-code-removal happens then.)
- **Type-safety pass:**
  - Eliminate the 503 `as any` casts in `modules/api/src/` (api-009).
  - Eliminate the 208 `: any` annotations in `modules/ui/app/` (ui-011).
  - Eliminate the 80+ `as any` casts in `modules/storage/src/` (storage-015).
  - Make `: any` casts a lint error going forward.
- **Module contract:**
  - Remove the hardcoded `'legal-register'` from `core/src/records/record-schema-builder.ts:219-236` (legal-register-002).
  - Replace `process.cwd()`-based module discovery with a manifest + resolver pattern (legal-register-005).
  - Define and document the plugin/module contract: `docs/module-integration-guide.md` revisited.
  - Make `legal-register` a real module-by-example OR rename it `schema-extensions/legal/` (decision from 2b).
- **Dependency hygiene structural follow-up:**
  - Move cloud SDKs (`@aws-sdk/client-s3`, `@azure/storage-blob`, `@google-cloud/storage`) from direct to `optionalDependencies` (storage-006, deps-008).
  - Declare every imported package in its workspace's `package.json` (api-007, deps-010). Add a `pnpm install --shamefully-hoist=false` CI check.
  - Generate `docs/licenses.md` from `pnpm licenses ls` (deps-011).

**Entry criteria:** Phase 2c complete.

**Exit criteria:**
- No file over 800 LoC in core, api, ui (excluding `package-lock.json`, generated files, and explicit exceptions documented in a `docs/large-file-exemptions.md`).
- ESLint rule "no `as any` in core/api/ui" passes.
- `docs/module-integration-guide.md` describes how to write a CivicPress module from scratch (with `legal-register` or a new toy module as the worked example).
- `pnpm install --shamefully-hoist=false` works without breaking.
- `docs/licenses.md` exists and is regenerated in CI.

**Effort:** 2-3 weeks.

---

### Phase 3 — Reintroduce realtime (with findings fixed)

**Goal:** Bring realtime back into main with the realtime-* findings closed AND the broadcast-box-specific code removed from it.

**Scope:**
- Merge `broadcast-box` branch's `modules/realtime/` source into main, BUT excise the ~1,500 lines of broadcast-box device handling (legacy device-message handler at line 1533, status/source/ack processing at lines 1782-2330, the setter-injection methods).
- Fix realtime-001 (`checkConnectionLimits(userId=null)` bug).
- Fix realtime-002 (per-IP cleanup leak).
- Fix realtime-003 (collab edits must write back to Markdown — this requires designing a Yjs → Markdown serializer; see realtime-014 notes).
- Decide on realtime-005 (Yjs snapshot durability — ephemeral collaboration scratchpad with TTL, OR civic-record archive with versioning + signing + size limits).
- Update `TESTING.md` + `test-websocket.mjs` to match the binary y-protocols (realtime-006).
- Decide on the `record` vs `records` room-type aliasing (realtime, notes section).
- Delete dead code (realtime-007, realtime-008).

**Entry criteria:** Phase 2d complete. Module contract layer exists. Markdown round-trip story has a design.

**Exit criteria:**
- `modules/realtime/src/realtime-server.ts` is < 1,500 LoC (down from 3,581).
- All realtime-* findings closed.
- A test exercises the offline-edit-then-reconnect-and-sync scenario (manifesto resilience).
- A test exercises collab-edit-writes-back-to-Markdown.

**Effort:** 1-2 weeks.

---

### Phase 4 — Audit + fix broadcast-box hardware

**Goal:** The hardware repo is production-ready and the AI port (transcripts + audio + civic artifacts) is the manifesto path from media blob to civic record.

**Scope:**
- Set a license (BB-HW-002) — 30-second fix that the team has been deferring; this unblocks any pilot.
- Define and ship a **shared protocol-spec artifact** consumed by both repos (BB-HW-001, BB-HW-004, broadcast-box-010). JSON Schema or `.proto`. Generated types both sides.
- Sunset 2 of the 3 on-the-wire formats; canonicalise one.
- Civic-artifact pipeline (BB-HW-003 + broadcast-box-002 + the AI port — see `broadcast-box-ai-port` memory):
  - Wire the AI port into a documented pipeline: video → transcript → enhanced transcript → audio version → Markdown civic record (with timestamps, motion markers, attendee list, speaker turns).
  - Decide local-vs-remote AI (open question; affects vendor-lock-in posture).
  - Output must be ingest-compatible (the `civicpress-ingest` pipeline is the model — its job is exactly "produce Markdown civic records").
- Push the hardware repo to a git remote (workspace-003).
- Repository cleanup: `_work_bk/20260125-civicpress-broadcast-box copy/` removal, `civicpress-broadcast-box-backup/` cleanup (workspace-004), per-finding actions.
- Address all BB-HW-* findings.
- Documentation consolidation: 33 hardware-repo docs down to a maintainable core set.
- Real install path: ISO/USB appliance or at minimum a tested Ansible/Docker compose for a Pi-class device (BB-HW-009).

**Entry criteria:** Phase 3 complete. Realtime is stable without broadcast-box. The module contract layer (Phase 2d) is ready to receive a new module.

**Exit criteria:**
- Hardware repo has a license (BB-HW-002).
- Canonical protocol-spec artifact exists; both repos consume it; one format only.
- Recordings ship with a Markdown civic-record sidecar (and audio version) automatically.
- A clerk-installable path exists (ISO OR tested install script).
- Hardware repo is pushed to a remote.

**Effort:** 2-3 weeks.

---

### Phase 5 — Reintroduce broadcast-box to CivicPress

**Goal:** Broadcast-box is back inside the monorepo as a module, connecting through the clean module contract (Phase 2d), consuming the canonical protocol (Phase 4), and producing civic records through the AI-port pipeline (Phase 4) that flow into the records system.

**Scope:**
- Re-merge `modules/broadcast-box/` from the preserved `broadcast-box` branch into main — but through the clean interface, not by raw cherry-pick.
- Address remaining broadcast-box-* findings (those not addressed in earlier phases).
- Build the device-page UI redesign (the WIP that was paused in commit `47d0ff6`) but on the clean foundation — likely a simpler design once the seams are right.
- Update the public site (site-002) to introduce broadcast-box as a flagship.
- Update roadmap.md + project-status.md to reflect broadcast-box's now-real status.
- Update the manifesto to acknowledge broadcast-box as a flagship.

**Entry criteria:** Phase 4 complete.

**Exit criteria:**
- A municipality can install CivicPress + broadcast-box hardware and capture a council meeting end-to-end, producing a Markdown civic record + media + transcript + audio version, all viewable in the public records UI.
- All broadcast-box-* findings closed.
- Public site, roadmap, manifesto all true to the new reality.

**Effort:** 2-4 weeks.

---

## 6. Branch strategy

- **`main`** — canonical state. This refactor plan lives here. Each phase ends in a PR merged to main.
- **`audit/2026-05-16-manifesto-fit`** — stays local, reference only. Memory points at it. After Phase 5 ends and a fresh audit is run, this branch can be archived.
- **`broadcast-box`** — preserved as-is with its WIP commit `47d0ff6`. No active development. Becomes the source for Phase 5's reintroduction.
- **Refactor sub-phase branches:**
  - `refactor/phase-0-plan-promotion`
  - `refactor/phase-2a-bleed-stop`
  - `refactor/phase-2b-truth-restoration`
  - `refactor/phase-2c-foundation-cleanup`
  - `refactor/phase-2d-structural-hardening`
  - `refactor/phase-3-realtime`
  - `refactor/phase-4-hardware` (lives in `civicpress-broadcast-box` repo)
  - `refactor/phase-5-broadcast-box-reintroduction`

Each branch ends in a PR with: list of closed finding IDs in the description, before/after metrics where relevant, sign-off from the user.

---

## 7. Communication strategy (when to update what publicly)

Three audiences: contributors (GitHub), municipal evaluators (the public site + manifesto + roadmap), AI agents (CLAUDE.md + agent memories).

| Audience | Vehicle | Updated in | Triggered by |
|---|---|---|---|
| Contributors | GitHub README + CONTRIBUTING + ARCHITECTURE | Per-phase exit | Phase 2b primarily |
| Municipal evaluators | civicpress.io + manifesto/roadmap | Phase 2b | One coordinated push |
| AI agents | CLAUDE.md + `.claude/projects/.../memory/` | Per-phase exit | Memory updates as facts change |

The site, manifesto, and roadmap should NOT be updated piecemeal during the refactor. They get updated together in Phase 2b so the public narrative is internally consistent. Before Phase 2b, the public narrative stays as-is (already-overclaiming, but at least not changing).

---

## 8. Out of scope (NOT this refactor)

- **New features** beyond what the audit findings name. Ideas go to `docs/post-refactor-backlog.md` and wait.
- **Re-architecting the saga pattern.** The audit said it's structurally right; we keep it.
- **Migrating to Postgres.** SQLite stays the default. Postgres groundwork stays.
- **Re-doing the audit before the refactor ends.** The audit is the spec. A fresh audit after Phase 5 confirms or doesn't.
- **`civicpress-ingest` and `site` deep refactors.** Both are extension-scope; they get small targeted fixes (their specific findings) but no architectural change in this refactor.
- **Adding new modules.** legal-register stays as-is (schema-only) unless 2b's decision says otherwise; no new civic modules until Phase 5+.

---

## 9. Resolved questions (2026-05-17 user sign-off)

1. **`--no-verify` scope for refactor commits.** **RESOLVED: `--no-verify` stays in effect for the whole refactor**, including code commits. The pre-existing flaky tests (`lock-endpoints`, `database-integration session-mgmt`) are NOT fixed as part of this refactor; they get their own dedicated session later. Exit criteria for sub-phases must NOT include "full test suite passes without `--no-verify`."
2. **AI port: local vs remote.** **RESOLVED: deferred to a dedicated architecture session** before Phase 4 begins. Phase 4 is planned around the AI port as a black-box-with-known-output until that session resolves the architecture.
3. **Manifesto / public-narrative sync timing.** **RESOLVED: do NOT edit the manifesto now.** Keep focus on the original intent (public documents, transparency, affordable for small orgs, breaking the corporate monopoly on democracy tools) until broadcast-box is finalized in Phase 5. **Phase 2b scope is reduced accordingly**: honest revision of `project-status.md` + `roadmap.md` + site copy about the base only (test counts, coverage, security, functional status) — but NO mention of broadcast-box as flagship, NO manifesto edit, NO promoting broadcast-box on the site until Phase 5.
4. **Legal-register decision.** **RESOLVED: real module eventually, but priorities may be reviewed.** For Phase 2b: rewrite the spec to mark `legal-register` as "planned" rather than "stable v1.0.0" (truth restoration). For Phase 2d or later: the actual "build the module" work gets a separate sub-phase whose priority is reviewed against other phases.
5. **Pilot pressure.** **RESOLVED: none for now.** Take the time the work needs. No compressed schedule.

## 9b. Still-open questions (will be resolved as their phase approaches)

- **Site repo's relationship to monorepo.** Defer to Phase 2b decision time.
- **Long-term home for the audit branch.** Stay local until Phase 5 ends + a fresh audit confirms findings closed; THEN decide on archival vs publication.

---

## 10. Next concrete deliverable

After sign-off on this master plan: **`docs/plans/<date>-base-refactor-phase-2a-bleed-stop.md`** — the detailed, executable plan for Phase 2a using the writing-plans skill (bite-sized tasks, exact paths, no placeholders).

Estimated time to draft: 1 session.

---

## Appendix A — Why "Make truth true again" is the spine of this refactor

The user's phrase, said while authorizing this refactor. The audit's strongest cross-cutting pattern was structural dishonesty: documentation that doesn't match code, success claims that don't reflect outcomes, "stable v1.0.0" specs for modules that don't exist, test counts that exercise nothing, audit logs that hardcode `success: true`. Each of these is small in isolation; together they erode the manifesto's Trust principle at the foundation.

The refactor's discipline is: **for every code change, the doc change ships in the same commit. For every doc that overclaims, the code change OR the doc rewrite ships in the same commit. No "we'll update docs later."** That is the only way to make sure the public CivicPress and the actual CivicPress are the same project.

This refactor isn't about feature velocity. It's about the project being honest enough to deserve municipal trust. The democracy-supporting-AI-cooperating angle the user raised is real — but it lives downstream of basic honesty. Make truth true; the rest follows.
