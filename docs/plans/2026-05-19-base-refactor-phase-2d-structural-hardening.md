# Phase 2d Structural Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended, given the worktree-parallel opportunities) or superpowers:executing-plans for sequential stretches. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompose every monolithic file in the base; eliminate every untyped escape hatch; lock the plugin/module contract the manifesto §3.1 promises; pay off the storage-test debt deferred from Phase 2c.5.

**Architecture:** Five sequential workstreams on a single 2d branch. W0 (storage tests) clears carry-forward debt and gives a clean test baseline. W1 (module contract) locks the plugin interface so god-files that consume it can decompose against a stable contract — also satisfies Phase 3's entry criterion. W2 (god-files) is the bulk: 18 files with characterization tests pinning behavior before any split. W3 (type-safety) eliminates ~1,581 `: any` / `as any` casts across core+api+ui+storage with an enforced lint rule. W4 (deps hygiene) closes the small structural follow-up cluster.

**Tech Stack:** TypeScript (Node ESM), Vue 3 (SFC + composables), Vitest, pnpm workspaces. Patterns to reuse:
- `RecordManager.writeAudit` / `AuthService.writeAudit` (channel + fallback) — `core/src/records/record-manager.ts:130-165`, `core/src/auth/auth-service.ts:writeAudit` (introduced Phase 2c.5 T4)
- Canonical `AuditChannel` — `core/src/audit/audit-channel.ts`
- Canonical `EmailChannel` — `core/src/notifications/channels/email-channel.ts`
- `coreError` for typed errors — `core/src/errors/index.ts`

**Branch:** `refactor/phase-2d-structural-hardening` — to be cut off `dev`'s tip `834ded9` (post-Phase-2c.5-merge). **No push** per the master refactor branch policy (memory: `refactor-push-policy`).

**`--no-verify`:** approved per master plan §9.1 (memory: `refactor-no-verify-policy`).

**Anchor master plan:** `docs/plans/2026-05-17-base-refactor-master-plan.md` §5 Phase 2d.

**Parent closure:** `docs/audits/phase-2c.5-closure-note.md` (carry-forward: storage test breakage deferred to W0).

---

## Scope summary

**In scope (5 workstreams):**

| Workstream | What | Estimated effort |
|---|---|---|
| W0 | Storage test triage + rescue (28 failures across 10 files) | ~1 wk |
| W1 | Plugin/module contract: design + manifest+resolver + unhardcode legal-register + rename to `schema-extensions/legal/` + rewrite module-integration-guide.md | ~1-2 wks |
| W2 | Decompose 18 god-files (all core/api/ui files > 800 LoC + `cloud-uuid-storage-service.ts`) with characterization tests pinning behavior | ~4-6 wks |
| W3 | Eliminate ~1,581 `: any` / `as any` casts across core (441) + api (626) + ui (369) + storage (145); enforce `@typescript-eslint/no-explicit-any: error` | ~3-5 wks |
| W4 | Deps hygiene structural: cloud SDKs → `optionalDependencies`; declare all imports + `--shamefully-hoist=false` CI check; generate `docs/licenses.md` | ~3-5 days |

**Total realistic effort:** 9-14 weeks (master plan §5's 2-3 wk estimate was set against the original named subset).

**Out of scope (explicitly deferred):**

- `ingest-005` and `site-006` — listed in master plan §4 Phase 2d column but §8 declares ingest/site extension-scope. Per user direction during brainstorming, deferred to a future cross-repo follow-up phase.
- Building out legal-register as a real module — per §9.4, this is its own future sub-phase. W1 renames to `schema-extensions/legal/` and updates the spec; it does NOT build the module out.
- broadcast-box realtime-coupled code — handled in Phase 3.
- Cleaning up `core` god-files that aren't already >800 LoC (cli/ files all stay; not in §5's `core/api/ui` LoC exit criterion).
- Pre-existing flaky tests (`lock-endpoints`, `database-integration session-mgmt`) — §9.1 says these get their own dedicated session later.

**Scope ambiguities resolved in this plan:**

1. **ui-002 (Nuxt UI Pro license).** Was `wontfix-pending-phase-N`; memory says "may promote earlier" to 2d. Included in W4 closure pass — final keep-free-v4 vs purchase decision goes to user at W4-T3.
2. **realtime-004 (partial — without broadcast-box code).** Master plan §5 mentions this; the realtime module has broadcast-box-specific code removed in Phase 3, not 2d. Default in this plan: defer realtime-004 entirely to Phase 3 if any part is broadcast-box-entangled. Inspection happens at W1-T1 readout.
3. **Test count target.** No fixed target — "no regression in passing count" is the rule. Currently 1195/1/19. Expected end: 1200-1300+ passing (characterization tests + W0 outcome variance).

---

## File Structure

**New files (estimated, by workstream):**

```
docs/
  audits/
    phase-2d-storage-test-triage.md       # W0-T1 output
    phase-2d-type-cast-inventory.md       # W3-T1 output
    phase-2d-closure-report.md            # Closure task output
  specs/
    module-contract.md                    # W1-T1 output (NEW canonical spec)
  module-integration-guide.md             # W1-T5 rewrite (overwrite of existing)
  large-file-exemptions.md                # NEW; populated only when W2 surfaces a legit case

tests/
  <workspace>/characterization/
    *.characterization.test.ts            # 18 files, one per god-file (W2)

core/src/modules/
  module-resolver.ts                      # W1-T2 NEW
  module-manifest.ts                      # W1-T2 NEW (types)

modules/schema-extensions/legal/          # W1-T4 (renamed from modules/legal-register/)
```

**Modified files (high-level):**

- `core/src/records/record-schema-builder.ts` — W1-T3 unhardcode (legal-register-002)
- `core/src/civic-core-services.ts` — W1-T2 + W1-T3 (replace `process.cwd()` discovery)
- All 18 god-files listed in W2 (decomposed into smaller files; original file usually stays as a thin re-export or barrel)
- `modules/storage/package.json` — W4-T1 (cloud SDKs to `optionalDependencies`)
- Per-workspace `package.json` — W4-T2 (declare all imports)
- `.github/workflows/*.yml` — W4-T2 (add `--shamefully-hoist=false` check), W4-T3 (regenerate licenses.md)
- ESLint config files — W3-T6 (enable `no-explicit-any: error`)

**Deleted files (estimated):**

- Possibly some stale storage test files from W0-T2 (per triage outcomes)
- `modules/legal-register/` directory — replaced by `modules/schema-extensions/legal/` via rename (not loss)

---

## Task Execution Order

```
W0 (storage triage)     →  W0-T1 → W0-T2 → W0-T3
W1 (module contract)    →  W1-T1 → W1-T2 → W1-T3 → W1-T4 → W1-T5
W2 (god-files)          →  W2 method primer (read once)
                            ├─ core/ batch (worktree-parallel): T1, T2, T3, T4
                            ├─ core/ sequential: T5 → T6 → T7
                            ├─ api/ batch (worktree-parallel after T5-T7): T11, T12
                            ├─ api/ sequential: T8 → T9 (T9 depends on T8); T10 (after T8)
                            ├─ ui/ batch (worktree-parallel): T13, T14, T15, T16, T17
                            └─ storage/: T18 (independent; can run alongside ui/ batch)
W3 (type-safety)        →  W3-T1 (analysis) → W3-T2 (patterns) → W3-T3 + T4 + T5 + T6 (worktree-parallel by surface)
W4 (deps hygiene)       →  W4-T1 → W4-T2 → W4-T3
Closure                 →  Final commit: closure note + registry update
```

**Parallel-dispatch policy (memory: `parallel-subagent-shared-branch-coordination`):**
- **Default: worktree isolation.** Coordinator creates worktrees (`git worktree add ../civicpress-2d-<task> refactor/phase-2d-structural-hardening`) for each parallel task; subagent commits in its worktree; coordinator pulls commits back via `git fetch <worktree-path> <branch>` then `git merge --ff-only`.
- If a batch declines worktree isolation: subagents `git add <specific-paths-only>` (never `git add -A` or `git add .`), never `git reset` (surface any pollution to coordinator), and the coordinator validates working-tree cleanliness between merges.

**TDD posture (settled at brainstorm Q7):**
- **Every god-file** gets a characterization test file BEFORE decomposition. Location: `tests/<workspace>/characterization/<file-name>.characterization.test.ts`.
- Characterization tests pin current behavior: input → output assertions, edge cases, error paths, observable side-effects. The point: "if I split this file and behavior drifts, this test fails."
- Characterization tests stay AFTER decomposition. They are the proof the split was behavior-preserving and serve as regression guards.
- W1 manifest+resolver work also gets characterization tests against current `process.cwd()` discovery before replacement.

---

## W0 — Storage Test Triage + Rescue

**Why first:** Carry-forward from Phase 2c.5 (28 failures across 10 files in `modules/storage/src/__tests__/`). Clearing this gives a clean test baseline before structural changes in W1/W2 might inadvertently touch storage. Also: some failures may surface real bugs that should land in the registry before W2 decomposition.

### W0-T1: Triage all 28 failures (analysis only)

**Files (output):**
- Create: `docs/audits/phase-2d-storage-test-triage.md`

**Inputs to read:**
- `modules/storage/src/__tests__/batch-operations.test.ts` (11 failures)
- `modules/storage/src/__tests__/streaming-operations.test.ts` (3 + 2 unhandled exceptions)
- `modules/storage/src/__tests__/timeout-utils.test.ts` (3)
- `modules/storage/src/__tests__/circuit-breaker.test.ts` (2)
- `modules/storage/src/__tests__/health-checker.test.ts` (2)
- `modules/storage/src/__tests__/retry-manager.test.ts` (2)
- `modules/storage/src/__tests__/storage-errors.test.ts` (2)
- `modules/storage/src/__tests__/lifecycle-manager.test.ts` (1)
- `modules/storage/src/__tests__/orphaned-file-cleaner.test.ts` (1)
- `modules/storage/src/__tests__/usage-reporter.test.ts` (1)
- The corresponding `src/` files each test exercises

- [ ] **Step 1: Capture full failure output**

Run: `pnpm -C modules/storage test 2>&1 | tee /tmp/phase-2d-storage-test-output.txt`
Expected: 28 failures + 2 unhandled exceptions documented in the output file. Verify total count matches the Phase 2c.5 closure (re-running may produce slightly different counts if flaky, but the 10-file set is stable).

- [ ] **Step 2: For each failing test, classify by inspection**

For each test, read (a) the test code, (b) the source-under-test, (c) the failure message. Classify into one of four categories:

| Category | Definition | Action |
|---|---|---|
| **stale** | The test asserts against a behavior the code no longer has (and the new behavior is correct). Test is wrong; code is right. | Rewrite the test OR delete with rationale |
| **real-bug** | The test asserts correct behavior; the code is wrong. The test caught a real bug. | Fix the code; keep test as regression guard |
| **mock-drift** | The test's mocks no longer match the real dependency's signature (e.g., new optional arg, renamed method). Behavior may be unaffected; test fails on type/call-shape. | Update the mock |
| **schema-drift** | The test depends on a DB schema or fixture that's diverged from current state. | Fix migration or fixture; update test if needed |

If a test fits multiple categories: pick the dominant one + note the secondary in the doc.

- [ ] **Step 3: Write the triage report**

Create `docs/audits/phase-2d-storage-test-triage.md` with this structure:

```markdown
# Phase 2d Storage Test Triage

**Sub-phase:** 2d (Structural Hardening) — W0 Task 1
**Date:** <ISO date>
**Carry-forward source:** Phase 2c.5 closure note §"What was deferred"
**Failure count at intake:** 28 across 10 files + 2 unhandled exceptions

## Summary table

| File | Test name | Failure category | Recommended action | Notes |
|---|---|---|---|---|
| batch-operations.test.ts | <test 1 name> | <category> | <action> | <reason / linked finding ID> |
| ... | ... | ... | ... | ... |

## Per-category counts

- **stale:** N
- **real-bug:** N
- **mock-drift:** N
- **schema-drift:** N
- **Total:** 28

## Identified real bugs (if any)

For each `real-bug` row, surface as a new registry entry:
- `phase-2d-storage-bug-<N>` — <short description> — <severity: Critical/High/Medium/Low>
- Add row to `docs/audits/2026-05-16-manifesto-fit-findings.md` with `open` status

## Recommended action sequence

For W0-T2 execution:
1. `stale` tests: review for deletion vs rewrite per case
2. `mock-drift`: update mocks (lowest-risk; no behavior change)
3. `schema-drift`: fix migrations / fixtures
4. `real-bug`: fix code, keep tests as regression guards
```

- [ ] **Step 4: Commit the triage report**

```bash
git add docs/audits/phase-2d-storage-test-triage.md
git add docs/audits/2026-05-16-manifesto-fit-findings.md  # if new bug rows added
git commit -m "refactor(2d W0-T1): triage 28 storage test failures from Phase 2c.5 carry-forward

Read each of the 28 failures + 2 unhandled exceptions across 10 test
files in modules/storage/src/__tests__/. Classified per the brainstorm-
defined rubric (stale / real-bug / mock-drift / schema-drift).

Per-category counts: <N stale> / <N real-bug> / <N mock-drift> / <N schema-drift>

Real bugs (if any) added to findings registry as phase-2d-storage-bug-N
entries (open). Recommended action sequence captured for W0-T2."
```

### W0-T2: Act per category

**Files (modified — varies by triage outcomes):**
- `modules/storage/src/__tests__/*.test.ts` — per-test actions
- `modules/storage/src/*.ts` — code fixes for `real-bug` cases
- `modules/storage/src/migrations/*` or fixtures — for `schema-drift`

Execute per the triage doc, lowest-risk first. Recommended order:

- [ ] **Step 1: `mock-drift` updates** — update mocks to match current signatures. Run `pnpm -C modules/storage test` after each file; expect those tests to pass.

- [ ] **Step 2: `schema-drift` fixes** — fix migrations or fixtures; rerun.

- [ ] **Step 3: `stale` test cleanup** — delete (with one-line rationale in the deleted-test commit) or rewrite. Each deletion gets a row in the triage doc's "Deleted tests" section with rationale.

- [ ] **Step 4: `real-bug` code fixes** — fix the actual bug; the test stays as regression guard. Each fix becomes its own commit referencing the bug ID from W0-T1.

- [ ] **Step 5: Run full storage test**

Run: `pnpm -C modules/storage test`
Expected: 0 failures.

- [ ] **Step 6: Run full repo test**

Run: `pnpm test --run 2>&1 | tail -20`
Expected: baseline + delta. Single §9.1 flake unchanged.

- [ ] **Step 7: Commit each category as its own commit**

Group commits by category for grep-ability:
```
refactor(2d W0-T2 mock-drift): update mocks in <files>
refactor(2d W0-T2 schema-drift): fix <migration/fixture>
refactor(2d W0-T2 stale-cleanup): delete/rewrite <N> stale tests
refactor(2d W0-T2 real-bug): fix <bug-id> <short description>
```

Real-bug commits include `closes: phase-2d-storage-bug-<N>` footer.

### W0-T3: Close W0

**Files:**
- Modify: `docs/audits/phase-2d-storage-test-triage.md` — append "Closure" section
- Modify: `docs/audits/2026-05-16-manifesto-fit-findings.md` — flip real-bug rows to `closed-with-commit-SHA`

- [ ] **Step 1: Final verification**

Run: `pnpm -C modules/storage test && pnpm -C modules/storage build && pnpm test --run 2>&1 | tail -5`
Expected: storage 0 failures; build clean; repo test count = baseline + N (no regressions).

- [ ] **Step 2: Append "Closure" section to triage doc**

Include: actual outcome per category, total test count delta in storage, any registry updates.

- [ ] **Step 3: Commit closure**

```bash
git add docs/audits/phase-2d-storage-test-triage.md docs/audits/2026-05-16-manifesto-fit-findings.md
git commit -m "refactor(2d W0-T3): close W0 storage test triage + rescue

28 carry-forward failures from Phase 2c.5 resolved:
- N stale tests: <deleted | rewritten>
- N mock-drift: mocks updated
- N schema-drift: migrations/fixtures fixed
- N real-bug: code fixed (closes phase-2d-storage-bug-<IDs>)

Storage test suite: 0 failures. Repo test count delta: +N / -N.

W0 complete. Test baseline clean for W1 onward."
```

---

## W1 — Module Contract + Legal-Register Rename

**Why:** Phase 3 (Reintroduce realtime) entry criterion requires the module contract to exist. Decomposition in W2 of files that consume modules (e.g., `record-schema-builder.ts`) is safer once the contract is stable. Closes `legal-register-002`, `legal-register-005`, plus the plugin-contract design owed since manifesto §3.1.

### W1-T1: Design the plugin/module contract (spec only)

**Files (output):**
- Create: `docs/specs/module-contract.md`

**Inputs to read:**
- Current state of `modules/legal-register/` — only existing module-shaped thing in the repo
- `core/src/civic-core-services.ts:262-310` — current module discovery logic
- `core/src/records/record-schema-builder.ts:170-240` — current schema-extension merge logic
- The manifesto §3.1 (the promise this contract fulfils)

- [ ] **Step 1: Read and inventory the current module shape**

Run: `find modules/legal-register/ -type f \( -name "*.ts" -o -name "*.md" -o -name "*.json" \)`
Read each. Capture: what does legal-register actually contribute? Schema fragments only, or anything more?

- [ ] **Step 2: Read the consumers**

Read `core/src/civic-core-services.ts` (module-discovery section, lines 262-310 in current `dev` state) and `core/src/records/record-schema-builder.ts` (the `moduleName === 'legal-register'` check at line 224 and the merge logic around it).

- [ ] **Step 3: Draft the contract**

`docs/specs/module-contract.md` structure:

```markdown
# CivicPress Module Contract — Specification

**Status:** stable v1.0.0 (after this commit)
**Authoritative for:** all CivicPress modules (`modules/*/`)
**Phase:** introduced in 2d Structural Hardening (W1-T1)

## 1. What a module is

A CivicPress module is a directory under `modules/` that opts in to the
platform through a `module.json` manifest. Modules MAY contribute:
- Schema extensions (record-type fragments)
- Route handlers (Express routers)
- Audit-channel consumers (subscribers)
- Lifecycle hooks (init / shutdown)
- CLI commands

Modules MUST NOT:
- Reach into `core/src/` internals
- Modify the manifest of another module
- Bypass the resolver to find sibling modules

## 2. The `module.json` manifest

\```json
{
  "$schema": "https://civicpress.io/schemas/module.schema.json",
  "name": "schema-extensions/legal",
  "version": "0.3.0",
  "kind": "schema-extension" | "module",
  "description": "...",
  "license": "...",
  "capabilities": {
    "schemaExtensions": ["bylaw", "ordinance", "policy"],
    "routes": false,
    "audit": false,
    "cli": false,
    "lifecycle": false
  },
  "entry": "./index.ts",
  "dependencies": []
}
\```

(Full JSON schema published at `core/src/modules/module.schema.json`.)

## 3. Lifecycle (for `kind: "module"`)

(Define the init/register/shutdown contract.)

## 4. Schema extensions (for `kind: "schema-extension"`)

(How schema fragments are declared and merged. Reference `legal/` as worked example.)

## 5. Discovery: ModuleResolver

(How CivicCore finds modules — no `process.cwd()`. Configured registry path
in `.civicrc` or `CivicPressConfig`. Each module is loaded via its manifest.)

## 6. Versioning + dependency declaration

(How modules declare deps on other modules; how CivicCore validates.)

## 7. Backward compatibility

The existing `modules/legal-register/` directory is renamed in W1-T4 to
`modules/schema-extensions/legal/` to signal its `kind: "schema-extension"`
status. The hardcoded `moduleName === 'legal-register'` check in
`record-schema-builder.ts` (introduced before this contract existed) is
removed in W1-T3 and replaced with manifest-driven merge.

## 8. What this spec is NOT

This spec is the **contract** — the interface modules speak to CivicCore.
It is NOT a tutorial. See `docs/module-integration-guide.md` for the
walkthrough.
```

- [ ] **Step 4: Write `core/src/modules/module.schema.json`**

The JSON schema for `module.json`. Validates manifests on load (catches typos, missing fields).

- [ ] **Step 5: Commit the spec**

```bash
git add docs/specs/module-contract.md core/src/modules/module.schema.json
git commit -m "refactor(2d W1-T1): design plugin/module contract spec

Defines the canonical Module/Plugin interface CivicCore speaks to
modules: module.json manifest format, lifecycle hooks, schema-extension
shape, discovery via ModuleResolver (no process.cwd()).

Spec is implementation-ready for W1-T2 (resolver + manifest), W1-T3
(unhardcode legal-register), W1-T4 (rename to schema-extensions/legal/),
W1-T5 (rewrite module-integration-guide.md).

Closes the manifesto §3.1 module-contract promise that's been open since
v0.1 — implementation lands across W1-T2 through W1-T5."
```

### W1-T2: Implement ModuleResolver + manifest loading

**Files (new):**
- `core/src/modules/module-manifest.ts` — `ModuleManifest` TypeScript types
- `core/src/modules/module-resolver.ts` — `ModuleResolver` class

**Files (modified):**
- `core/src/civic-core-services.ts` — replace `process.cwd()`-based discovery (line 289-300ish) with `ModuleResolver`
- `core/src/records/record-schema-builder.ts` — replace `process.cwd()`-based loading (line 188) with `ModuleResolver`

**Pre-decomposition test:** This isn't a god-file but the discovery logic has subtle behaviors. Write a characterization test BEFORE the swap.

- [ ] **Step 1: Write characterization test for current discovery behavior**

Create `tests/core/modules/discovery-characterization.test.ts`:
- Pin: what modules does the current discovery find at known fixture paths?
- Pin: order of discovery (alphabetical? filesystem order?)
- Pin: behavior when `module.json` is missing (current code may use directory presence)
- Pin: behavior when multiple discovery roots conflict
- Pin: integration: legal-register schema fragments are found and merged

Run: `pnpm vitest run tests/core/modules/discovery-characterization.test.ts`
Expected: green against current `process.cwd()` discovery (the test is written for current behavior).

- [ ] **Step 2: Define `ModuleManifest` types**

`core/src/modules/module-manifest.ts`:

```ts
export type ModuleKind = 'module' | 'schema-extension';

export interface ModuleCapabilities {
  schemaExtensions?: string[];     // record types this contributes
  routes?: boolean;
  audit?: boolean;
  cli?: boolean;
  lifecycle?: boolean;
}

export interface ModuleManifest {
  $schema?: string;
  name: string;
  version: string;
  kind: ModuleKind;
  description?: string;
  license?: string;
  capabilities: ModuleCapabilities;
  entry?: string;
  dependencies?: string[];
}

export interface LoadedModule {
  manifest: ModuleManifest;
  path: string;                    // absolute path to module directory
  schemaFragments?: Record<string, unknown>;
  // Other lazy-loaded fields populated by ModuleResolver as needed
}
```

- [ ] **Step 3: Implement `ModuleResolver`**

`core/src/modules/module-resolver.ts`:

```ts
export class ModuleResolver {
  private modulesRoot: string;     // resolved at construction; not process.cwd()
  private cache: Map<string, LoadedModule> = new Map();

  constructor(modulesRoot: string) {
    this.modulesRoot = path.resolve(modulesRoot);
  }

  async discoverAll(): Promise<LoadedModule[]> { /* scan modulesRoot/* for module.json */ }
  async loadByName(name: string): Promise<LoadedModule | null> { /* targeted load */ }
  async findBySchemaExtension(recordType: string): Promise<LoadedModule[]> { /* used by record-schema-builder */ }
}
```

Validation: each manifest validates against `module.schema.json` at load; invalid manifests throw `coreError.ModuleManifestInvalid` (add to `core/src/errors/index.ts` if not present).

- [ ] **Step 4: Wire `ModuleResolver` into civic-core-services.ts**

Replace the `process.cwd()`-based discovery block at `core/src/civic-core-services.ts:289-300` (verify exact line numbers in current state) with:

```ts
const modulesRoot = path.resolve(config.dataDir, '..', 'modules');
const moduleResolver = new ModuleResolver(modulesRoot);
container.singleton('moduleResolver', () => moduleResolver);
```

Update `core/src/records/record-schema-builder.ts:188` to use `moduleResolver.findBySchemaExtension(recordType)` instead of `process.cwd()` traversal.

- [ ] **Step 5: Re-run characterization test — expect green**

Run: `pnpm vitest run tests/core/modules/discovery-characterization.test.ts`
Expected: same green outcome as in Step 1 (behavior preserved through resolver swap).

- [ ] **Step 6: Full core test + build**

Run: `pnpm -C core test --run && pnpm -C core build`
Expected: pass count = baseline + characterization-test additions; build clean.

- [ ] **Step 7: Commit**

```bash
git add core/src/modules/ tests/core/modules/discovery-characterization.test.ts
git add core/src/civic-core-services.ts core/src/records/record-schema-builder.ts
git commit -m "refactor(2d W1-T2): implement ModuleResolver, replace process.cwd() module discovery

New: core/src/modules/{module-manifest.ts, module-resolver.ts}.
ModuleResolver loads module.json manifests from a configured root
(not process.cwd()), validates against module.schema.json, caches
loaded modules.

Replaced process.cwd()-based discovery at:
- core/src/civic-core-services.ts (the main discovery loop)
- core/src/records/record-schema-builder.ts:188 (schema-extension lookup)

Characterization tests at tests/core/modules/discovery-characterization.test.ts
pinned current discovery behavior BEFORE the swap; same tests pass after.

Closes legal-register-005."
```

### W1-T3: Unhardcode `legal-register` in record-schema-builder

**Files (modified):**
- `core/src/records/record-schema-builder.ts:217-236` — remove the `moduleName === 'legal-register'` check; use manifest-declared `schemaExtensions` list

- [ ] **Step 1: Sanity check — confirm the hardcode is still there**

Run: `grep -n "moduleName === 'legal-register'" core/src/records/record-schema-builder.ts`
Expected: one match at ~line 224 (or wherever post-W1-T2 state put it).

- [ ] **Step 2: Read the current behavior**

What does the hardcoded check decide? Most likely: "if module name is legal-register, merge its fragments into bylaw/ordinance/policy record types." That decision should now come from the module's manifest.

- [ ] **Step 3: Replace the check**

Manifest-driven version: iterate all loaded modules; for each, merge its `manifest.capabilities.schemaExtensions` declarations into the matching record types.

- [ ] **Step 4: Ensure legal-register's manifest declares the right extensions**

In `modules/legal-register/module.json` (still at the old path pre-W1-T4):

```json
{
  "kind": "schema-extension",
  "name": "legal-register",
  "version": "0.3.0",
  "capabilities": {
    "schemaExtensions": ["bylaw", "ordinance", "policy", "resolution", "act"]
  },
  ...
}
```

(Use the actual list of types currently hardcoded in `record-schema-builder.ts:217-236` — whatever the comment "applies to bylaw, ordinance, policy, etc." actually expands to in code.)

- [ ] **Step 5: Run record-schema-builder tests**

Run: `pnpm vitest run tests/core/records/`
Expected: pass count unchanged. Behavior preserved (hardcoded list now comes from manifest).

- [ ] **Step 6: Run full repo test**

Run: `pnpm test --run 2>&1 | tail -10`
Expected: no regressions.

- [ ] **Step 7: Commit**

```bash
git add core/src/records/record-schema-builder.ts modules/legal-register/module.json
git commit -m "refactor(2d W1-T3): unhardcode legal-register, manifest-driven schema merging

Removed the moduleName === 'legal-register' check from
core/src/records/record-schema-builder.ts:224. Replaced with iteration
over loaded modules; each module declares its applicable record types
in module.json's capabilities.schemaExtensions field.

legal-register's module.json now declares the same list that was
previously hardcoded (bylaw, ordinance, policy, resolution, act —
matches the comment's 'applies to bylaw, ordinance, policy, etc.').

Future modules can add their schema extensions to any record type
without core code changes.

Closes legal-register-002."
```

### W1-T4: Rename `modules/legal-register/` → `modules/schema-extensions/legal/`

**Why:** Signals the directory's `kind: schema-extension` status (per the contract spec). The "real module-by-example" build-out is deferred per §9.4 to a future sub-phase; this rename is the §5 alternative.

**Files (renamed/moved):**
- `modules/legal-register/` → `modules/schema-extensions/legal/` (entire directory)
- All imports referencing `@civicpress/legal-register` (if package name is changed) OR the directory path

- [ ] **Step 1: Find all references to the old path/name**

Run:
```bash
grep -rn "legal-register" --include="*.ts" --include="*.json" --include="*.md" --include="*.vue" --include="*.yml" --include="*.yaml" . | head -50
```

Capture full list. Categorize: (a) directory path references, (b) package name references in `@civicpress/legal-register` style imports, (c) doc/comment references, (d) test fixtures.

- [ ] **Step 2: Decide on the package name**

Per the brainstorm answer (rename to `schema-extensions/legal/`): the npm package name in the workspace likely changes from `@civicpress/legal-register` to `@civicpress/schema-extensions-legal` (or similar). Update `modules/legal-register/package.json`'s `name` field accordingly. Update `pnpm-workspace.yaml` if it references the path.

- [ ] **Step 3: Use `git mv` for the directory**

```bash
mkdir -p modules/schema-extensions
git mv modules/legal-register modules/schema-extensions/legal
```

`git mv` preserves history.

- [ ] **Step 4: Update all references**

Per the categorized list from Step 1:
- Update import paths in `.ts` files
- Update `package.json` `dependencies` / `devDependencies` lists that reference the old name
- Update doc references (most are illustrative; check the manifesto if it names legal-register — but per §9.3 manifesto stays untouched until Phase 5)
- Update test fixture paths

- [ ] **Step 5: Update `modules/schema-extensions/legal/module.json`**

Reflect the new name + path:

```json
{
  "name": "schema-extensions/legal",
  ...
}
```

- [ ] **Step 6: Re-run characterization + record-schema-builder tests**

Run: `pnpm vitest run tests/core/modules/ tests/core/records/`
Expected: same pass count as W1-T3 outcome. Module is now discovered at its new location.

- [ ] **Step 7: Full repo test + build**

Run: `pnpm install && pnpm test --run 2>&1 | tail -10 && pnpm -r build 2>&1 | tail -5`
Expected: tests pass; build clean. The `pnpm install` is needed because workspace paths changed.

- [ ] **Step 8: Commit**

```bash
git add -A modules/legal-register modules/schema-extensions/  # captures rename + new locations
git add core/ modules/ <other-updated-paths>
git commit -m "refactor(2d W1-T4): rename legal-register → schema-extensions/legal

modules/legal-register/ is a schema-only contribution (record-type
fragments), not a real module with routes/lifecycle/CLI. The rename
to modules/schema-extensions/legal/ signals its kind per the
W1-T1 module contract spec.

Updated references across the monorepo:
- Import paths
- package.json name + workspace deps
- Doc references (manifesto unchanged per §9.3)
- Test fixtures
- module.json name field

§9.4 resolution: building legal-register out as a real module (vs.
schema-extension) is deferred to a future sub-phase. This rename
makes the current truthful state visible: it's a schema extension.

The manifesto §3.5 'Ledger as flagship' and the legal-register
status references stay as-is until Phase 5's broadcast-box
reintroduction (per §9.3).

Closes the spec rewrite half of legal-register-001 + the rename
half of legal-register-006."
```

### W1-T5: Rewrite `docs/module-integration-guide.md`

**Files (modified):**
- `docs/module-integration-guide.md` — full rewrite

**Inputs:**
- `docs/specs/module-contract.md` (W1-T1 output)
- `modules/schema-extensions/legal/` (W1-T4 worked example)

- [ ] **Step 1: Read the current guide**

Run: `cat docs/module-integration-guide.md 2>/dev/null || echo "NO FILE — write from scratch"`

If it exists, capture its current claims (likely overclaiming what works pre-2d). If it doesn't, it's a write-from-scratch.

- [ ] **Step 2: Draft the new guide**

Structure:

```markdown
# CivicPress Module Integration Guide

> **Status:** authoritative as of Phase 2d (2026-05)
> **Companion to:** docs/specs/module-contract.md (the formal contract)
> **Worked example:** modules/schema-extensions/legal/

## 1. Decide: module or schema-extension?

| Question | If yes → | If no → |
|---|---|---|
| Does it contribute schema fragments to existing record types only? | `kind: schema-extension` | continue |
| Does it have route handlers, CLI commands, or lifecycle hooks? | `kind: module` | reconsider scope |

## 2. Create the directory

`modules/<your-name>/` for a module.
`modules/schema-extensions/<your-name>/` for a schema extension.

## 3. Write module.json (manifest)

(Full example, walking through every field.)

## 4. Schema extension: declare your record types

(Reference legal/ as worked example.)

## 5. Module: register with CivicCore

(Lifecycle hooks: init, register, shutdown.)

## 6. Routes (if module)

(How to contribute an Express router via the contract.)

## 7. Audit-channel consumption (if module)

(How to subscribe to AuditChannel events.)

## 8. CLI commands (if module)

(How to register CLI commands.)

## 9. Testing your module

(Pattern: pin behavior, integration test with ModuleResolver loading.)

## 10. Common pitfalls

(Don't reach into core/src; don't bypass ModuleResolver; etc.)
```

- [ ] **Step 3: Commit**

```bash
git add docs/module-integration-guide.md
git commit -m "refactor(2d W1-T5): rewrite module-integration-guide.md against new contract

Walks through writing a CivicPress module from scratch against the
W1-T1 contract spec. Uses schema-extensions/legal/ as worked example
for the schema-extension kind; describes route/CLI/audit-channel
contribution for full modules.

The pre-2d guide (if any) overclaimed module support before the
contract was actually designed. This rewrite is honest to current
post-2d state: ModuleResolver + manifest-driven discovery + typed
contract = real module support exists.

Closes the docs side of the manifesto §3.1 module-contract promise
that's been open since v0.1. W1 complete."
```

---

## W2 — God-File Decomposition

**Why this is the bulk:** 18 files totaling ~22,000 LoC. Decomposing each to ≤800 LoC means roughly tripling the file count for these surfaces — but improves locality, testability, and the LLM-context-fitness the user values (memory: file size matters for LLM reasoning).

### W2 Method Primer (read once before W2-T1)

**Per-file pattern (apply to every god-file task W2-T1 through W2-T18):**

1. **Read the file in full.** No partial reads — the seams aren't visible until you see all of it. (For files > 2,500 LoC use multiple `Read` calls with `offset`/`limit`.)

2. **Identify responsibilities.** A god-file usually has 3-7 cohesive responsibilities packed together. Name each. (For each Vue component: identify state, behaviors, render concerns. For each service class: identify the public methods grouped by purpose.)

3. **Write the characterization test.** Location: `tests/<workspace>/characterization/<file-name>.characterization.test.ts`. Cover:
   - Every public method / exported function: representative inputs → expected outputs
   - Every observable side-effect (DB writes, file I/O, audit-channel writes, hook firings)
   - Every error path (what does it throw? when?)
   - For Vue components: snapshot of rendered output for a representative prop set + emit assertions for user interactions
   
   Run the test; confirm green against current file. If something doesn't match what you expected, investigate before continuing.

4. **Plan the seams.** Choose decomposition boundaries that match the responsibilities from step 2. Each seam becomes one new file. Document the proposed seams in a `// SEAMS:` comment at the top of the god-file (will be removed at end of decomposition).

5. **Extract one seam at a time.** Move the code; update imports; keep the original file as a barrel re-export for backward compatibility (consumers don't change in this task).

6. **After each extraction:** run characterization test + existing tests + `tsc`. All green = next seam. Any red = stop, diagnose, fix before continuing.

7. **Final state:** original file ≤ 800 LoC (or in `docs/large-file-exemptions.md` with rationale). All seams ≤ 800 LoC. Public API of the original file unchanged (the barrel re-export preserves it).

8. **Commit.** One commit per god-file task (squash the per-seam intermediate commits if working in a worktree). Commit message lists the seams + LoC after split. Closes the relevant finding ID (e.g., core-008 for record-manager).

**Worktree-parallel batches (per Task Execution Order):**

When dispatching multiple W2 tasks in parallel:
- Coordinator runs: `git worktree add ../civicpress-2d-w2-t<N> refactor/phase-2d-structural-hardening` per task
- Each subagent works in its worktree; commits per the pattern above
- Coordinator pulls back: `cd /Users/stakabo/Work/repos/civicpress/civicpress && git merge --ff-only ../civicpress-2d-w2-t<N>` (if no overlap) or `git cherry-pick <SHA>` (if overlap exists)
- Coordinator runs `pnpm test` after each merge to catch cross-task regressions

**Common decomposition patterns:**

| File shape | Decomposition |
|---|---|
| Service class with many methods | Split by method group: `auth-service.ts` → `sessions.ts` + `tokens.ts` + `oauth.ts` + `rbac.ts` + thin orchestrator |
| Express router with many routes | Per-route-group handler files: `routes/records.ts` → `routes/records/{list, get, create, update, delete, search, ...}.ts` |
| Service-layer with mixed concerns | Split by domain: `records-service.ts` → `read.ts` + `write.ts` + `search.ts` + `normalize.ts` + shared `types.ts` |
| Vue SFC with large `<script setup>` | Extract composable: `RecordForm.vue` → `useRecordEditor.ts` (state + behaviors) + slimmer `<script setup>` + per-section sub-components |
| Cloud provider service | Split by provider: `cloud-uuid-storage-service.ts` → `s3-provider.ts` + `azure-provider.ts` + `gcs-provider.ts` + `common.ts` + orchestrator |

### W2 Task table (brief per-file specs)

For each, the format is: **File → LoC → proposed seams (final choice made by the executing agent based on actual code reading)**.

#### W2-T1: `core/src/utils/template-engine.ts` (1,154 LoC)

**Proposed seams:** lexer/tokenizer, parser, evaluator/renderer, helper-functions, error types.
**Target:** each ≤ 800 LoC; orchestrator = original file as barrel.
**Tests:** `tests/core/characterization/template-engine.characterization.test.ts`
**Existing coverage:** check `tests/core/utils/` for template tests; integrate.
**Finding:** new ID `phase-2d-godfile-template-engine`.

#### W2-T2: `core/src/diagnostics/checkers/database-checker.ts` (985 LoC)

**Proposed seams:** schema-presence checks, connection-health checks, integrity probes, reporter/formatter.
**Tests:** `tests/core/characterization/database-checker.characterization.test.ts`
**Finding:** new ID `phase-2d-godfile-database-checker`.

#### W2-T3: `core/src/search/sqlite-search-service.ts` (970 LoC)

**Proposed seams:** indexer, query-builder, ranker/sorter, FTS-glue, public API.
**Tests:** `tests/core/characterization/sqlite-search-service.characterization.test.ts`
**Finding:** new ID `phase-2d-godfile-sqlite-search`.

#### W2-T4: `core/src/database/database-adapter.ts` (923 LoC)

**Proposed seams:** connection lifecycle, statement preparation/cache, transaction handling, pragma/config, error mapping.
**Tests:** `tests/core/characterization/database-adapter.characterization.test.ts`
**Finding:** new ID `phase-2d-godfile-database-adapter`.

#### W2-T5: `core/src/database/database-service.ts` (1,577 LoC) — depends on T4

**Proposed seams:** migrations runner, audit-event recording (current `logAuditEvent` lives here per Phase 2c.5 T4 wire), query helpers per domain (records, users, audit, sessions, locks), schema operations.
**Tests:** `tests/core/characterization/database-service.characterization.test.ts`
**Finding:** new ID `phase-2d-godfile-database-service` (master plan §5 listed `database-service.ts → split` without naming a finding).

#### W2-T6: `core/src/records/record-manager.ts` (1,467 LoC) — depends on T5

**Proposed seams:** CRUD, audit (already partly extracted via `writeAudit` helper in Phase 2c T9), validation, parsing/serialization, git-integration, hooks-firing.
**Tests:** `tests/core/characterization/record-manager.characterization.test.ts`
**Finding:** `core-008` (master plan named).

#### W2-T7: `core/src/auth/auth-service.ts` (1,354 LoC) — depends on T5

**Proposed seams:** session management, token issuance/validation, OAuth provider integration, RBAC checks, audit (already partly extracted via `writeAudit` helper in Phase 2c.5 T4), email-validation-service relay.
**Tests:** `tests/core/characterization/auth-service.characterization.test.ts`
**Finding:** new ID `phase-2d-godfile-auth-service`.

#### W2-T8: `modules/api/src/services/records-service.ts` (1,760 LoC) — the biggest API surface

**Proposed seams:** read paths (list/get/search), write paths (create/update/delete), normalize utilities (date strings, etc.), validation, RecordsService thin orchestrator.
**Tests:** `tests/api/characterization/records-service.characterization.test.ts`
**Finding:** new ID `phase-2d-godfile-records-service`.

#### W2-T9: `modules/api/src/routes/records.ts` (1,459 LoC) — depends on T8

**Proposed seams:** per-route-group handler files (`routes/records/{list, get, summary, create, update, delete, search, history, attachments, locks}.ts`). After T8 the service is thin enough that routes are mostly thin handlers; this task makes that visible.
**Tests:** `tests/api/characterization/routes-records.characterization.test.ts` (HTTP-level tests via supertest)
**Finding:** `api-013` (master plan named).

#### W2-T10: `modules/api/src/routes/users.ts` (1,443 LoC) — depends on T8 (same RecordsService dependency pattern? probably has its own UsersService — verify at task time)

**Proposed seams:** per-route-group handler files (`routes/users/{list, get, create, update, delete, password, sessions, permissions}.ts`).
**Tests:** `tests/api/characterization/routes-users.characterization.test.ts`
**Finding:** new ID `phase-2d-godfile-routes-users`.

#### W2-T11: `modules/api/src/routes/diff.ts` (965 LoC) — independent

**Proposed seams:** record-diff handler, schema-diff handler, formatters (JSON/text/HTML), diff-strategy plug-points.
**Tests:** `tests/api/characterization/routes-diff.characterization.test.ts`
**Finding:** new ID `phase-2d-godfile-routes-diff`.

#### W2-T12: `modules/api/src/routes/uuid-storage.ts` (960 LoC) — independent

**Proposed seams:** upload handler, list handler, delete handler, metadata handler, storage-service glue.
**Tests:** `tests/api/characterization/routes-uuid-storage.characterization.test.ts`
**Finding:** new ID `phase-2d-godfile-routes-uuid-storage`.

#### W2-T13: `modules/ui/app/components/RecordForm.vue` (1,276 LoC)

**Proposed seams:** extract `useRecordEditor.ts` composable (state + actions); split form sections into sub-components (`RecordFormHeader.vue`, `RecordFormMetadata.vue`, `RecordFormBody.vue`, `RecordFormActions.vue`); slim shell.
**Tests:** `tests/ui/characterization/record-form.characterization.test.ts` (Vitest + @testing-library/vue snapshots + interaction tests)
**Finding:** `ui-008` (master plan named).

#### W2-T14: `modules/ui/app/components/storage/FileBrowser.vue` (1,156 LoC)

**Proposed seams:** extract `useFileBrowser.ts` composable; split view modes (`FileBrowserList.vue`, `FileBrowserGrid.vue`) + breadcrumb (`FileBrowserBreadcrumb.vue`) + actions toolbar.
**Tests:** `tests/ui/characterization/file-browser.characterization.test.ts`
**Finding:** new ID `phase-2d-godfile-file-browser`.

#### W2-T15: `modules/ui/app/components/GeographyForm.vue` (1,104 LoC)

**Proposed seams:** extract `useGeographyForm.ts` composable; split map/picker/list sub-components.
**Tests:** `tests/ui/characterization/geography-form.characterization.test.ts`
**Finding:** new ID `phase-2d-godfile-geography-form`.

#### W2-T16: `modules/ui/app/components/editor/RecordSidebar.vue` (935 LoC)

**Proposed seams:** per-panel sub-components (metadata, attachments, history, comments, ...), composable for shared state.
**Tests:** `tests/ui/characterization/record-sidebar.characterization.test.ts`
**Finding:** new ID `phase-2d-godfile-record-sidebar`.

#### W2-T17: `modules/ui/app/pages/records/[type]/[id]/index.vue` (935 LoC)

**Proposed seams:** route page → smaller layout + extracted composables for data-fetching and lifecycle.
**Tests:** `tests/ui/characterization/page-record-detail.characterization.test.ts`
**Finding:** new ID `phase-2d-godfile-page-record-detail`.

#### W2-T18: `modules/storage/src/cloud-uuid-storage-service.ts` (2,681 LoC) — the storage god-file

**Proposed seams:** split by provider into `providers/{s3, azure, gcs}-provider.ts` (each implements common `CloudProvider` interface); orchestrator handles common lifecycle/upload/download/retry/quota glue; metadata sub-service; lifecycle policies; usage reporter.
**Tests:** `tests/storage/characterization/cloud-uuid-storage-service.characterization.test.ts` (provider mocks; integration tests are out of scope here — they're in W0)
**Finding:** new ID `phase-2d-godfile-cloud-uuid-storage` (note: storage isn't in §5's LoC exit criterion, but per the brainstorm answer this file is in scope).

**Note on storage god-file:** Since storage tests were just triaged in W0, run the full `pnpm -C modules/storage test` after each seam extraction to catch any regression beyond what the characterization test covers.

### W2 closure task

After W2-T1 through W2-T18:

- [ ] **Step 1: Audit final LoC**

Run:
```bash
find core/src modules/api/src modules/ui/app modules/storage/src \
  \( -name "*.ts" -o -name "*.vue" \) ! -path "*/node_modules/*" \
  -exec wc -l {} \; | awk '$1 > 800' | sort -rn
```

Expected: empty OR every file listed has an entry in `docs/large-file-exemptions.md` with rationale.

- [ ] **Step 2: Populate `docs/large-file-exemptions.md` if needed**

For every file that's still > 800 LoC, add a row:
```markdown
| File | LoC | Rationale | Sunset condition |
|---|---|---|---|
| <path> | <N> | <why it can't go lower right now> | <what would change to make it possible> |
```

- [ ] **Step 3: Verify all characterization tests still pass**

Run: `pnpm vitest run tests/*/characterization/`
Expected: 18 characterization test files; all green.

- [ ] **Step 4: Full repo verification**

Run: `pnpm test --run && pnpm -r build && make audit-truth-check`
Expected: pass; build clean; truth-check PASS.

- [ ] **Step 5: Commit W2 closure**

```bash
git add docs/large-file-exemptions.md
git commit -m "refactor(2d W2): close god-file decomposition

18 god-files decomposed (or exempted). Final state:
- core/api/ui: all files ≤ 800 LoC (or in docs/large-file-exemptions.md)
- modules/storage/src/cloud-uuid-storage-service.ts: decomposed

Characterization tests pin behavior across the decomposition for every
god-file (tests/*/characterization/*.characterization.test.ts).

Closes: core-008, api-013, ui-008, phase-2d-godfile-template-engine,
phase-2d-godfile-database-checker, phase-2d-godfile-sqlite-search,
phase-2d-godfile-database-adapter, phase-2d-godfile-database-service,
phase-2d-godfile-auth-service, phase-2d-godfile-records-service,
phase-2d-godfile-routes-users, phase-2d-godfile-routes-diff,
phase-2d-godfile-routes-uuid-storage, phase-2d-godfile-file-browser,
phase-2d-godfile-geography-form, phase-2d-godfile-record-sidebar,
phase-2d-godfile-page-record-detail, phase-2d-godfile-cloud-uuid-storage."
```

---

## W3 — Type-Safety Elimination

**Why after W2:** Decomposed code is smaller, more cohesive, and therefore easier to type properly. Many `as any` casts in god-files are there because the local types had nowhere clean to live; W2's extraction usually creates obvious homes for proper types.

### W3-T1: Categorize all 1,581 casts (analysis)

**Files (output):**
- Create: `docs/audits/phase-2d-type-cast-inventory.md`

- [ ] **Step 1: Grep + classify**

Run:
```bash
grep -rnE "\bas any\b|: any\b" \
  core/src modules/api/src modules/ui/app modules/storage/src \
  --include="*.ts" --include="*.vue" \
  > /tmp/phase-2d-cast-raw.txt
wc -l /tmp/phase-2d-cast-raw.txt   # should be ~1,581
```

- [ ] **Step 2: Manually categorize a sample**

Read ~50 random rows from `/tmp/phase-2d-cast-raw.txt`. Categorize each. Expected categories (refine as you read):

| Category | Example pattern | Typed replacement |
|---|---|---|
| `db-row-deserialize` | `row as any` after a `SELECT *` query | `parseRow<TRowSchema>(row, schema)` |
| `dynamic-import-fallback` | `(await import('module')) as any` | typed dynamic import wrapper |
| `express-augmentation` | `req.user as any` | augment Express `Request` type globally |
| `vue-prop-passthrough` | `: any` in component props | proper prop type from schema |
| `legacy-data-shape` | `data as any` for older API responses | versioned response type |
| `error-narrowing` | `err as any` in catch blocks | `err instanceof Error` narrowing |
| `test-mock-shortcut` | `{} as any` for mock objects | typed mock factories |
| `external-lib-type-hole` | `as any` for libraries without good types | `// @ts-expect-error TS<code>` with reason |

- [ ] **Step 3: Write the inventory report**

`docs/audits/phase-2d-type-cast-inventory.md`:

```markdown
# Phase 2d Type-Cast Inventory

**Total casts (intake):** ~1,581 (verify with command above)

## Per-surface counts

| Surface | as any | : any | Total |
|---|---|---|---|
| core/src/ | <N> | <N> | <N> |
| modules/api/src/ | <N> | <N> | <N> |
| modules/ui/app/ | <N> | <N> | <N> |
| modules/storage/src/ | <N> | <N> | <N> |
| **Total** | <N> | <N> | <N> |

## Per-category counts (across all surfaces)

| Category | Count | Typed pattern |
|---|---|---|
| db-row-deserialize | <N> | parseRow<T>(row, schema) |
| dynamic-import-fallback | <N> | typed dynamic import wrapper |
| ... | ... | ... |

## Per-file hot-spots (top 20 files by cast count)

| File | Cast count |
|---|---|
| ... | ... |

## Recommendations

(How W3-T3 through T6 should sequence their work based on hot-spots and category overlap.)
```

- [ ] **Step 4: Commit**

```bash
git add docs/audits/phase-2d-type-cast-inventory.md
git commit -m "refactor(2d W3-T1): inventory + categorize 1,581 type-cast escape hatches

Categorized all ': any' and 'as any' casts across core+api+ui+storage
into 5-8 pattern categories. Per-category typed-replacement patterns
defined in W3-T2.

Top hot-spots identified for prioritized elimination in W3-T3 onward."
```

### W3-T2: Define typed patterns per category

**Files (new):**
- `core/src/types/db-row.ts` — `parseRow<T>(row, schema)` generic + schema definitions
- `core/src/types/dynamic-import.ts` — typed dynamic-import wrapper
- `modules/api/src/types/express-augment.d.ts` — Express `Request` augmentation
- `modules/ui/app/types/component-props.ts` — shared prop type helpers
- (Others as the inventory dictates)

- [ ] **Step 1: For each category, implement the typed pattern**

Each pattern includes:
- The TypeScript types/generics
- A short doc-comment with usage example
- A unit test that demonstrates it compiles + behaves

- [ ] **Step 2: Commit each pattern as its own commit**

```bash
git commit -m "refactor(2d W3-T2 db-row): typed parseRow<T>(row, schema) helper"
git commit -m "refactor(2d W3-T2 dynamic-import): typed dynamic-import wrapper"
git commit -m "refactor(2d W3-T2 express): augment Request type globally"
# ... per category
```

### W3-T3: Eliminate in `core/src/` (441 casts)

- [ ] **Step 1: Apply typed patterns from W3-T2 mechanically**

Recommended sub-batching: per-file, highest-cast-count first. Use the inventory's hot-spots list to prioritize.

- [ ] **Step 2: For each file, after replacement, run `pnpm -C core test` + `pnpm -C core build`**

Expected: no regressions; cast count for that file drops to 0 (or to a small number of legitimately-deferred ones documented inline).

- [ ] **Step 3: Verify zero casts in core/src/**

Run: `grep -rE "\bas any\b|: any\b" core/src --include="*.ts" | wc -l`
Expected: 0 (or document remainder inline with `// reason: <category>` annotations that ESLint will accept once W3-T6 lands).

- [ ] **Step 4: Commit per-file or per-cluster**

```bash
git commit -m "refactor(2d W3-T3): eliminate <N> as-any casts in core/src/<file or area>"
```

### W3-T4: Eliminate in `modules/api/src/` (626 casts)

Same pattern as W3-T3.

### W3-T5: Eliminate in `modules/ui/app/` (369 casts — `.ts` + `.vue`)

Same pattern. Vue SFC `<script setup>` blocks have their own typing challenges; the `defineProps` / `defineEmits` typed-helpers from Vue 3.4+ replace most prop `: any` cases.

### W3-T6: Eliminate in `modules/storage/src/` (145 casts) + enable lint rule

- [ ] **Step 1: Apply typed patterns**

Same as W3-T3/T4/T5.

- [ ] **Step 2: Enable `@typescript-eslint/no-explicit-any: error` across all 4 surfaces**

Update ESLint config (per-workspace or root `eslint.config.js`):

```js
rules: {
  '@typescript-eslint/no-explicit-any': 'error',
  // No per-line disable allowed unless reviewed; CI checks zero
  // suppression comments for this rule.
}
```

- [ ] **Step 3: Verify lint passes**

Run: `pnpm -r exec eslint --max-warnings 0 .`
Expected: clean.

- [ ] **Step 4: Add CI check**

Update `.github/workflows/*.yml` (or wherever lint runs) to run the rule on PRs. Fail the build on any violation.

- [ ] **Step 5: Verify zero `as any` / `: any` repo-wide**

Run:
```bash
grep -rnE "\bas any\b|: any\b" core/src modules/*/src modules/*/app \
  --include="*.ts" --include="*.vue" | wc -l
```
Expected: 0.

- [ ] **Step 6: Commit**

```bash
git commit -m "refactor(2d W3-T6): eliminate storage casts + enforce no-explicit-any across core+api+ui+storage

Final 145 storage casts replaced with typed patterns. ESLint rule
@typescript-eslint/no-explicit-any: error now active in all 4 workspaces
with CI enforcement. Zero ': any' or 'as any' remain repo-wide.

W3 complete. Closes:
- api-009 (503+ api casts eliminated)
- ui-011 (208+ ui casts eliminated)
- storage-015 (80+ storage casts eliminated)
- core type-safety (441 casts eliminated; exit criterion satisfied)"
```

### W3 closure

- [ ] **Final verification:** `pnpm test --run && pnpm -r build && pnpm -r exec eslint --max-warnings 0 .`
- [ ] **Cast count:** 0 across all 4 surfaces.

---

## W4 — Deps Hygiene Structural Follow-up

### W4-T1: Cloud SDKs → `optionalDependencies`

**Files (modified):**
- `modules/storage/package.json` — move `@aws-sdk/client-s3`, `@azure/storage-blob`, `@google-cloud/storage` from `dependencies` to `optionalDependencies`
- `modules/storage/src/providers/{s3,azure,gcs}-provider.ts` (post-W2-T18 paths) — wrap dynamic-import / require with try/catch + feature-flag

- [ ] **Step 1: Move in package.json**

Verify current dependencies + move them.

- [ ] **Step 2: Wrap usage in feature-flag**

Per-provider:
```ts
let s3Sdk: typeof import('@aws-sdk/client-s3') | null = null;
try { s3Sdk = await import('@aws-sdk/client-s3'); } catch { /* SDK not installed */ }
if (!s3Sdk) throw new coreError.OptionalDependencyMissing('@aws-sdk/client-s3', 's3 provider');
```

- [ ] **Step 3: Test in "SDK absent" mode**

Run: `pnpm install --filter=modules/storage --no-optional && pnpm -C modules/storage test`
Expected: tests not using cloud providers pass; cloud-provider tests skip with a clear "SDK not installed" message.

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(2d W4-T1): move cloud SDKs to optionalDependencies

@aws-sdk/client-s3, @azure/storage-blob, @google-cloud/storage are now
optional. Storage module degrades gracefully when SDKs aren't installed —
provider throws OptionalDependencyMissing with a clear remediation path.

Closes storage-006, deps-008."
```

### W4-T2: Declare all imports + `--shamefully-hoist=false` CI check

**Files (modified):**
- Every workspace's `package.json` — add any missing dependencies
- `.github/workflows/*.yml` — add CI step

- [ ] **Step 1: Audit imports vs declarations**

Run a script (or manual grep) that lists all `import` statements per workspace + compares against that workspace's `package.json` `dependencies` + `devDependencies` + `peerDependencies`. Surface every undeclared import.

- [ ] **Step 2: Add missing declarations**

For each undeclared import, add to the workspace's `package.json`. Run `pnpm install` to verify.

- [ ] **Step 3: Verify with strict hoisting**

Run: `pnpm install --shamefully-hoist=false`
Expected: success. Any missing declaration would cause module-resolution failure under strict hoisting.

- [ ] **Step 4: Add CI step**

Add to `.github/workflows/<ci>.yml`:

```yaml
- name: Verify strict dependency declarations
  run: pnpm install --shamefully-hoist=false --frozen-lockfile
```

- [ ] **Step 5: Commit**

```bash
git commit -m "refactor(2d W4-T2): declare all package imports + CI strict-hoist check

Every workspace's package.json now declares every imported package
(no transitive-resolution reliance). CI runs pnpm install with
--shamefully-hoist=false on every PR; missing declarations now fail
fast instead of breaking production installs.

Closes api-007, deps-010."
```

### W4-T3: Generate `docs/licenses.md`

**Files (modified):**
- Create: `docs/licenses.md`
- Modify: `.github/workflows/*.yml` — add regeneration step

- [ ] **Step 1: Generate**

Run: `pnpm licenses ls --json > /tmp/licenses.json`

Transform to markdown table (use a small `scripts/generate-licenses-md.mjs` if needed):

```markdown
# Third-Party Dependency Licenses

**Generated:** <ISO date> (regenerated in CI on dependency changes)
**Source:** `pnpm licenses ls`

| Package | Version | License | Repo |
|---|---|---|---|
| ... | ... | ... | ... |

## License summary

- MIT: <N>
- Apache-2.0: <N>
- ISC: <N>
- BSD-3-Clause: <N>
- ...
```

- [ ] **Step 2: Add CI step**

CI regenerates `docs/licenses.md` on every dependency change; PR fails if the file is out of date.

- [ ] **Step 3: ui-002 final decision**

This is the latest moment to surface the Nuxt UI Pro license question to the user:
- Option (a): keep free `@nuxt/ui` v4 (current state per Phase 2b site-003)
- Option (b): purchase `@nuxt/ui-pro` for the Pro components

Update `docs/licenses.md` to reflect the actual Nuxt UI tier used. Capture decision in registry.

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(2d W4-T3): generate docs/licenses.md + ui-002 decision

docs/licenses.md regenerated in CI on dependency changes. Captures
every transitive dependency's license + repo.

ui-002 resolution: <keep free @nuxt/ui v4 | purchase @nuxt/ui-pro>
(per user decision at W4-T3). Site copy already aligned in Phase 2b.

Closes deps-011, ui-002. W4 complete."
```

---

## Closure: Phase 2d closure report + registry update

**Files (output):**
- Create: `docs/audits/phase-2d-closure-report.md`
- Modify: `docs/audits/2026-05-16-manifesto-fit-findings.md` — flip every closed finding row

- [ ] **Step 1: Final full verification**

```bash
pnpm test --run 2>&1 | tail -10
pnpm -r build 2>&1 | tail -5
pnpm -r exec eslint --max-warnings 0 . 2>&1 | tail -5
make audit-truth-check 2>&1 | tail -10
```

Expected:
- Tests: passing count is baseline + characterization additions; single §9.1 flake unchanged
- Build: clean
- ESLint: clean (zero `no-explicit-any` violations)
- Truth-check: PASS

- [ ] **Step 2: Audit final LoC + file structure**

```bash
find core/src modules/api/src modules/ui/app \( -name "*.ts" -o -name "*.vue" \) \
  ! -path "*/node_modules/*" -exec wc -l {} \; | awk '$1 > 800' | sort -rn
```

Expected: empty OR every line has a row in `docs/large-file-exemptions.md`.

- [ ] **Step 3: Write the closure report**

`docs/audits/phase-2d-closure-report.md` structure (mirror Phase 2c's):

```markdown
# Phase 2d Structural Hardening — Closure Report

**Sub-phase:** 2d (Structural Hardening) of the post-audit base refactor
**Branch:** refactor/phase-2d-structural-hardening (cut off dev's tip 834ded9)
**Period:** <ISO start> to <ISO end>
**Parent master plan:** docs/plans/2026-05-17-base-refactor-master-plan.md §5
**Plan:** docs/plans/2026-05-19-base-refactor-phase-2d-structural-hardening.md
**Prior closure:** docs/audits/phase-2c.5-closure-note.md

## Summary

(One paragraph: what 2d achieved, key numbers, biggest decisions.)

## Workstream outcomes

(Per W: what got done, key commits, finding closures.)

## Numbers

- **Findings closed:** <N> (cumulative: 55 + N = ?)
- **Test count:** 1195 → <N> passing; 1 flake unchanged; 19 skipped unchanged
- **LoC delta:** <net> (some god-files split add modest overhead from re-exports; W3 might add types)
- **Build:** clean across all workspaces
- **ESLint no-explicit-any:** PASS (rule enforced + zero violations)
- **make audit-truth-check:** PASS

## What got measurably truer

(Per master plan §5 exit criteria: file size, type safety, module contract, deps hygiene.)

## Carry-forward to Phase 3 / future phases

(Anything surfaced during 2d that didn't fit. E.g., the deferred 'build legal-register as a real module' sub-phase per §9.4.)

## Sign-off

Phase 2d is complete and ready to merge to `dev` when the user signs off.
No push (per refactor branch policy until all 7 phases done — Phase 3
Reintroduce Realtime is next per master plan §5).
```

- [ ] **Step 4: Update findings registry**

For every closed finding, flip status to `closed-with-commit-SHA` + the SHA. New finding IDs created during 2d (the unnamed god-files, the storage real-bugs) get rows too.

- [ ] **Step 5: Commit closure**

```bash
git add docs/audits/phase-2d-closure-report.md docs/audits/2026-05-16-manifesto-fit-findings.md
git commit -m "refactor(2d): closure report + registry update — Phase 2d Structural Hardening COMPLETE

5 workstreams complete:
- W0 storage test triage + rescue (28 carry-forward failures resolved)
- W1 module contract + legal-register rename (legal-register-002 + 005 closed; manifesto §3.1 contract realized)
- W2 god-file decomposition (18 files; characterization tests pin behavior)
- W3 type-safety elimination (1,581 casts removed; lint rule enforced)
- W4 deps hygiene structural (cloud SDKs optional; imports declared; licenses generated)

Findings closed: <N> (cumulative <total>).
Test count: 1195 → <N> passing. §9.1 flake unchanged.
ESLint no-explicit-any: PASS across core+api+ui+storage.
make audit-truth-check: PASS.

Phase 2d COMPLETE. Ready to merge to dev.
Next phase: 3 (Reintroduce realtime) per master plan §5."
```

- [ ] **Step 6: Merge to dev (when user signs off)**

```bash
git checkout dev
git merge --no-ff refactor/phase-2d-structural-hardening -m "Merge branch 'refactor/phase-2d-structural-hardening' — Phase 2d Structural Hardening COMPLETE"
```

(NOT pushed; per refactor-push-policy. Local-only state until all 7 phases done.)

---

## Self-review

**Spec coverage:**
- W0 (storage tests) ✓
- W1 (module contract, manifest+resolver, legal-register rename, guide rewrite) ✓
- W2 (18 god-files with characterization tests) ✓
- W3 (1,581 casts + lint rule) ✓
- W4 (cloud SDKs optional, declare imports, licenses doc) ✓
- Closure (final report + registry) ✓

**Placeholder scan:**
- `<N>` placeholders in W0-T1, W0-T3, W3 closure: intentional — counts depend on triage outcomes. Plan instructs filling them in at execution time, not at plan-write time.
- `<SHA>` placeholders in commit message templates: standard — filled in by git on actual commit.
- `<ISO date>` placeholders in closure-report header: standard.
- No "TBD" / "implement later" / "details to follow." Every task block has steps; every step has expected outputs.

**Internal consistency:**
- W2 god-file count = 18. Cross-check: 7 master plan named + 10 unnamed core/api/ui >800 LoC + 1 storage = 18. ✓
- Total cast count cited as ~1,581 in scope summary, in W3-T1 step 1, in W3-T6 commit message. ✓
- Branch name `refactor/phase-2d-structural-hardening` consistent across plan + commit templates + closure. ✓
- Task execution order in §"Task Execution Order" matches the W2 dependency notes (T5→T6, T8→T9, etc.). ✓

**Scope check:**
- Within master plan §5 Phase 2d scope: god-files, types, module contracts, deps hygiene ✓
- Carry-forward: storage tests (added as W0) ✓
- Surfaced expansion (per user brainstorm answers): 10 unnamed god-files + cloud-uuid added; core casts added; full plugin contract (not minimum) ✓
- Out of scope and explicitly deferred: ingest-005, site-006 (per user direction); build legal-register as real module (§9.4); broadcast-box-coupled realtime code (Phase 3); flaky pre-existing tests (§9.1) ✓

**Ambiguity check:**
- ui-002 (Nuxt UI Pro): surfaced at W4-T3 as user-decision point ✓
- realtime-004 (partial — without broadcast-box code): default-defer to Phase 3; inspection at W1-T1 ✓
- Per-god-file final seam choice: per-task by executing agent (informed by characterization tests) — intentional, not over-specified ✓
- "Real bug" findings from W0-T1: surface as new registry entries, not pre-named ✓
- Test count target: "no regression in passing count" rule (not fixed target) ✓

**Risk notes:**
- W2 is the longest stretch (~4-6 wks). Worktree-parallel batches help but introduce coordination overhead — coordinator must verify clean working-tree state between merges.
- W3-T2's typed-pattern design quality determines W3-T3 through T6's success. If a pattern is wrong, all uses of it propagate the wrong shape. Recommend: small pilot (10-20 sites per pattern) before sweep.
- W2-T8 + W2-T9 + W2-T10 share `RecordManager` / `UsersService` consumers. If T8's decomposition changes the service shape, T9 + T10 might need to adjust their handlers. Mitigation: T9 + T10 written against T8's barrel re-export, not the new seams.
- W1-T4 rename touches every workspace (imports). Use `git mv` + comprehensive grep. Run `pnpm install` after the rename — pnpm workspace resolution may need refresh.
- The `<= 800 LoC` exit criterion may surface files that legitimately can't go lower (generated, schemas, long-lived state machines). `docs/large-file-exemptions.md` is the escape hatch; each entry requires a sunset condition.
- Net effort estimate (9-14 weeks) is much larger than master plan §5's 2-3 wk estimate. User chose biggest-scope at brainstorm. If pressure forces a smaller phase later, the natural break is W3 (the type-safety pass is the largest discrete chunk; can defer to a 2e if needed).

---

## Progress closure: W0 + W1 + W2 (2026-05-20, end of session)

The first three of the five workstreams are complete on `refactor/phase-2d-structural-hardening` (local, 39 commits, not pushed, not merged to `dev`). **W3 (type-safety) and W4 (deps hygiene) remain.**

### W0 — Storage test triage + rescue ✓

- All **28 of 28** carry-forward storage test failures (deferred from Phase 2c.5) cleared.
- Surfaced **9 source-code bugs** in storage reliability primitives (retry, timeout, circuit-breaker, batch ops, lifecycle, stream errors, error inheritance) — none in the original 205-finding audit; all closed-with-commit-SHA.
- 4 stale tests rewritten + 1 schema-drift fixture fixed.
- Triage doc: `docs/audits/phase-2d-storage-test-triage.md`.
- 14 commits (W0-T1 through W0-T3 closure, including the 9 bug-fix commits).

### W1 — Module contract + legal-register rename ✓

- Plugin/module contract spec: `docs/specs/module-contract.md` (canonical) + `core/src/modules/module.schema.json` (Ajv-validated).
- `ModuleResolver` replaces all `process.cwd()`-based discovery (closes `legal-register-005`).
- Hardcoded `moduleName === 'legal-register'` removed; manifest-driven `capabilities.schemaExtensions` (closes `legal-register-002`).
- `git mv modules/legal-register → modules/schema-extensions/legal/` (manifest.name kept as `legal-register` for backward compat with ~290 references).
- `docs/module-integration-guide.md` rewritten (553 → 278 LoC).
- 13 characterization tests for ModuleResolver discovery.
- **Phase 3 entry criterion satisfied:** "Module contract layer exists."
- 5 commits (W1-T1 through W1-T5).

### W2 — God-file decomposition ✓

**18 named god-files + 3 surfaced extras = 21 files decomposed.** Only `core/src/records/record-manager.ts` (933 LoC) remains above the 800 bar; documented in `docs/large-file-exemptions.md` with 3 sunset paths.

| Task | File | Before → After | Closes |
|---|---|---|---|
| T1 | template-engine.ts | 1,154 → 92 | `phase-2d-godfile-template-engine` |
| T2 | database-checker.ts | 985 → 505 | `phase-2d-godfile-database-checker` |
| T3 | sqlite-search-service.ts | 970 → 227 | `phase-2d-godfile-sqlite-search` |
| T4 | database-adapter.ts | 923 → 326 | `phase-2d-godfile-database-adapter` |
| T5 | database-service.ts | 1,577 → 499 | `phase-2d-godfile-database-service` |
| T6 | record-manager.ts | 1,467 → 933 (exempt) | `core-008` (master plan named) |
| T7 | auth-service.ts | 1,354 → 644 | `phase-2d-godfile-auth-service` |
| T8 | records-service.ts | 1,760 → 229 | `phase-2d-godfile-records-service` |
| T9 | routes/records.ts | 1,459 → 23 factory | `api-013` (master plan named) |
| T10 | routes/users.ts | 1,443 → 39 factory | `phase-2d-godfile-routes-users` |
| T11 | routes/diff.ts | 965 → 8 factory | `phase-2d-godfile-routes-diff` |
| T12 | routes/uuid-storage.ts | 960 → 24 entry | `phase-2d-godfile-routes-uuid-storage` |
| T13 | RecordForm.vue | 1,276 → 746 | `ui-008` (master plan named) |
| T14 | FileBrowser.vue | 1,156 → 320 | `phase-2d-godfile-file-browser` |
| T15 | GeographyForm.vue | 1,104 → 127 | `phase-2d-godfile-geography-form` |
| T16 | RecordSidebar.vue | 935 → 301 | `phase-2d-godfile-record-sidebar` |
| T17 | records detail page | 935 → 171 | `phase-2d-godfile-page-record-detail` |
| T18 | cloud-uuid-storage-service.ts | 2,711 → 539 | `phase-2d-godfile-cloud-uuid-storage` |
| T19 | role-manager + email-validation + backup (3 surfaced) | 832/832/823 → 586/751/696 | `phase-2d-godfile-role-manager`, `-email-validation-service`, `-backup-service` |

19 commits (W2-T1 through W2-T19).

### Characterization test coverage (targeted-closure approach, 2026-05-20 follow-up)

The W2 method primer (this plan, §W2) called for one characterization test per god-file (18 total) as a regression guard before each decomposition. In the run-up to the W0+W1+W2 progress closure (commit `132baa1`), char-tests landed for W2-T1, T2, T3 only — the pattern was then dropped as decomposition-by-decomposition verification via the existing test suite gave green signals (1247 passing, no regressions). The W2 closure-task §3 ("18 characterization test files; all green") was therefore not satisfied as written.

Reopened immediately after the progress-closure commit. After a per-file coverage audit (`grep -rl <file> tests/`), three files had **zero direct test coverage** — the three highest decomposition-regression-risk gaps:

| Task | File | Existing direct tests | New char-test |
|---|---|---|---|
| T8 | `modules/api/src/services/records-service.ts` (1,760 → 229) | 0 direct (33 via routes/records integration) | `tests/api/characterization/records-service.characterization.test.ts` — 22 tests covering helpers (`normalizeDateString`, `getKindPriority`, `buildFilterClause`), locks collaborator, orchestrator public surface |
| T14 | `modules/ui/app/components/storage/FileBrowser.vue` (1,156 → 320) | 0 | `tests/ui/characterization/file-browser.characterization.test.ts` — 24 tests covering `useFileBrowser` pure helpers (icon/color/preview/format), selection state machine, modal helpers |
| T18 | `modules/storage/src/cloud-uuid-storage-service.ts` (2,711 → 539) | 0 | `tests/storage/characterization/cloud-uuid-storage-service.characterization.test.ts` — 37 tests covering `internals` pure helpers (parseSizeString, formatBytes, generateStoredFilename*, extractErrorCode, generateErrorSummary, dbRecordToStorageFile, getLocalStoragePath), `StorageValidation` (file + batch), orchestrator public surface |

**Deviation rationale for T4-T7, T9-T13, T15-T17:** these files already carry meaningful direct test coverage (3-33 referencing test files each, see audit table) and the decompositions passed the existing tests at each extraction step. Retroactive characterization tests for files that already have a green-signaling test suite would be makework. Documenting the deviation here so a future hardening pass can revisit if needed.

**One notable quirk surfaced by the FileBrowser char-test:** `useFileBrowser.getFileIcon` checks `mime.includes('document')` before `mime.includes('spreadsheet')`, so the openxml `.xlsx` mime (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`) falls into the word-document branch and renders with `i-lucide-file-text` + `text-blue-600` instead of the spreadsheet icon. Pinned as current behavior; not a Phase 2d regression (pre-existing in the original FileBrowser.vue), but worth fixing in a future polish pass.

Total characterization tests: **6 files, 122 tests** (T1: 26, T2: 5, T3: 8, T8: 22, T14: 24, T18: 37) — all green.

### Verification at session end

- `pnpm test` (root): **1305 passing / 1 known date-bomb / 19 skipped** — pre-W2 baseline was 1247; +58 net from new char-tests + earlier W2 sub-tests. No new regressions across the 21 god-file decompositions; `tests/api/records.test.ts > should update existing draft` occasionally times out under parallel load but passes 62/62 in isolation (flake, not regression).
- `pnpm -C modules/storage test:run`: **216 passing across 17 files** (storage workspace runner — the new `tests/storage/characterization/` lives outside its include scope but the root runner picks it up).
- `pnpm -r build`: clean across all 6 workspaces.
- `make audit-truth-check`: PASS.
- Every file in `core/src/`, `modules/api/src/`, `modules/ui/app/` is ≤ 800 LoC except the documented exemption.
- Storage god-file decomposed too: `modules/storage/src/cloud-uuid-storage-service.ts` 2,711 → 539 LoC.

### Important discovery during W2-T19

The long-running "§9.1 session-mgmt flake" is **NOT a flake** — it's a date-bomb. The test creates a session with hardcoded expiry `new Date('2025-12-31')`. Today is 2026-05-20, so `getSessionByToken` correctly filters out the now-expired row and returns `null`. Same test fails on the dev-tip baseline (independent of any Phase 2d work). Per master plan §9.1, pre-existing test failures are out of scope for the refactor; surfaced here for the dedicated test-suite-repair session §9.1 mentions.

### Remaining workstreams

- **W3 — Type-safety elimination.** ~1,581 `: any` / `as any` casts across core+api+ui+storage, plus enabling `@typescript-eslint/no-explicit-any: error` lint rule. Master plan §5's biggest remaining workstream; estimated 3-5 weeks. Will start in a fresh session.
- **W4 — Deps hygiene structural.** Cloud SDKs to `optionalDependencies` (closes storage-006 + deps-008), declare all imports + `--shamefully-hoist=false` CI check (closes api-007 + deps-010), generate `docs/licenses.md` (closes deps-011), ui-002 final decision. Estimated 3-5 days.
- **Closure task** at the very end: full closure report, registry update, merge readiness for `dev`.

### Branch state

- Not pushed to any origin (per `refactor-push-policy` memory rule).
- 39 commits on `refactor/phase-2d-structural-hardening` at progress-closure (`132baa1`); +1 followup commit for retroactive char-tests + W2 formal closure (this section).
- Behind W2 close: 28 of 28 storage failures cleared, 21 god-files decomposed (3 with new retroactive char-tests for the highest-risk zero-coverage gaps), plugin contract live.
