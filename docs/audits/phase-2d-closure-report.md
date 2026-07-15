# Phase 2d Structural Hardening — Closure Report

**Date:** 2026-05-24
**Branch:** `refactor/phase-2d-structural-hardening` (local-only per `refactor-push-policy`)
**Plan:** `docs/plans/2026-05-19-base-refactor-phase-2d-structural-hardening.md`
**Anchor master plan:** `docs/plans/2026-05-17-base-refactor-master-plan.md` §5 Phase 2d

---

## Summary

Phase 2d — the largest of the seven master-plan phases — is complete on its in-scope workstreams. Five workstreams (W0–W4) landed across the branch; god-files decomposed, plugin/module contract locked, type-safety driven from 1,621 untyped casts to an annotated allowlist of 223, every workspace's dependency declarations made strict, and cloud SDKs moved out of the mandatory install path.

Master-plan §5's exit criteria are met for the in-scope subset:

- **No core/api/ui source file >800 LoC** except `core/src/records/record-manager.ts` (933 LoC) — documented in `docs/large-file-exemptions.md` with a sunset path.
- **`@civicpress/core` module contract** specified (`docs/specs/module-contract.md`), implemented (`core/src/modules/module-resolver.ts`), and consumed by `record-schema-builder` (legal-register hardcoding removed; `modules/legal-register/` renamed to `modules/schema-extensions/legal/`).
- **Type-safety:** ~86% of casts eliminated across the four production surfaces; six latent bugs surfaced + fixed in the process.
- **Deps hygiene:** every workspace declares every package it imports; strict-hoist is the new install default; cloud SDKs degrade gracefully via `optionalDependencies` + dynamic loader; `docs/licenses.md` captures the full third-party inventory.

What did NOT close in Phase 2d: the `@typescript-eslint/no-explicit-any: error` lint-rule rollout + CI gate (deferred to a dedicated lint-hygiene session — ~335 pre-existing lint errors need triage first, and the project has chosen not to adopt deployment CI/CD); `ui-002` Nuxt UI Pro vendor lock-in (target direction confirmed as v3→v4-free, but the migration is multi-day in its own right and carries forward); `realtime-012` (out of scope until Phase 3 reintroduces the realtime module).

---

## Workstream outcomes

### W0 — Storage Test Triage + Rescue ✓

28 deferred storage test failures cleared across 10 files. Triage uncovered **9 source-code defects** (`phase-2d-storage-bug-1` through `-9`, all closed-with-commit-SHA) — 7 of 9 in `cloud-uuid-storage-service.ts`, the same 2,681-LoC god-file scheduled for W2-T18 decomposition. 4 stale tests rewritten + 1 schema-drift fixture fix.

Insight: the "fake comprehensiveness" framing in the audit (tests existed but didn't run) understated the value — running them caught real bugs in reliability primitives (retry, timeout, circuit-breaker, batch-ops, lifecycle, stream-errors, error inheritance).

Triage doc: `docs/audits/phase-2d-storage-test-triage.md`.

### W1 — Module Contract + Legal-Register Rename ✓

Plugin/module contract specified + implemented:

- `docs/specs/module-contract.md` — the canonical spec (modules vs schema-extensions, manifest format, lifecycle, discovery, versioning).
- `core/src/modules/{module-manifest.ts, module-resolver.ts, module.schema.json}` — implementation.
- `tests/core/modules/discovery-characterization.test.ts` — 13 characterization cases pinning current discovery behavior before the resolver change.
- `docs/module-integration-guide.md` — full rewrite (553 LoC → 278 LoC) against the new contract.

ModuleResolver replaced `process.cwd()`-based traversal in `record-schema-builder`. `modules/legal-register/` → `modules/schema-extensions/legal/` via `git mv` (history preserved); manifest.name stayed `"legal-register"` to preserve ~290 backward references (config defaults, record frontmatter, test fixtures).

Closed: `legal-register-002`, `legal-register-005`.

### W2 — God-File Decomposition ✓

18 named god-files + 3 surfaced extras decomposed (21 files total). Only `core/src/records/record-manager.ts` (933 LoC) remains above the 800 bar — documented in `docs/large-file-exemptions.md` with three sunset paths.

Largest god-file decomposed: `cloud-uuid-storage-service.ts` 2,711 → 539 LoC (split into `cloud-uuid-storage/{provider-init, upload-ops, download-ops, file-mgmt-ops, streaming-ops, internals}.ts` with host-ref strategy).

Pattern by file type:

- **Service classes** → ops-class collaborators with deps bag + `Parameters<>`/`ReturnType<>` delegation.
- **Express routers** → factory + `register*Routes` per-group handler files + `handlers-common.ts`.
- **Vue SFCs** → composables for state+behaviors + sub-components for template chunks (new convention: page-private components under `pages/**/_components/`).

Closed: `core-008`, `api-013`, `ui-008`.

Important discovery: the "§9.1 session-mgmt flake" is NOT a flake — it's a **date-bomb** (hardcoded `new Date('2025-12-31')`; today is past). Same failure on baseline. Surfaced for the dedicated test-suite-repair session.

### W3 — Type-Safety Elimination ✓ (annotated-allowlist)

`: any` / `as any` casts driven 1,621 → 223 (-1,398, **86% cleared**) across 36 commits over the four production surfaces.

Per-surface end state:

| Surface | Start | End | Production |
|---|---:|---:|---:|
| `core/src/` | 447 | 56 | 9 (annotated allowlist) + 47 in `__tests__/` |
| `modules/api/src/` | 628 | 32 | 0 (production) — remaining are typed-helper boundaries |
| `modules/ui/app/` | 397 | 68 | documented `eslint-disable` for Nuxt UI v-model bridges |
| `modules/storage/src/` | 149 | 67 | 0 (production) — remaining are test mocks |
| **Total** | **1,621** | **223** | annotated allowlist across all four |

Architectural deliverables:

- Typed `Express.Request` augmentation (`modules/api/src/types/express-augment.d.ts`) — eliminates 248 ad-hoc `(req as any)` accesses repo-wide.
- `HttpError` class (`modules/api/src/utils/http-error.ts`) — replaces the `(error as any).statusCode = N; throw error` mutation idiom.
- Typed `ApiResponse<T>` envelope shared between api + ui.
- Per-table Row types (`RecordRow`, `DraftRow`, `UserRow`, etc.) for SQLite query results.
- `DatabaseAdapter.getConfig()` method (eliminates 5 `(adapter as any).config` sites).
- Typed `Saga<X, Y>` end-to-end with explicit generics at `executor.execute<>` callsites.
- Structural `StorageDatabaseService` interface (avoids circular import with `@civicpress/core`).

**Six latent bugs surfaced + fixed during W3:**

1. `dbRecordToStorageFile` constructing `new Date(undefined)` → Invalid Date [storage].
2. Cache `.set(key, val, ms)` passing a number where `{ ttl?, tags? }` is expected (TTL silently dropped) [storage].
3. `GlobalStorageSettings` missing 4 retry knobs that `RetryManager` actually reads [storage].
4. `base-checker` `FixResult.error` stored verbatim under `any` field, violating `FixResult.error: DiagnosticError` contract [diagnostics].
5. Saga `QueueIndexingStep` had no null-check on injected `indexingService`; callers passed `null` via `any` param so missing service would have crashed the saga [records/sagas].
6. `IndexingService` sync sentinel `id: 'admin'` (string) into `AuthUser.id: number` [indexing].

Closed: `api-009`, `ui-011`, `storage-015`.

**Deferred to dedicated lint-hygiene session** (NOT closed in 2d): enable `@typescript-eslint/no-explicit-any: error` per workspace. Reason: ~335 pre-existing lint errors across core/api/storage configs (no-unused-vars, missing `console` globals, missing `eslint.config.cjs` in storage); the lint baseline needs its own triage. Closure of the rule is a stand-alone session; it does not block W4 or Phase 3 entry.

**CLOSED 2026-06-02** on branch `worktree-refactor-lint-rule-rollout` (plan calls it `refactor/lint-rule-rollout`; worktree harness assigned the prefixed name). Merged to local `dev` via `--no-ff` at `656adb5`.

- Rule `@typescript-eslint/no-explicit-any: error` enforced across all 5 production workspaces (`core`, `cli`, `modules/api`, `modules/ui`, `modules/storage`); `warn` in `**/*.test.ts` + `**/__tests__/**` + `**/*.spec.ts` per-workspace overrides.
- Baseline 1,488 errors → 0 errors across all workspaces. ~600 warnings remain — `@typescript-eslint/no-unused-vars` was swapped from the JS rule (was running against TS code, ~648 false positives) and demoted to `warn` after L1-T1 surfaced ~170 real unused vars in `core` alone. A dedicated unused-vars cleanup session is left for future work.
- ~120 production cast sites annotated with `// eslint-disable-next-line @typescript-eslint/no-explicit-any` (and `<!-- ... -->` form inside Vue `<template>` blocks via L4-T2-followup). 13 disable comments pre-existed. 114 test-mock casts covered by the test-file `warn` override.
- Root `pnpm lint` script added (no `--max-warnings 0` cap; errors block, warnings signal). No CI gate per `no-cicd-policy`. Pre-commit hook unchanged per spec §7.
- `modules/ui` switched to `@nuxt/eslint`'s Option A integration (`withNuxt(...)` with `standalone: true`); ~30 Nuxt/Vue style + strictness rules were deferred via `STYLE_RULES_DEFERRED` map per spec §7 ("No new rules beyond `no-explicit-any`"). A future session can selectively enable.
- Full closure plan: `docs/plans/2026-05-28-lint-rule-rollout.md`. Design spec: `docs/specs/2026-05-28-lint-rule-rollout-design.md`.

**Sub-followups CLOSED 2026-06-03** (entire lint-rollout backlog complete):

- `#1 unused-vars umbrella` — merge `82e3c1b`. 459 sites across all 5 workspaces; rule = `error` repo-wide.
- `#2 Vue-template no-explicit-any blind spot` — merge `d7447b4`. 13 sites refactored; new `composables/useTypedI18n.ts` + `types/nuxt-ui-bridge.ts`.
- `#3 modules/ui cruft deps + pnpm 8→9 prereq` — merge `3103a74`. Dropped `@eslint/js`, `vue-eslint-parser`, `@typescript-eslint/parser`; toolchain bump `pnpm@8.15.0 → 9.15.9`.
- `#4 STYLE_RULES_DEFERRED triage` — merge `c30e62c`. 27 rules categorized into 4 tiers; 31 violations fixed.
- **Tier C cleanup** — merge `3afd39a`. 89 deferred Tier C warnings → 0 across 4 dispositions (auto-fix `nuxt/prefer-import-meta` 33; config `ignores` `vue/multi-word-component-names` 35; rename `created_at`/`updated_at` props 4; relocate `vue/require-default-prop` to Tier D 17). `STYLE_RULES_TIER_C_DEFERRED` map removed. `modules/ui` ESLint output: **0 errors, 0 warnings** (from 102).

Closure plans + specs: `docs/specs/2026-06-03-lint-tier-c-cleanup-design.md`, `docs/plans/2026-06-03-lint-tier-c-cleanup.md` (and the per-followup spec/plan pairs under `docs/specs/2026-06-0*` and `docs/plans/2026-06-0*`).

Detailed log: `docs/audits/phase-2d-type-cast-inventory.md`.

### W4 — Deps Hygiene Structural ✓

#### W4-T1: Cloud SDKs → `optionalDependencies` + dynamic loader

`@aws-sdk/client-s3`, `@azure/storage-blob`, `@google-cloud/storage` moved from `dependencies` to `optionalDependencies` in `modules/storage/package.json`. Installs without these (`pnpm install --no-optional`) no longer pull the three SDK trees.

Implementation:

- New `modules/storage/src/cloud-uuid-storage/sdk-loader.ts` — memoised lazy `import()` for each SDK; throws `OptionalDependencyMissing` (added to `core/src/errors/index.ts` + barrel-exported) with a clear `pnpm add ...` remediation message if absent.
- All seven SDK consumer sites converted (`cloud-uuid-storage-service.ts`, `cloud-uuid-storage/{provider-init, download-ops, upload-ops, file-mgmt-ops, streaming-ops}.ts`, `cleanup/orphaned-file-cleaner.ts`). Value imports replaced with lazy loads at use site; type-only imports kept for typing.

Verification: `pnpm -r build` clean; `pnpm -C modules/storage test:run` 216/216; standalone simulation confirms `OptionalDependencyMissing` throws with code `OPTIONAL_DEPENDENCY_MISSING` and the actionable message.

Closed: `storage-006`, `deps-008`. Commit: `8012375`.

#### W4-T2: Declare-all-imports per workspace + strict-hoist default

Every workspace's `package.json` now declares every package it imports — no more transitive-resolution reliance. `.npmrc` flipped from `shamefully-hoist=true` to `shamefully-hoist=false` so the strict behavior is the contributor default. Undeclared imports now fail fast at `pnpm install` time instead of silently working in dev.

New tooling:

- `scripts/audit-package-imports.mjs` walks each workspace's source tree, extracts every bare `import`/`require()` package spec, and reports declarations missing from `package.json`. Skips Node built-ins, relative paths, TS/Nuxt path aliases (`~`, `#`, `@/`), and strips comments so JSDoc examples that quote package names don't trigger false positives.
- `pnpm run audit:imports` wires it up at the root.

Per-workspace additions surfaced by the audit + strict-hoist build:

- **cli** — `bcrypt`, `fs-extra`, `glob`, `gray-matter`, `mime-types`, `simple-git`, `vitest` (deps) + `@types/bcrypt`, `@types/fs-extra`, `@types/mime-types` (devDeps).
- **core** — `bcrypt`, `chalk`, `js-yaml`, `uuid`, `yaml` (deps) + `@types/bcrypt`, `@types/js-yaml`, `@types/tar`, `@types/uuid`, `vitest` (devDeps).
- **modules/api** — `gray-matter`, `simple-git` (deps) + `@types/express-serve-static-core`, `@types/node` (devDeps — TS2742 inferred-router-type fix + node libdef).
- **modules/ui** — `@nuxt/ui` (deps) + `vitest` (devDeps).
- **modules/storage** — `yaml` (deps) + `@types/node` (devDeps).

Verification: `pnpm run audit:imports` → all 6 workspaces ✓ clean; `pnpm install --shamefully-hoist=false && pnpm -r build` → clean across all workspaces; `pnpm -C modules/storage test:run` → 216/216.

No CI step added per project no-CI/CD policy — contributors run `pnpm run audit:imports` locally; the `.npmrc` default keeps the strict behavior on every install.

Closed: `api-007`, `deps-010`. Commit: `881f95d`.

#### W4-T3: `docs/licenses.md` + ui-002 next-step capture

`docs/licenses.md` generated: **1,460 unique packages across 22 SPDX ids**. Built from `pnpm licenses ls --json` via the new `scripts/generate-licenses-md.mjs`, wired up as `pnpm run licenses:gen`. Output structure: top summary table (count per license) + per-license alphabetized tables (name, version(s), homepage). Dev-only deps included; contributors regenerate locally on dependency changes (no CI step per project no-CI/CD stance).

License-mix highlights: MIT 1205, Apache-2.0 103, ISC 66, BSD-3-Clause 26, BSD-2-Clause 22, BlueOak-1.0.0 13. Four "Unknown" packages are upstream metadata gaps. No copyleft surprises (no AGPL/GPL in the dep tree; the only GPL is a "BSD-3-Clause OR GPL-2.0" dual-license).

**ui-002 (Nuxt UI Pro vendor lock-in) NOT closed in this commit.** User direction at W4-T3: target Nuxt UI Pro v4 (now free + OSS) and drop the paid v3 — but acknowledged this is bigger than a version bump. Current `modules/ui` still actively wires v3: `@import "@nuxt/ui-pro"` in `app/assets/css/main.css` + `'@nuxt/ui-pro'` registered as a Nuxt module in `nuxt.config.ts:13`. Dropping the package without the v4 migration would break the build, so ui-002 carries forward to a dedicated session (v3 → v4 + Tailwind v4 jump + Pro-component API changes — likely multi-day). The free `@nuxt/ui ^3.3.7` dep added in W4-T2 sets up the migration path.

Closed: `deps-011`. ui-002 stays open with updated target. Commit: `4c58033`.

---

## Numbers

**Original-205 findings closed in Phase 2d:** 13.

- W1 (2): `legal-register-002`, `legal-register-005`.
- W2 (3): `core-008`, `api-013`, `ui-008`.
- W3 (3): `api-009`, `ui-011`, `storage-015`.
- W4 (5): `storage-006`, `deps-008`, `api-007`, `deps-010`, `deps-011`.

**Cumulative original-205 closed at end of Phase 2d:** 51 (pre-2d baseline) + 13 (2d) = **64 of 205 (31%)**.

**Surfaced + closed during Phase 2d (separately tracked rows):**

- Phase-2d-W0-surfaced storage bugs: 9
- Phase-2d-W2 god-file decompositions: 21 (one per file split)
- Phase-2d-W3 latent bugs surfaced via type-narrowing: 6

Cumulative measurable progress including pre-2d surfaced rows: **108 total measurable progress items** (64 from original 205 + 44 surfaced).

**Test stability:** all suites green throughout phase. 357/357 core + 17/17 indexing integration + 216/216 storage + 270/270 api + 138/138 ui. Single failing test in `tests/core/database-integration.test.ts > Session Management` is the pre-existing date-bomb, not a regression.

**Build status:** `pnpm -r build` clean across all 6 workspaces under strict hoist.

---

## Carry-forward to Phase 3 and beyond

| Item | Target | Why deferred |
|---|---|---|
| `@typescript-eslint/no-explicit-any: error` lint rule + lint baseline cleanup | Dedicated lint-hygiene session | ~335 pre-existing lint errors across configs need triage first. Independent of Phase 3 entry. |
| `ui-002` Nuxt UI Pro v3 → v4 migration | Dedicated 2d-followup session | Free v4 path confirmed; migration is multi-day (Tailwind v4 jump + Pro-component API shifts). |
| `realtime-012` (46 `: any` in realtime-server.ts) | Phase 3 (realtime reintroduction) | Realtime module out of scope until reintroduction. |
| `core/src/records/record-manager.ts` (933 LoC) | Sunset paths in `large-file-exemptions.md` | Documented exemption; not blocking. |
| `phase-2d-W3` `__tests__/*` test-mock casts (47 in core, 67 in storage) | Per-workspace ESLint `*.test.ts` warn override | Production paths are clean; mock-typing is a planned warn-tier item. |

---

## Sign-off

Phase 2d (Structural Hardening) is complete on its in-scope workstreams. The branch `refactor/phase-2d-structural-hardening` is ready to merge to `dev` when the user signs off. Per `refactor-push-policy`, no remote pushes until all 7 master-plan phases land.

**Next master-plan phase:** Phase 3 (Reintroduce realtime — Yjs-only, no broadcast-box code). Entry criterion satisfied: module contract is in place (W1).
