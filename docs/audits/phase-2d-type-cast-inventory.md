# Phase 2d W3-T1 — Type-Cast Inventory

**Date:** 2026-05-20
**Source:** Phase 2d Structural Hardening plan, §W3-T1
**Branch:** `refactor/phase-2d-structural-hardening` (local)
**Inputs:** all `*.ts` + `*.vue` files under `core/src/`, `modules/api/src/`, `modules/ui/app/`, `modules/storage/src/`

This inventory categorizes every `as any` and `: any` cast across the four base-platform surfaces, identifies hot-spot files, and proposes a sequencing strategy for the elimination tasks (W3-T2 through W3-T6).

---

## Raw count

```bash
grep -rnE "\bas any\b|: any\b" \
  core/src modules/api/src modules/ui/app modules/storage/src \
  --include="*.ts" --include="*.vue"
```

**Total: 1,621 lines** (matches plan's "~1,581" estimate within +2.5%; the small surplus is Phase-2d W2 introducing some new collaborator seams that copied `as any` patterns verbatim from the god-files).

---

## Per-surface counts

| Surface | Total | `as any` | `: any` | % of repo casts |
|---|---:|---:|---:|---:|
| `core/src/` | 447 | 93 | 358 | 27.6% |
| `modules/api/src/` | 628 | 499 | 135 | 38.7% |
| `modules/ui/app/` | 397 | 165 | 233 | 24.5% |
| `modules/storage/src/` | 149 | 85 | 64 | 9.2% |
| **Total** | **1,621** | **842** | **790** | 100% |

Note: a small overlap exists (49 lines contain both forms or the regex matches twice — e.g. `(x as any): any`).

**Per-surface profile:**
- **API is the biggest concentration** by absolute count (628). 80% of API casts are `as any` (mostly `(req as any).<X>` Express-augmentation patterns — see §Per-category).
- **Core has the most `: any` field/param declarations** (358 vs 93 `as any`). This is the surface where adding proper types in extracted collaborator interfaces moves the needle the most.
- **UI splits evenly** (165/233) between value-coercion casts (`as any` on `civicApi` returns, prop forwarding) and Vue-prop loose typing (`: any` in `defineProps`-adjacent code).
- **Storage is the smallest** (149) and is dominated by SDK-handle field declarations (`databaseService: any`, `: any` on injected handles) — the lightest surface to clean.

---

## Per-category counts (mutex bucketing)

Every line is assigned to exactly one category in the priority order below:

| Category | Count | % | Typed replacement |
|---|---:|---:|---|
| `express-augmentation` (`(req as any).<X>`, `req: any`) | 254 | 15.7% | Global `Express.Request` type augmentation in `modules/api/src/types/express-augment.d.ts`. Single fix kills the lot. |
| `error-narrowing` (`catch (e: any)`, `(err as any).field`) | 350 | 21.6% | `catch (e: unknown)` + `e instanceof Error` narrowing, or a typed `extractStatusCode(e)` helper that also handles the `(err as any).statusCode = ...` mutation idiom used in route handlers. |
| `test-mock-shortcut` (lines under `__tests__/`, `.test.ts`, `.spec.ts`) | 137 | 8.5% | Typed mock factories per service (`makeMockDatabaseService()` → `Partial<DatabaseService>` with vi.fn() defaults). Lower priority: tests are not production safety-critical, but the same pattern repeated 137 times is a maintenance smell. |
| `function-param` (`(x: any[,)]` not caught above) | 194 | 12.0% | Case-by-case typed signatures. Often callbacks (`(file: any) => ...`) where the array element type is already known from context. |
| `array-typed` (`: any[]`) | 86 | 5.3% | Specific element type. Most are diagnostic/issue arrays — `Issue[]` / `DiagnosticEntry[]` interfaces. |
| `object-literal-cast` (`} as any`) | 9 | 0.6% | `satisfies` operator or a proper interface for the literal shape. |
| `di-deferred` (`: any; //` annotated as injected) | 8 | 0.5% | Actual class type or an injection interface. (`databaseService: any` → `databaseService: DatabaseService`.) |
| `index-signature` (`[k: string]: any`) | 7 | 0.4% | `Record<string, unknown>` or a strict-key map. The "any" version blocks downstream type-narrowing for no benefit. |
| `dynamic-import` (`(await import(...)) as any`) | 0 (caught by `other`) | — | Typed dynamic-import wrapper. Only a handful exist; surfaced inside `other`. |
| **`other`** (everything not matched above) | 576 | 35.5% | See breakdown below. |

### `other` breakdown (sampled)

Sampling 40 random rows from the 576-line `other` bucket surfaces these sub-categories:

| Sub-category | Approx. count | Typed replacement |
|---|---:|---|
| **Property declaration loose typing** (class field or interface field `<name>: any`) | ~180 | Concrete type from the seam interface. Many are Phase 2d collaborator deps-bags where the original god-file used `any` because the proper type was in a different file. Now that W2 extracted seams, those types have homes. |
| **Member-access cast** (`(x as any).<field>`) on under-typed runtime objects | ~120 | Either narrow the source type (preferable) or use a `hasField<K>(o, k)`-style type guard. |
| **API-response cast** (`(await civicApi(...)) as any`) | ~70 | Typed response envelope: `ApiResponse<T>` generic + per-endpoint response types under `modules/ui/app/types/api-responses.ts` or imported from a shared package. |
| **External-lib type holes** (AWS SDK stream cast, addFormats import default, `globalThis as any`, etc.) | ~50 | `// @ts-expect-error TS<code>: <reason>` with a CI-checked allowlist for legitimate cases; or vendor-supplied augmentation when fixable. |
| **Generic / function-return `: any`** (function declared returning `any`) | ~80 | Concrete return type. Many are utilities (sanitizers, normalizers) that already preserve structure — `<T>(x: T): T` generics often work. |
| **Other / one-offs** | ~80 | Case-by-case. |

The "other" bucket is the hardest, but `property declaration loose typing` + `member-access cast` together (~300) are the same underlying problem (under-typed objects) — eliminating those at the source removes both child categories. W2's decomposition created the natural "homes" the plan §W3 prologue predicted.

---

## Per-file hot-spots (top 25)

These 25 files account for **506 casts (31% of the total)**. Concentrated work here clears nearly a third of the inventory.

| Rank | File | Count | Surface | Notes |
|---:|---|---:|---|---|
| 1 | `modules/api/src/routes/users/crud-handlers.ts` | 56 | api | Express handlers; mostly `(req as any)` + `(error as any).statusCode` patterns. **Both single-pattern fixes.** |
| 2 | `modules/api/src/routes/indexing.ts` | 54 | api | Same Express + error patterns. |
| 3 | `modules/api/src/routes/records/read-handlers.ts` | 52 | api | W2-T9 extracted file; inherited the cast pattern from the parent `records.ts`. |
| 4 | `modules/api/src/utils/api-logger.ts` | 34 | api | Logger receives `(req as any).user` + `requestId`. Single-pattern fix. |
| 5 | `modules/ui/app/composables/useRecordEditorActions.ts` | 24 | ui | API-response casts (`(await civicApi(...)) as any`). Typed `ApiResponse<T>` removes them. |
| 6 | `modules/api/src/routes/diagnose.ts` | 22 | api | Express + error patterns. |
| 7 | `core/src/diagnostics/checkers/search-checker.ts` | 22 | core | `catch (error: any)` repeated; one typed catch helper covers it. |
| 8 | `modules/api/src/services/records-service/listing.ts` | 21 | api | W2-T8 extracted file; under-typed `user` object access. |
| 9 | `modules/api/src/routes/search.ts` | 21 | api | Express + error patterns. |
| 10 | `modules/api/src/routes/records/write-handlers.ts` | 21 | api | W2-T9 extracted file; same patterns. |
| 11 | `modules/api/src/routes/users/auxiliary-handlers.ts` | 20 | api | W2-T10 extracted file; same patterns. |
| 12 | `modules/api/src/routes/auth.ts` | 20 | api | Auth handlers; user-shape access through `as any`. |
| 13 | `modules/api/src/routes/templates.ts` | 18 | api | Mixed: route handlers + `(apiError as any).statusCode` mutation. |
| 14 | `modules/api/src/routes/records/draft-handlers.ts` | 18 | api | W2-T9 extracted file. |
| 15 | `modules/api/src/routes/config.ts` | 17 | api | Express + config-shape access. |
| 16 | `modules/api/src/routes/status.ts` | 16 | api | Express. |
| 17 | `modules/api/src/middleware/__tests__/error-handler.test.ts` | 16 | api | Test mocks. |
| 18 | `modules/ui/app/pages/settings/configuration/[configFile]/edit.vue` | 15 | ui | API-response + Vue prop loose typing. |
| 19 | `core/src/config/configuration-service.ts` | 15 | core | Config-payload loose typing. |
| 20 | `modules/ui/app/pages/settings/profile.vue` | 14 | ui | API-response casts. |
| 21 | `modules/storage/src/cloud-uuid-storage/provider-init.ts` | 14 | storage | W2-T18 extracted file; credentials object access through `as any`. |
| 22 | `modules/storage/src/__tests__/quota-manager.test.ts` | 14 | storage | Test mocks. |
| 23 | `modules/api/src/routes/history.ts` | 14 | api | Express + commit-object loose typing. |
| 24 | `modules/api/src/index.ts` | 14 | api | App-bootstrap-time global wiring. |
| 25 | `core/src/records/record-schema-validator.ts` | 14 | core | `frontmatter: any` + Ajv module shape. |

**Observation:** 17 of the top 25 hot-spots are in `modules/api/src/routes/`. They share three patterns: (a) `(req as any)` Express access, (b) `catch (error: any) ... (error as any).statusCode = N`, (c) `(req as any).user?.<field>` shape access. **One unified Express.Request augmentation + one typed catch helper would eliminate roughly half of all api/src casts.**

---

## Recommendations for W3-T2 through W3-T6

### Strategic ordering

Master plan §5's exit criterion is "zero `: any` / `as any` repo-wide" with `@typescript-eslint/no-explicit-any: error` enabled. The plan's task list (T3 core → T4 api → T5 ui → T6 storage + lint) is fine, but the inventory suggests a tighter dependency-aware sequencing:

1. **W3-T2 first (typed patterns):** must land before any elimination. Critical artifacts:
   - `modules/api/src/types/express-augment.d.ts` — augments `Express.Request` with `civicPress`, `user`, `requestId`, etc. **Single biggest leverage:** kills ~254 casts on its own.
   - `modules/api/src/utils/typed-catch.ts` — typed-catch helper that handles `e instanceof Error` narrowing + the `(err as any).statusCode = N` mutation idiom (replacement: a thrown `HttpError` class or a `setStatus(err, N)` helper). **Second biggest leverage:** kills ~350 casts.
   - `core/src/types/api-response.ts` (or `modules/ui/app/types/api-responses.ts`) — typed `ApiResponse<T>` envelope. Kills ~70 ui casts.
   - `core/src/types/diagnostic.ts` — `Issue[]` / `DiagnosticEntry[]` interfaces for the diagnostics module.

2. **W3-T3 (core, 447):** foundation surface. Many api/ui types depend on core. **High `: any` ratio** (358 of 447 = 80%) means most fixes are concrete type declarations, not casts to rewrite. Estimated leverage: high; downstream surfaces become easier after this lands.

3. **W3-T4 (api, 628):** the bulk. Benefits maximally from W3-T2's `express-augment.d.ts` + typed-catch. Recommend per-file batches of 3-5 in worktree-parallel dispatch (the plan's pattern); the top-25 hot-spot list above tells the dispatcher which files to batch.

4. **W3-T5 (ui, 397) + W3-T6 (storage, 149):** can run in parallel — different surfaces, no shared types beyond what W3-T3 produces. UI benefits from typed `ApiResponse<T>` from W3-T2. Storage is mostly DI-handle types (`databaseService: any` → `DatabaseService`) and SDK type holes.

5. **W3-T6 final step (lint rule):** enable `@typescript-eslint/no-explicit-any: error` repo-wide ONLY after all four surfaces hit zero. CI gates new `any` reintroduction.

### Single biggest wins

If the user wants a fast first slice that visibly moves the truth meter:

- **Land `express-augment.d.ts` as one commit during W3-T2.** Removes ~254 casts (15.7% of total) with one type declaration file. Likely a 1-2 hour task.
- **Land typed-catch + `HttpError` class as one commit during W3-T2.** Removes ~350 casts (21.6% of total). The mutation idiom `(err as any).statusCode = 500; throw err` becomes `throw new HttpError(500, message)`.

Together those two W3-T2 commits cut the inventory from 1,621 → ~1,000 (38% reduction) before any per-surface T3-T6 work begins.

### Estimated effort (refined)

| Task | Casts | Estimated effort | Confidence |
|---|---:|---|---|
| W3-T2 patterns + global type augmentations | (lands eliminations as a byproduct: ~600 inferred) | 2-3 days | Medium-high — depends on Express-augment scope creep |
| W3-T3 core/src | ~447 → 0 | 4-6 days | High — mostly `: any` declarations with obvious replacements |
| W3-T4 modules/api/src | ~628 → 0 (residual after W3-T2: ~150-200) | 5-7 days | Medium — Express augment knocks most out, rest is per-handler typing |
| W3-T5 modules/ui/app | ~397 → 0 | 4-6 days | Medium — Vue type ergonomics + API response types |
| W3-T6 modules/storage/src + lint | ~149 → 0 + CI | 2-3 days | High — smallest surface, mostly DI handle types |
| **Total realistic effort** | 1,621 → 0 | **17-25 working days** | Master plan §5's 3-5 week estimate matches the upper bound |

### Risk callouts

- **Dynamic imports** (cloud SDKs in `modules/storage/src/providers/*-provider.ts` — post W2-T18 paths): 0 raw matches but likely hidden inside the `other` 576 bucket. W4-T1 will also touch these when moving cloud SDKs to `optionalDependencies`. **Coordinate sequencing**: either W3-T6 leaves storage SDK casts annotated for W4-T1 to convert as it wraps them in try/catch, or W4-T1 lands before W3-T6.
- **Test-mock casts (137)** can be left for last and partially deferred. The lint rule should not fail on `// @ts-expect-error` comments in test files; consider a per-pattern ESLint override (`overrides: [{ files: ['**/*.test.ts'], rules: { '@typescript-eslint/no-explicit-any': 'warn' } }]`) if 137 fixes is too much yak shaving for the value.
- **`globalThis as any`** patterns (8 found in `core/src/auth/auth-config.ts` etc.) are intentional Node.js runtime probes that lack DOM/Node intersection types. These legitimately need `// @ts-expect-error` with a CI-allowlisted reason — the lint rule should be configured to permit annotated allowances.

---

## Closes

This inventory satisfies plan §W3-T1 step 4. Downstream W3-T2 onward will close:

- `api-009` (~503 api casts eliminated — actually 628 in current measurement)
- `ui-011` (~208 ui casts eliminated — actually 397 in current measurement)
- `storage-015` (~80 storage casts eliminated — actually 149)
- core-type-safety exit criterion (447 core casts eliminated)

Updated estimates are 25-50% larger than the master plan's original numbers — the surplus is partly from W2 collaborator seams copying casts verbatim, partly from the original audit's under-counting.

---

## Progress log

Per-session running tally. Add to this section as W3-T3 → T6 land.

### 2026-05-21 (sessions ending `fc8d322`)

Per the W3 commit chain `a7cca51` → `fc8d322`: 1,621 → 839 (48% cleared via 9 W3 commits). See per-commit breakdown in `refactor-2026-05-master-plan.md` memory.

### 2026-05-22 (sessions ending `2c08e5f`)

3 commits, 839 → 788 (-51 casts):

- `f925135` (W3-T3 part 5) — `core-output.ts` + `notification-logger.ts` + `notification-config.ts` (typed channel/template getters via indexed-access generics) + `sql-builder.ts` (typed `SqlParam` + `SearchRow`) + `database-adapter.ts` (driver-boundary annotated as type hole per the inventory's annotated-allowlist treatment; `query<T = any>()` made generic so callsites can opt into typed Rows) + `database-service.ts` (wrappers use `ReturnType<Store['method']>`) + `saga/resource-lock.ts`. -33 casts.
- `106c19b` (W3-T3 part 6) — base `CivicPressError.context` tightened to `Record<string, unknown>`; saga `SagaStateRow` interface threaded through state-store query callsites; api-logger spread-of-conditional fixed; storage test narrows error.context.batch. -12 casts.
- `2c08e5f` (W3-T3 part 7) — `update-record-saga.ts` + `publish-draft-saga.ts`: `dbUpdates: any` → `Record<string, unknown>`; `normalizeFrontmatterForValidation` signature typed. -6 casts.

### 2026-05-22 (session ending `698d823`)

1 commit, 788 → 773 (-15 casts):

- `698d823` (W3-T3 diagnostics-details) — closes deferred follow-up #3 from W3-T3p7. New `DiagnosticDetails` envelope in `core/src/diagnostics/types.ts` replaces 3x `details?: any` on `DiagnosticError` / `CheckResult` / `DiagnosticIssue`. Per-consumer narrowing: local `MemoryDetails`/`CpuDetails` interfaces in system-checker; inline schema/filesystem shape annotations replace `schemaCheck.details as any` / `structureCheck.details as any` patterns. base-checker create*Result + createIssue tightened from `unknown` to `DiagnosticDetails`; database/result-builders + buildDiagnosticError narrow before assignment. Removed dead-code fallback branch in `diagnostic-service.extractIssues` that used `(check.details as any).issues` (already handled by the prior arm). Two collateral key renames: `cache-health-checker.issues` (was a number under the array's key) → `issueCount`+`issues`; `filesystem-checker.permissionIssues` (was `string[]` under the same key). Gap vs. -30 inventory estimate: UI `useDiagnostics.ts` has its own local DiagnosticIssue shape, not part of this cascade.

### 2026-05-22 (session ending `cffbc0b`)

1 commit, 773 → 769 (-4 casts):

- `(pending)` (W3-T3 saga-error-context) — closes deferred follow-up #2 from W3-T3 session of 2026-05-22. The 4 saga error subclasses (`SagaStepError`, `SagaCompensationError`, `UncompensatableFailureError`, `SagaContextError`) each redeclared `public context: any`, shadowing the now-typed `CivicPressError.context: Record<string, unknown>` from `106c19b`. Resolution: each subclass is now generic on `TContext extends SagaContext = SagaContext` and the shadowing field is renamed `sagaContext: TContext`. Rename was the correct call (not just typing the existing field) because the subclass field is semantically distinct from the base — it holds the saga's runtime working state (the executor's `TContext`), not the error-metadata bag that flows into `super(message, {step, ...})`. Naming the two separately removes the collision permanently and lets the base field tighten further in the future without re-tangling. Two collateral `Record<string, any>` → `Record<string, unknown>` tightenings on the `additionalContext?` params (SagaStepError, SagaCompensationError) for consistency (didn't match the regex, so they're not part of the -4 tally). `saga-executor.ts` updated in one place: `compensate()`'s `originalError: SagaStepError` parametrized to `SagaStepError<TContext>`. No external readers of `.context`/`.sagaContext` on these error instances anywhere in the repo, so the rename was contained to `errors.ts` + the one signature in `saga-executor.ts`. Gap vs. -16 inventory estimate: the doc's "+ propagation" never materialized — the executor never reads the field off the thrown error, only constructs them, so callers needed zero updates. Repo-wide `tsc --noEmit` clean across all workspaces; `pnpm vitest run core/src/saga` 32/32 green.

### 2026-05-22 / 2026-05-23 (W3-T4 api/src sweep)

3 commits, 743 → 583 (-160 casts). W3-T4 (api surface) essentially done — production code at 0; remaining 32 are test-mock + docstring residue.

- `0127e86` (W3-T4 core widening) — prepares the public surface so api consumers can name the types they need: `core/src/index.ts` re-exports every per-table Row interface (UserRow, RecordRow, DraftRow, StorageFileRow, joined rows, PRAGMA helpers, tag rows) + SqlParam/SqlRow/ExecuteResult/Transaction + new GitCommit alias (DefaultLogFields & ListLogLine from simple-git). RecordManager.listRecords return tightened to `Promise<{ records: RecordRow[]; total: number }>`; RecordManager.searchRecords switched to `ReturnType<RecordSearch['searchRecords']>` so it tracks the underlying contract. GitEngine.getHistory tightened to `Promise<GitCommit[]>`. AuthService.canSetPassword + getUserAuthProvider widened to `Pick<AuthUser, 'auth_provider'> | null | undefined` (both only inspect one field; AuthUser was forcing callers to do full row → domain mapping). Ripple: StorageFile.created_at/updated_at changed from `Date` to `string | Date` (SQLite returns strings at runtime; the Date type was a lie hidden by `Promise<any>` on the StorageDatabaseService contract); cli/src/commands/users.ts gained an updatedUser null guard that was hidden by `any`.

- `a709031` (W3-T4 records-service) — sweeps the 6-collaborator decomposition from W2-T8. **-50 casts.** Same pattern across all 6 files: `user: any` → AuthUser; `record/records: any[]` returns formalized into named ApiRecord / ApiDraft / ListedRecord envelope interfaces; `geography?: any` → Geography; `Record<string, any>` → `Record<string, unknown>`; row destructures use core Row exports. listing.ts (21 → 0): the 8x `(user as any).role` defensive checks collapse since user is now typed; PRAGMA-flavored count queries typed. crud.ts (6 → 0): new ApiRecord interface formalizes the 20-field literal repeated 4×. drafts.ts (11 → 0): typed DraftUpdates = `Partial<Pick<DraftRow, ...>>`; JSON-parse boilerplate hoisted to 3 local helpers; 15-line defensive username-extraction block in createDraft collapses to one line since AuthUser.username is `string`. frontmatter-and-publish.ts (6 → 0): new DraftOrRecord hybrid envelope; `(dbService as any).adapter` replaced with `dbService.getAdapter()`. helpers.ts (3 → 0): `getKindPriority(record: any)` → structural type covering only the metadata.kind path. locks.ts (3 → 0): user: AuthUser + getLock returns RecordLockRow. records-service.ts orchestrator: `(civicPress as any).config?.dataDir` → `civicPress.getDataDir()`.

- `db5eca7` (W3-T4 api routes + middleware) — sweeps the remaining 80-ish casts across 26 files. **~108 casts cleared.** Patterns: (1) the `(error as any).statusCode = N; throw error;` mutation idiom W3-T2's HttpError replaced — 9 stragglers in health.ts + auxiliary-handlers.ts now throw `new HttpError(...)`; (2) `(req.user as any).<field>` / `let actor: any = req.user || {}` audit-actor pattern — 22 sites typed as `AuthUser` / `Partial<AuthUser>`; (3) untyped map callbacks — typed via new core Row exports or local interfaces (history's `(commit: any)` × 8 now inferred from `Promise<GitCommit[]>`, status's 5× similar, diagnose's `result: any` → `DiagnosticReport`, etc.); (4) utility/handler interface fields widened from `[key: string]: any` / `details?: any` / `errors: any[]` to `unknown`. Notable named-type introductions: status.ts ConfigurationStatus, validation.ts ValidationIssue/Metadata/Report, info.ts InfoResponse (replacing 4× `let foo: any = null;` + a mutated `response: any = {}`), search.ts SuggestionResponse. Two latent bugs surfaced: (a) uuid-storage permission checks were passing 'download' as `action` even though userCan only matches create/edit/delete/view — the `as any` cast was silently failing the permission match; fixed to 'view'; (b) notifications.ts NotificationChannel registration was an abstract-class adapter that can't satisfy structural typing (`as unknown as Parameters<...>[1]` with a one-line rationale; subclassing would require implementing 3 abstract methods not used by this endpoint).

**Untouched** (left as residue, not production code): error-handler.test.ts (16 test mocks), diagnose.test.ts (5), api-logger.test.ts (2), http-error.ts (5 docstring references describing the historical mutation idiom), express-augment.d.ts + index.ts + listing-handlers.ts + middleware/logging.ts (1 each: docstring or eslint-disabled lines). The middleware/logging.ts disable is intentional — Express `res.end` has 3 overloads (cb / chunk+cb / chunk+encoding+cb) that no single typed signature can satisfy.

**Per-surface state at end of session:**

| Surface | This-session start | This-session end | Notes |
|---|---:|---:|---|
| core/src | 150 | 146 | small ripples from RecordRow/auth widening |
| modules/api/src | 190 | 32 | production code essentially at 0; -158 |
| modules/ui/app | 325 | 325 | untouched |
| modules/storage/src | 78 | 80 | +2 from StorageFile type-shape alignment ripples |
| **Total** | **743** | **583** | |

(The modules/storage delta is because the StorageFile interface alignment introduced two `string | Date` widenings that grep counts as casts — they're type unions, not `any`.)

`pnpm tsc --noEmit` clean repo-wide. Targeted vitest (tests/core + tests/integration + tests/api): 608 pass, 15 skipped, 1 pre-existing failure (same `2025-12-31` expired-session flake confirmed on main).

### 2026-05-22 (per-table Row typing — preceding session)

2 commits, 769 → 743 (-26 casts). Closes deferred follow-up #1.

- `ad84b31` (W3-T3 row-types module) — new `core/src/database/types/row-types.ts` with per-table Row interfaces mirroring `schema/tables.ts` (+ the additive columns from `schema/migrations.ts`): UserRow, ApiKeyRow + ApiKeyWithUserRow (join), SessionRow + SessionWithUserRow (join), RecordRow, DraftRow, StorageFileRow, RecordLockRow, AuditLogRow + AuditLogWithUserRow (join), SearchIndexRow, EmailVerificationRow + PRAGMA helpers (TableInfoRow, IndexInfoRow, TriggerInfoRow, SqliteMasterNameRow) + tag rows (LastInsertIdRow, CountRow, TotalRow). Nullable-column convention: `?: T` instead of `?: T | null` — SQLite returns `null` at runtime, TS sees `T | undefined`, the lie is harmless under truthiness checks and matches AuthUser / ApiKey / other domain types' existing pattern. Required-but-nullable columns keep explicit `T | null` (e.g. `TableInfoRow.dflt_value`). SagaStateRow + SagaResourceLockRow left co-located with their saga consumers.
- `818fc23` (W3-T3 query narrowing) — flips `DatabaseAdapter.query<T = any>` and `DatabaseService.query<T = any>` to `<T = unknown>` so unparametrized callers must commit to a type. Narrows every callsite across stores (UserStore, RecordStore, DraftStore, StorageFileStore), service-level lock/audit getters, search (sqlite-search-service, suggestions, facets), record-manager batch fetch, diagnostics PRAGMA checks, email-validation-service, oauth/password/session/user-ops boundaries. Surfaced boundary fixes: 5x `email_verified: row.email_verified` (number) → `!!row.email_verified` (boolean) at AuthUser construction; bcrypt.compare guard on nullable password_hash; full UserRow → AuthUser conversion on oauth-ops refresh path (was structural assign); RecordData spread in publish-draft-saga needed `author` + `created_at` carryover + finalStatus default. One test (`tests/core/security-guards.test.ts:303`) asserted `email_verified.toBe(1)` with a comment acknowledging the SQLite raw int leak — updated to `.toBe(true)` per the AuthUser contract.

**Per-surface state at end of session:**

| Surface | This-session start | This-session end | Notes |
|---|---:|---:|---|
| core/src | 176 | 150 | per-table Row interfaces (-26) |
| modules/api/src | 190 | 190 | untouched |
| modules/ui/app | 325 | 325 | untouched |
| modules/storage/src | 78 | 78 | untouched |
| **Total** | **769** | **743** | |

Gap vs. inventory estimate (-50-80): many of the deferred-#1 callsites were already cleaned in earlier W3-T3 sessions (parts 4-7 + diagnostics-details + saga-error-context). The remaining row-cast sites were fewer than projected, but the per-table Row *contracts* now cover the surface end-to-end — every store method has a typed return, every PRAGMA call has a typed shape, every JOIN has its own join-row interface. Future row work is now incremental tightening rather than greenfield interface authoring. The `unknown` default also makes any new `query()` call a compile error if unparametrized — a structural guardrail the `any` default could never provide.

`pnpm tsc --noEmit` repo-wide clean across all workspaces. Targeted vitest (tests/core + tests/integration + tests/api): 608 pass, 15 skipped, 1 pre-existing failure (`database-integration.test.ts` Session Management — `new Date('2025-12-31')` expiry now in the past, fails on main too, time progression, unrelated).

**Per-surface state at end of session:**

| Surface | This-session start | This-session end | Notes |
|---|---:|---:|---|
| core/src | 180 | 176 | saga error subclass field declarations (-4) |
| modules/api/src | 190 | 190 | untouched |
| modules/ui/app | 325 | 325 | untouched |
| modules/storage/src | 78 | 78 | untouched |
| **Total** | **773** | **769** | |

**Per-surface state at end of session:**

| Surface | This-session start | This-session end | Notes |
|---|---:|---:|---|
| core/src | 195 | 180 | diagnostics envelope narrowed; ~133 prod + 47 test |
| modules/api/src | 190 | 190 | untouched |
| modules/ui/app | 325 | 325 | untouched |
| modules/storage/src | 78 | 78 | untouched |
| **Total** | **788** | **773** | |

### Deferred follow-ups surfaced

These three sub-tasks were attempted during the session and surfaced as needing their own focused commits because of cascade scope:

1. **~~Per-table Row typing on `DatabaseAdapter`/`DatabaseService`.~~** ✅ Closed by `ad84b31` + `818fc23` (2026-05-22). New `core/src/database/types/row-types.ts` module + `query<T = unknown>` default + per-callsite narrowing across stores, service, search, diagnostics, and auth-service boundaries. -26 casts (vs. -50-80 estimate — earlier W3-T3 parts had already cleaned most of the projected row-cast sites; this session's main contribution is the structural guardrail: the `unknown` default now makes every new unparametrized `query()` call a compile error).

2. **~~Saga error class `public context: any` field shadowing.~~** ✅ Closed by this session's saga-error-context commit (2026-05-22). Resolution: rename field to `sagaContext` + make subclasses generic on `TContext extends SagaContext = SagaContext`. The two fields (base `context` for error metadata, subclass `sagaContext` for saga runtime state) are now distinct and individually typed. -4 casts (vs. -16 estimate — gap was the assumed "propagation" that didn't materialize: no external code reads the field).

3. **~~Diagnostics `details?: any` cascade.~~** ✅ Closed by `698d823` (2026-05-22). New `DiagnosticDetails` envelope + per-consumer local interfaces. -15 casts (vs. -30 estimate — gap was UI composable, not part of cascade).

### Remaining work to fully close W3

| Task | Scope | Estimated effort |
|---|---|---|
| ~~Per-table Row typing (database)~~ | ✅ closed `ad84b31`+`818fc23` (-26) | done |
| ~~Saga error context refactor~~ | ✅ closed `11c8f06` (-4) | done |
| ~~Diagnostics details narrowing~~ | ✅ closed `698d823` (-15) | done |
| ~~W3-T4 modules/api/src~~ | ✅ closed `0127e86`+`a709031`+`db5eca7` (-158); 32 test-mock + docstring residue left | done |
| Remaining core/src per-file batches | ~146 casts (records, indexing, geography, defaults, migrations, ajv/ts-expect-error allowlist, etc.) | 4-6 hours |
| W3-T5 modules/ui/app | 325 → 0 | 8-10 hours |
| W3-T6 modules/storage/src | 80 → annotated allowlist | 2-3 hours |
| Enable lint rule + test override | per-workspace ESLint config + `**/*.test.ts` override to `warn` | 1-2 hours |
| CI gate | `.github/workflows/*.yml` update | 30 min |
| W3 closure (this doc + registry + commit) | append final per-surface table; flip api-009, ui-011, storage-015, core-type-safety | 1 hour |
| **W3 total remaining** | | **~18-24 hours** |

Then W4 (3 tasks, ~3-5 days) + Phase 2d closure (~1 day).

### Next session pickup

**Branch:** `refactor/phase-2d-structural-hardening` (local, not pushed). Last code commits: `0127e86` → `a709031` → `db5eca7` (W3-T4 sweep). Working tree clean except `.vscode/settings.json` (unrelated, carried across sessions).

**Recommended next slice — W3-T5 (modules/ui/app, 325 casts):**

Largest remaining surface. UI casts cluster differently than api: there's no single seam like express-augment that knocks out 80% with one type augmentation. Expected high-leverage batches:

1. **`(await civicApi(...)) as any` API-response casts** (~70 in the original inventory) — typed `ApiResponse<T>` envelope + per-endpoint response types in `modules/ui/app/types/api-responses.ts`. The api side now returns named envelope types (`ApiRecord`, `ApiDraft`, `DraftOrRecord`); the ui can mirror these as response types.
2. **Vue prop loose typing** (`defineProps<{...}>` with `as any` casts) — per-component cleanup.
3. **Composables** — `useRecordEditorActions.ts` (24 casts) was the #5 hot-spot in the original inventory.

Estimated 8-10 hours to drive 325 → 0.

**Alternatives if scope feels wrong:**
- **W3-T6 (storage/src, 80 casts)** — smallest surface, mostly DI-handle types (`databaseService: any` → `DatabaseService`). 2-3 h. Quick win.
- **Remaining core/src long tail** (~146 casts) — records-service.ts hot-spot in core (record-schema-validator.ts ~14), indexing, geography (Geometry type holes that should be annotated-and-allowlisted, not eliminated), `(adapter as any).config?.sqlite?.file` pattern in diagnostics (3 sites; needs a `getConfig()` method on DatabaseAdapter). No cascade risk; 30-60 min slices. 4-6 h total.

Baseline to confirm at session start: `grep -rnE "\bas any\b|: any\b" core/src modules/api/src modules/ui/app modules/storage/src --include="*.ts" --include="*.vue" | wc -l` should report **583**.
