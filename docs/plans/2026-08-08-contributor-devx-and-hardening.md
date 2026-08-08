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
- [ ] **One blessed `dev`.** Collapse the ~10 `dev:*` variants into a single
      `pnpm dev` (core-watch + api-tsx + ui + seeded sample data); document it
      in CONTRIBUTING; keep the rest as advanced.
- [ ] **Loud failures.** No command exits non-zero without printing what failed
      and the fix — the silent `status 1` papercut (a security command exited 1
      with no message this session). `withCli` error path.

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

### 2b. Hermetic test instance

- One `createTestInstance()` — an `InstanceContext` over a fresh temp dir (own
  DB / config / modules, zero ambient state) — replacing the ~10 `create*`
  fixture helpers in `tests/fixtures/test-setup.ts`.
- Retires the `.system-data/notifications.yml` pollution and the simulated-auth
  `NODE_ENV` gymnastics that make tests pass-in-CI / fail-locally.
- Then make the pre-commit hook a fast, reliable subset so `--no-verify` dies.

`createTestInstance()` and `resolveInstanceContext()` are the **same
abstraction** — one for tests, one for prod startup.

---

## Opportunistic hardening (fold in when adjacent — NOT scheduled)

Pull from this list when a task already has us in the relevant code.

**Correctness**

- **Document numbers always `1`**
  (`core/src/utils/document-number-generator.ts:186` — never queries the DB for
  the highest sequence). → fold in when touching legal-register / record
  creation.
- **`storage.yml` `backend.path` ignored** by broadcast-box (writes to a default
  root). → absorbed by `InstanceContext.storageRoot` (2a).

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
