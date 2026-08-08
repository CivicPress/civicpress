---
title: Contributor DevX + Opportunistic Hardening
date: 2026-08-08
status: in-progress
---

# Contributor DevX + Opportunistic Hardening

**Scope:** the _contributor_ inner loop (building CivicPress itself) plus a
keystone test/resolution harness. Operator/IT day-2 DevX is deliberately
**parked**. Deferred _features_ (analytics / templates / bulk / advanced-search
APIs, etc.) are out of scope — this is about the loop and correctness, not new
surface.

## Why now

v0.4.x (Workflow Engine + Permissions) will be built _through_ whatever the dev
loop is, so the papercuts compound if we don't sand them first. Grounded in real
pain from the v0.3.x work: a redaction bug whose root cause was cwd-dependent
module resolution; tests that ran stale compiled code mid-bisect; a pre-commit
suite flaky enough that the standing advice is `--no-verify`; and config
resolved from several places at once.

## Guiding decisions (2026-08-08)

- **Contributor loop first**; operator/IT parked.
- **Quick wins first**, then the deeper harness.
- The deferred hardening items below are **opportunistic** — folded in when
  we're already working in the adjacent area, **not** run as a dedicated sprint.

---

## Phase 1 — Quick wins (contributor loop)

- [x] **Kill dist-drift.** A vitest `globalSetup` rebuilds `core`/`cli` only
      when their `src` is newer than their `dist`; the `@civicpress/core` alias
      stays on `dist` on purpose (one instance, shared with the broadcast-box /
      transcription / realtime modules — aliasing to src forks
      `CentralConfigManager` and breaks cross-module e2e). _Done — commit
      `3d2e582`._
- [x] **One blessed `dev`.** `pnpm dev` = a preflight guard + `concurrently`
      core-watch + api (tsx) + ui (nuxt) with prefixed/colour-coded logs;
      `pnpm dev:setup` bootstraps a local instance (build core+cli →
      `civic init` → seed demo records; login `admin` / `Dev-Admin-123!`);
      pruned the `dev:all`/`dev:all:watch` duplicate aliases; documented in
      CONTRIBUTING (also fixed the stale Node-20/pnpm-8 prerequisites → 22/9).
      _Done — commit to follow._
- [x] **Clear failures → quieted the init noise.** _(investigated → reframed →
      done, 2026-08-08.)_ The CLI was already broadly **loud** (verified under
      `NODE_ENV=test` / `--silent` / `--quiet`); the papercut was the inverse —
      the actual result was buried under ~14 lines of per-command init
      narration. Fixed the real bug behind one of those lines: **email templates
      never registered** — a CommonJS `require(...)` threw `ReferenceError` in
      ESM on every init (`"Error registering email templates"`), leaving
      `email_verification` / `email_change_verification` unregistered (the
      downstream `Template not found`). Swapped to a static import (`3bd2a6c`;
      same bug also fixed in `generator.ts` `detectAuthor`). Then downgraded the
      pure init narration to `debug` (`34457a1`) — a failing command went **17 →
      9 lines**, error prominent. **Residual:** 5 `.civicrc`
      deprecation/missing-field warnings, which trace to `civic init` itself
      (see the opportunistic list) — legitimate signals, not narration.

---

## Phase 2 — Deeper harness (the keystone)

Two faces of one abstraction — build it once, prod + tests both win.

### 2a. `InstanceContext` — single-root config/module resolution

Today "where is X?" is answered independently in ≥4 places, each with a
`process.cwd()` fallback. Resolve the root **once** at startup into an immutable
context; every consumer reads from it.

```ts
interface InstanceContext {
  root: string; // dir containing .civicrc — resolved ONCE (explicit arg
  //   or walk-up). The ONLY place cwd is ever consulted.
  configPath: string; // root/.civicrc
  dataDir: string; // root/<config.dataDir>
  systemDataDir: string; // config.systemDataDir ?? root/.system-data
  modulesDir: string; // root/modules (or config-declared)
  storageRoot: string; // storage.yml backend.path, resolved against root
}
function resolveInstanceContext(explicitRoot?: string): InstanceContext {
  /* … */
}
```

**Kill-list (what it replaces):**

| Today                                                               | Becomes                               |
| ------------------------------------------------------------------- | ------------------------------------- |
| `central-config.ts` — ~9 `configPath ? dirname(configPath) : cwd()` | `ctx.root`                            |
| `record-schema-builder.ts` `getModuleResolver()` → `cwd()/modules`  | `ctx.modulesDir` ← redaction-bug root |
| `civic-core-services.ts:348` `cwd()` storage-module lookup          | `ctx`                                 |
| `getSystemDataDir()` cwd fallback                                   | `ctx.systemDataDir`                   |
| broadcast-box writing to default `.system-data/storage`             | `ctx.storageRoot`                     |

Payoff: deterministic (same answer regardless of cwd), and the redaction-bug
class becomes structurally impossible.

**Progress (2026-08-08):** first increment landed — `getModuleResolver`'s
fallback now resolves from `resolveProjectRoot(config)/modules` (matching the
injected resolver) instead of raw `process.cwd()/modules` (`4cbc036`). Two
design refinements surfaced while grounding, and they changed the full migration
(both are now implemented — see "2a landed" below):

1. **The cwd-dependence is pervasive.** `central-config`'s
   `resolveSystemDataDir` / `resolveProjectRoot` themselves fall back to
   `path.resolve(process.cwd(), dirname(dataDir))` when `systemDataDir` is
   unset. So `resolveInstanceContext` must resolve `root` **once** (from the
   explicit `dataDir`, or a single `.civicrc` walk-up) and every other field
   derives from that one root — you can't fix the leaks piecemeal without a
   captured root.
2. **Modules are CODE, not data.** In a split deployment (code at `/app`,
   instance data at `/instance`) the modules dir is colocated with the app, so
   `modulesDir` should key off the installed-code location (`__dirname` /
   package), **not** the instance data root. `resolveProjectRoot/modules` works
   today only because dev and the Docker image colocate code + data. The
   `InstanceContext` likely needs `root` (data) AND a separate `codeRoot`.

**2a landed (2026-08-08).** `core/src/config/instance-context.ts` resolves the
root ONCE and derives everything from it; both refinements above are in the
shipped shape — `root` (data) vs `codeRoot` (installed code), and `modulesDir`
prefers a `modules/` beside the data root, else `<codeRoot>/modules`. Migrated
one verified commit at a time:

| Consumer                                      | Now                                     |
| --------------------------------------------- | --------------------------------------- |
| `central-config.ts` ×7 cwd fallbacks          | one `getInstanceContext()` root         |
| duplicate `.civicrc` walk-up                  | deleted — one implementation            |
| `getSystemDataDir()` / `getProjectRoot()`     | `ctx.systemDataDir` / `ctx.root`        |
| `record-schema-builder` `getModuleResolver()` | `ctx.modulesDir` (no cwd fallback left) |
| DI `moduleResolver` + storage-module import   | `resolveModulesDir(...)`                |

`getConfig()` reads through `getInstanceContext()` rather than resolving afresh
— that is what lets a caller **install** a root instead of being found by a
walk-up, and it is the hinge 2b turns on.

**Three live bugs surfaced while migrating**, each fixed with a regression test:

- `OrphanedFileCleaner` resolved a relative local provider path against the
  literal `.system-data` (i.e. cwd), so it scanned a different tree than the DB
  it compared against and everything it found there looked like an `in_storage`
  orphan — which `cleanupOrphanedFiles` deletes via `fs.remove`. A **data-loss
  path**, not a harmless empty scan.
- `CloudUuidStorageService` constructed `CredentialManager` with no argument,
  reading cloud credentials from `<cwd>/.system-data/storage.yml`.
- `cli/commands/storage.ts` computed its own systemDataDir from cwd behind a
  test heuristic (`dataDir.includes('/tmp/') || dataDir.includes('test')`), so
  the storage CLI read a **different `storage.yml`** than core and the API — and
  a production dataDir merely containing "test" took the test branch.

**The cwd sweep is now COMPLETE** (was listed here as a follow-up; done in the
same session):

- the three template base paths (`template-service`, `template-validator`,
  `utils/template/loader`) → instance `systemDataDir`. Their two test files had
  been written against the old behavior and were creating a stray `.system-data`
  **inside the repo checkout** on every run; they now stand up a disposable
  instance. A full `core` run leaves the checkout untouched.
- `diagnostics/checkers/config-checker.ts` (a THIRD `.civicrc` walk-up — and one
  that gave up after 10 levels, so it could report on a _different_ config file
  than the one actually loaded) and `modules/api/src/index.ts` (a fourth) → the
  resolved context.
- **the API's `process.chdir()`** during `initialize()` — a process-wide side
  effect from a library init, justified by "so database paths resolve
  correctly". Paths no longer depend on cwd, so it is gone.
- `cli/commands/diagnose.ts` (passed cwd as the filesystem checker's project
  root) and `cli/commands/config.ts` (`systemDataPath` from cwd while taking
  `dataDir` from the config authority — the two halves of one service could
  point at different instances; plus a defaults path for CODE resolved from cwd
  → `resolveCodeRoot()`).

Only the broadcast-box migrations-dir fallback remains, and it is already
guarded by an `existsSync` chain that tries the code-relative path first.

### 2b. Hermetic test instance

- One `createTestInstance()` — an `InstanceContext` over a fresh temp dir (own
  DB / config / modules, zero ambient state) — replacing the ~10 `create*`
  fixture helpers in `tests/fixtures/test-setup.ts`.
- Retires the `.system-data/notifications.yml` pollution and the simulated-auth
  `NODE_ENV` gymnastics that make tests pass-in-CI / fail-locally.
- Then make the pre-commit hook a fast, reliable subset so `--no-verify` dies.

`createTestInstance()` and `resolveInstanceContext()` are the **same
abstraction** — one for tests, one for prod startup.

**2b landed (2026-08-08).** `tests/fixtures/test-instance.ts` builds an isolated
instance (temp root, own `.civicrc` / `config.yml` / storage / roles / workflows
/ org, own git repos, own DB) and **installs** it via `setInstanceContext`.

The property that matters: a test instance is now found because it was
_declared_, not because the process is sitting in its directory. The API fixture
previously had to `process.chdir()` into its own temp dir so the `.civicrc`
walk-up would see it, then `chdir` back in a `finally` — shared global state,
order-dependent, and a throw mid-test stranded the rest of the run in the wrong
directory. That whole dance is gone; `createTestInstance()` touches neither
`process.cwd()` nor `NODE_ENV`.

`createCoreTestContext`, `createAPITestContext` and `createCLITestContext` all
build on it (−85 lines of hand-assembled fixture);
`createExtendedAPITestContext` writes its own extended `.civicrc` but installs
the root the same way. `tests/core/test-instance-harness.test.ts` pins the
no-chdir property, the `.system-data` anchoring, and per-instance DB isolation.

_Not yet done in 2b:_ the remaining `create*` helpers are still exported and
used directly by some suites, and the pre-commit hook is untouched — so
`--no-verify` is still the standing advice.

---

## Opportunistic hardening (fold in when adjacent — NOT scheduled)

Pull from this list when a task already has us in the relevant code.

**Correctness**

- [x] **Document numbers always `1`** — `getNextSequence` was a stub that logged
      a warning and returned 1, and BOTH call sites (RecordManager + the
      create-record saga) fed it straight into `generate()`. So every bylaw /
      ordinance / policy / proclamation / resolution was created as
      `<PREFIX>-<YEAR>-001` — silent duplicates of the record's own citable
      identity. Now reads what has been issued (`RecordStore.getDocumentNumbers`
      via `json_extract`, since `document_number` has no column) and takes
      highest-matching +1, scoped by prefix AND year. 17 tests, 5 of them
      against real SQLite.
- [x] **`storage.yml` `backend.path` ignored** — absorbed by
      `InstanceContext.storageRoot`, and two live cwd bugs fixed alongside it
      (see 2a).
- [x] **`civic init` writes a deprecated `.civicrc`** — all three writers seeded
      top-level `modules` + `record_types`; both dropped. `modules` already
      lives in `data/.civic/config.yml` (which `getModules()` reads first) and
      `record_types` has no reader at all. Verified against a real
      `civic init --yes`: no deprecation or missing-field warnings afterwards.
      (`dataDir` was in fact always written — the "omits dataDir" note here was
      wrong.)
- [x] **Notification state resolved from cwd** — found while verifying the
      harness. `NotificationAudit` and `NotificationConfig` both defaulted to
      the RELATIVE `'.system-data'`, and the DI container passed
      `config.dataDir` for `notifications.yml` — which the configuration service
      MIGRATES out of `dataDir`, leaving a `# Moved to …` stub, so the container
      was reading the stub and silently falling back to defaults on any migrated
      instance.

**Security**

- **No "published-only" gate** — public reads return anything _indexed_
  (`workflow_state != internal_only`), not `status=published`
  (`core/src/database/stores/record-store.ts`). → fold in when touching public
  read/index paths.
- **`configure_device --enroll` doesn't register the device signing key** →
  session manifests arrive **unverified**. → fold in when touching broadcast-box
  enrollment.

**Robustness**

- **Silent CLI failures** (exit 1, no message). → do with the "loud failures"
  quick win.
- **Three metadata representations** (DB JSON / file frontmatter / draft
  `markdown_body`) can drift — this is what made the redaction bug hard to
  _see_. → fold in when touching record-manager/parser.
- **core↔storage circular build dep** ("build core first" dance). → fold in if
  we restructure the build.

**Accepted limitations** (documented; may become work): realtime multi-node
(Redis adapter), collab-edits-as-Git-civic-events, collab browser e2e, geography
DB persistence, hook→workflow-engine residual (`hook-system.ts:410` → v0.4.x).

**Test-infra:** security-commands happy-path harness (needs a mock-SMTP/console
email channel + an auth token these sensitive commands accept — see
`docs/post-refactor-backlog.md`).

---

## Out of scope

- Operator/IT DevX (deploy day-2 ops, upgrades, observability) — parked by
  decision.
- Deferred feature APIs (analytics / templates / bulk / advanced search).
