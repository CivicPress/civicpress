# CivicPress Manifesto-Fit Audit — Consolidated Findings Registry

**Date:** 2026-05-17 (Phase 1+2 baseline) + 2026-05-17 (Phase 3 extension)
**Source:** `docs/audits/sections/<module>.md` (14 files: 10 Phase 1+2 + 4 Phase 3 extension)
**Branch:** `audit/2026-05-16-manifesto-fit` (LOCAL ONLY — do not push)

| Severity | Phase 1+2 | Phase 3 | **Combined** |
|---|---|---|---|
| **Critical** | 17 | 3 | **20** |
| **High** | 47 | 18 | **65** |
| **Medium** | 60 | 19 | **79** |
| **Low** | 30 | 11 | **41** |
| **TOTAL** | **154** | **51** | **205** |

This is the consolidated, sortable findings list extracted from the per-module section files. Each row preserves the module's finding ID. Click the module name to open the source section for full context.

Severity definitions: **Critical** = manifesto hard-constraint violation or security risk affecting Trust/Transparency; **High** = roadmap-milestone threat or significant manifesto-principle degradation; **Medium** = quality/future risk; **Low** = cosmetic/polish.

---

## View 1: Findings sorted by severity, then module

### Critical (17)

| ID | Module | Description | Manifesto principle | Effort |
|---|---|---|---|---|
| api-001 | [api](sections/api.md) | `routes/info.ts:29-45` creates a fresh `CivicPress` instance per request (initialize + shutdown) to validate a token. DoS amplifier on an unauthenticated endpoint. | Trust | S |
| api-002 | [api](sections/api.md) | `routes/validation.ts` mounted with no upstream auth middleware; every route uses `requirePermission(...)`. Always 401s in production OR tests provide false coverage. | Trust | S |
| api-003 | [api](sections/api.md) | `routes/status.ts` mounted without `civicPress` injection. All status endpoints throw 500 outside test fixtures. | Trust | S |
| api-004 | [api](sections/api.md) | `routes/{hooks,workflows,export,import}.ts` are stub routers returning fake `200 OK` payloads while looking live to callers. | Transparency, Trust | M |
| broadcast-box-002 | [broadcast-box](sections/broadcast-box.md) | Recording pipeline produces only media blobs — no Markdown civic artifacts (attendees, motion markers, transcripts). Session record schema supports these fields; nothing populates them. | Markdown as civic format | L |
| broadcast-box-007 | [broadcast-box](sections/broadcast-box.md) | Rate limiter short-circuits in `NODE_ENV !== 'production'`. Combined with WIP `findByCode()` bcrypt-loop over 24h of unused codes, unauthenticated registration is a DoS vector in any dev/staging/demo. | Trust | S |
| storage-001 | [storage](sections/storage.md) | `QuotaManager.checkQuota()` defined and unit-tested but **never called from any upload path**. Storage quotas in config not enforced; one account can fill the disk. | Trust | S |
| storage-002 | [storage](sections/storage.md) | `GET /folders/:folder/files` requires `storage:download` permission even for `access: 'public'` folders. Citizens cannot enumerate public files without an account. | Transparency, Public Good, Equity | S |
| ui-001 | [ui](sections/ui.md) | Unsanitized markdown → `v-html` on public record-detail page (`pages/records/[type]/[id]/index.vue:675`) + `RecordPreview.vue:33`. No DOMPurify. XSS vector; combined with `localStorage`-stored JWT/CSRF tokens steals citizen sessions. | Trust, Public Good | S |
| ui-002 | [ui](sections/ui.md) | `@nuxt/ui-pro ^3.3.7` is a paid/license-gated commercial dep; `theme.env: "NUXT_UI_PRO_LICENSE"` hook still live in v3. Every page renders through `UDashboard*` chrome — removal is a UI rewrite. | **No vendor lock-in (HARD)** | L |
| ui-003 | [ui](sections/ui.md) | SPA-only mode (`ssr: false`), no service worker, no offline cache, no `<noscript>` fallback. Records not crawlable, app unusable when API unreachable. Autosave has no offline queue. | **Resilient archival (HARD)**, Equity, Public Good | L |
| notifications-001 | [notifications](sections/notifications.md) | Notification audit log is structurally dishonest: `notification-service.ts:158` hardcodes `success: true` regardless of delivery. `.system-data/notification-audit.jsonl` has 5,156 entries, 0 failed, 89% with empty `channels` arrays. | Transparency, Trust | S + M (replay) |
| notifications-002 | [notifications](sections/notifications.md) | `NotificationService.sendNotification()` awaits `security.validateRequest()` and `rateLimiter.checkRateLimit()` but never inspects either return value. Invalid + rate-limited requests proceed. | Trust, Public Good | S |
| notifications-003 | [notifications](sections/notifications.md) | PII sanitization applied to `request.data` (the template variable bag) BEFORE rendering. A user's email used as a template variable becomes `[REDACTED]` in the sent message body. PII regex itself has a literal-pipe bug. | Trust, Ease of Use | M |
| BB-HW-001 | [broadcast-box-hw](sections/civicpress-broadcast-box-hardware.md) | Hardware protocol doc shows `action` nested in `payload`; `services/connector/websocket_client.py:506-515` parses `action` from top level (matches what the server sends). The doc lies; the code has 3 defensive shape-coercion branches. No shared protocol-spec artifact between repos. | Transparency, Trust | S+M |
| BB-HW-002 | [broadcast-box-hw](sections/civicpress-broadcast-box-hardware.md) | README License section says "TBD, but will be OSI-approved." The flagship's hardware side has NO license. Municipalities cannot legally deploy or redistribute it. | Open-source | S |
| BB-HW-003 | [broadcast-box-hw](sections/civicpress-broadcast-box-hardware.md) | Recordings produce `.mp4` only. `storage/manual/` empirically has 69 `.mp4` files and 0 `.json` sidecars — even the partial metadata code path isn't running. No path from media blob to civic record. | **Markdown as civic format (HARD)** | L |

### High (47)

| ID | Module | Description | Manifesto principle | Effort |
|---|---|---|---|---|
| core-001 | [core](sections/core.md) | Two parallel uncoordinated audit systems (file JSONL + DB `audit_logs`). `RecordManager.updateRecord:778-785` writes DB audit without `userId`; sagas write neither. Audit trail bolted onto API/CLI, not core. | Transparency, Trust | M |
| core-002 | [core](sections/core.md) | `WorkflowEngine.approval/publication/archivalWorkflow` (`workflows/workflow-engine.ts:99-134`) are TODO log-only stubs registered as functional; `HookSystem.logHook` and workflow integration also TODOs. | Trust | M |
| cli-001 | [cli](sections/cli.md) | 15 of 27 `tests/cli/*.test.ts` files are placeholders asserting `"CLI testing disabled in this environment"` because `tests/utils/cli-test-utils.ts:145-156` returns a hardcoded mock. "120+ tests / 95% coverage" claim is inflated. | Trust | M |
| cli-002 | [cli](sections/cli.md) | `init.ts` (1,696 LoC) duplicates the `record_types_config`/`record_statuses_config`/`org-config` literal blocks ≥3 times across 5 helpers. Schema changes must be made in every copy or behaviour diverges. | Trust, Ease of Use | M |
| cli-003 | [cli](sections/cli.md) | `create.ts:77-86` and `status.ts:52-59` hardcode record-type and status whitelists, contradicting the "config-driven types and statuses" claim. Custom types via `config.yml` are silently rejected. | Ease of Use, Trust | S |
| cli-004 | [cli](sections/cli.md) | Two parallel auth UX trees: `civic login` with hidden `--logout/--status` flags vs six `auth:*` commands plus `me` alias. No clerk-friendly single auth flow. | Ease of Use | S |
| cli-005 | [cli](sections/cli.md) | CLI is English-only + emoji-heavy (16 commands emit emoji, `init.ts` has 43 emoji log lines). UI ships full EN/FR; CLI doesn't. No `--no-emoji`. French-speaking Quebec clerks on the project's own demo town get English-only CLI. | Ease of Use, Equity | M |
| cli-006 | [cli](sections/cli.md) | `cleanup --force` wipes `data/`, `.system-data/civic.db`, `modules/api/data` from a `process.cwd()`-derived root with no confirmation. Non-force confirmation is the literal string `"civicpress"` for every install. | Trust | S |
| api-005 | [api](sections/api.md) | `package.json` declares `express-rate-limit`, `helmet`, `compression` as runtime deps; **none imported anywhere in `src/`**. README advertises rate limiting that doesn't exist. | Trust | S |
| api-006 | [api](sections/api.md) | `routes/templates.ts:36-41` allocates a NEW `TemplateService` per request with `enableWatching: true`. Leaks file descriptors over time, re-pays init cost on every call. | Trust, Ease of Use | S |
| api-007 | [api](sections/api.md) | 3 runtime deps (`simple-git`, `gray-matter`, `nodemailer`, `@sendgrid/mail`) are imported by the API but not declared in `modules/api/package.json`. Works today via pnpm hoisting; a strict install breaks. | Trust, Open-source | S |
| api-008 | [api](sections/api.md) | `middleware/jwt-auth.ts` (228 LoC) is dead duplicate code — `jwtAuth`, `requireRole`, `requirePermission`, `optionalAuth` defined but never imported outside the file. Exact-name collision with `middleware/auth.ts` exports. | Transparency | S |
| ui-004 | [ui](sections/ui.md) | `app.vue:62-134` injects arbitrary HTML and re-executes scripts from `/api/v1/info`'s `analytics.inject_head|body_start|body_end` payloads with no allow-list or origin check. Token-theft vector. | Trust, Transparency | M |
| ui-005 | [ui](sections/ui.md) | "UI 80+ tests passing, 85% coverage" claim is false. Reality: 1 test file with 32 cases for one utility. 0 component, page, composable, or store tests. | Trust | L |
| ui-006 | [ui](sections/ui.md) | i18n incomplete despite "Complete EN/FR" claim. `pages/settings/setup.vue`, `pages/settings/configuration/index.vue` entirely hardcoded English. `useErrorHandler.ts` titles all English. Multiple other stranded EN strings. | Equity, Ease of Use | M |
| ui-007 | [ui](sections/ui.md) | Pinia `records.ts:7-24` hard-codes a closed union for record `type` and `status`; `useRecordTypes.ts:110-139` icon/color maps also hardcoded. Contradicts "config-driven record types" claim. | Ease of Use, no vendor lock-in | S |
| ui-008 | [ui](sections/ui.md) | God-components: `RecordForm.vue` 1,310 lines, `FileBrowser.vue` 1,156, `GeographyForm.vue` 1,104, `RecordSidebar.vue` 935, `EditorHeader.vue` 600. Mix API calls, state, validation, presentation. Zero test coverage. | Trust, Ease of Use | L |
| realtime-001 | [realtime](sections/realtime.md) | `checkConnectionLimits()` called with `userId=null` before authentication (`realtime-server.ts:472`). The `connections_per_user` limit is unreachable. `userConnections` never cleaned up on disconnect. | Trust | S |
| realtime-002 | [realtime](sections/realtime.md) | Per-IP `connectionCounts` decremented only in the new handler-registry path; legacy user/device disconnect paths have an explicit `// TODO: Track IP and user for cleanup` (line 2891). Long-running servers exhaust the IP limit. | Trust | S |
| realtime-003 | [realtime](sections/realtime.md) | Collaborative edits never write back to the record's Markdown file. `useAutosave` in collab mode only triggers Yjs binary snapshots; canonical Git-tracked Markdown stays pre-edit. | **Markdown as civic format**, **Resilient archival**, Equity | M |
| realtime-004 | [realtime](sections/realtime.md) | `realtime-server.ts` is 3,581 lines with ~1,500 lines of broadcast-box-specific device legacy code coexisting with the handler-registry path that was supposed to replace it (commit `e014f40`). Both paths shipped; legacy untested from realtime module. | Trust | L |
| broadcast-box-001 | [broadcast-box](sections/broadcast-box.md) | broadcast-box absent from `docs/project-status.md`, `docs/roadmap.md`; manifesto §3.5 still names Ledger flagship. Internal docs updated, public ones not. | Transparency | S |
| broadcast-box-003 | [broadcast-box](sections/broadcast-box.md) | `protocol-adapter.ts` (172 lines) defines six bidirectional adapters but is imported nowhere. Production uses hand-rolled inline normalizers in `device-room-handler.ts:422-475`. | Trust | M |
| broadcast-box-004 | [broadcast-box](sections/broadcast-box.md) | `api.devices.test.ts` (146 lines) is fake — every test asserts `toBeDefined()` / `toBeInstanceOf(Function)` against a mock; no router exercised. Prior Jan-2025 audit flagged this; not addressed. | Trust | M |
| broadcast-box-005 | [broadcast-box](sections/broadcast-box.md) | Live-event setup demands engineer-grade input (raw RTMP URL + stream key, hand-create YouTube/Facebook live event first). No municipal-account abstraction. The user's "live event server setup was not optimal" pain. | Ease of Use | L |
| broadcast-box-006 | [broadcast-box](sections/broadcast-box.md) | 38 `// TODO: Add authMiddleware` and `// TODO: Add permission check for broadcast-box:...` comments still in place across api routes. Per-endpoint RBAC entirely absent: any valid JWT can list/view/update/revoke/command any device. | Trust | M |
| broadcast-box-008 | [broadcast-box](sections/broadcast-box.md) | Enrollment-code re-registration path (`device-manager.ts:170-264`) permanently allows re-registration using a leaked enrollment code, even after expiration or use. No rotation, no revocation on first activation. | Trust | M |
| broadcast-box-010 | [broadcast-box](sections/broadcast-box.md) | Command/ACK contract has three accepted on-the-wire formats; hardware and server docs disagree on defaults; server has no canonical translator (the one in `protocol-adapter.ts` is dead). User's "contract not always clear" made concrete. | Trust | L |
| broadcast-box-011 | [broadcast-box](sections/broadcast-box.md) | `console.log` debug in production: raw enroll request body, full command payloads (incl. stream keys), `=== ENROLL ENDPOINT CALLED ===` banners. Log surface leaks secrets. | Trust | S |
| storage-003 | [storage](sections/storage.md) | `LifecycleManager.archiveFile()` "archives" by updating DB `folder` column only; the file is never moved. Every archive creates an orphan that `OrphanedFileCleaner` then cleans up. Two large components undoing each other's work. | Trust, Public Good | M |
| storage-004 | [storage](sections/storage.md) | `StorageFailoverManager.checkProviderRecovery()` runs on interval but only logs "Checking recovery for provider" — it does not probe. Auto-recovery is a no-op. Once a provider is marked unhealthy it never recovers. | Trust | M |
| storage-005 | [storage](sections/storage.md) | Filename `originalname` stored verbatim and echoed into `Content-Disposition` headers without sanitization. Two filename generators with different sanitization rules. Header-injection / display risks. | Trust | S–M |
| storage-006 | [storage](sections/storage.md) | `@aws-sdk/client-s3`, `@azure/storage-blob`, `@google-cloud/storage` are direct (non-optional) runtime deps. Every install pulls all three cloud SDKs even for local-only municipalities. Stealth complexity pressure. | No vendor lock-in (soft fail) | M |
| storage-007 | [storage](sections/storage.md) | If SQLite metadata DB is lost or corrupted, UUID-named files on disk become unreachable — no filename-to-record mapping outside the DB. "Town hall with USB key in a storm" scenario silently loses the archive. | **Resilient archival (HARD)** | L |
| storage-008 | [storage](sections/storage.md) | README at `modules/storage/README.md` is materially out of date: claims GCS planned (it's done), API/CLI planned (they exist), virus scanning planned with no stub. | Transparency, Trust | S |
| legal-register-001 | [legal-register](sections/legal-register.md) | The "module" consists of a single JSON Schema file. `docs/architecture.md:135` lists it as a working module; `docs/specs/legal-register.md` is `status: stable, version: 1.0.0` describing components/hooks/workflows/CLI/tests that don't exist. | Transparency, Trust | M |
| legal-register-002 | [legal-register](sections/legal-register.md) | `core/src/records/record-schema-builder.ts:219-236` hardcodes the string `'legal-register'` to scope which record types the module applies to. Any new module requires a core-side code change. Breaks "WordPress for governance" modularity. | Open-source, Public Good | M |
| notifications-004 | [notifications](sections/notifications.md) | `modules/notifications/` has no `README.md`, no `package.json`, contains exactly one file unreferenced by production code (only by one test). Module is effectively abandoned. | Transparency, Ease of Use | S |
| notifications-005 | [notifications](sections/notifications.md) | Four parallel ad-hoc inline `EmailChannel` implementations: CLI `notify.ts:50`, API `routes/notifications.ts:64`, `core/src/auth/email-validation-service.ts:117`, and the unused module file. The `NotificationChannel` abstraction not used. | **No vendor lock-in (HARD)**, Open-source | M-L |
| notifications-006 | [notifications](sections/notifications.md) | `modules/notifications/channels/email-channel.ts:129, 188` call `nodemailer.createTransporter(...)` — a method that doesn't exist (correct: `createTransport`). Both smtp and nodemailer paths would throw. | Trust | S |
| notifications-007 | [notifications](sections/notifications.md) | `docs/specs/notifications.md` declares **status: stable v1.0.0** while implementation lacks SMS, Slack, webhooks, queue wiring, hook integration, and has the issues in 001-003. | Transparency | S–L |
| BB-HW-004 | [broadcast-box-hw](sections/civicpress-broadcast-box-hardware.md) | Hardware parses three different command-message shapes in `websocket_client.py:486-565` (`type=command`, `type=control`, `type=undefined`). Defensive coercion documents an uncanonicalised cross-repo contract. | Trust | M |
| BB-HW-005 | [broadcast-box-hw](sections/civicpress-broadcast-box-hardware.md) | `command_handler.py` is a 25-action `elif` router with a 14-dependency constructor. Needs a dispatch table / command-registration pattern. | Trust | M |
| BB-HW-006 | [broadcast-box-hw](sections/civicpress-broadcast-box-hardware.md) | `websocket_client.py` is 1,432 lines with 3-4 overlapping disconnect-recovery code paths. Defensive code accreted across debugging sessions; reconnection bug risk. | Trust | M |
| BB-HW-007 | [broadcast-box-hw](sections/civicpress-broadcast-box-hardware.md) | Hardware repo not on `docs/roadmap.md` and not mentioned in `docs/project-status.md`. Flagship's hardware side invisible to published roadmap. | Transparency | S |
| BB-HW-008 | [broadcast-box-hw](sections/civicpress-broadcast-box-hardware.md) | `docs/engineering-analysis.md` self-grades "Top 0.1% Senior Engineer" / "95% production-ready." Performative aspirational claim that undermines documentation trust. | Trust, Transparency | S |
| BB-HW-009 | [broadcast-box-hw](sections/civicpress-broadcast-box-hardware.md) | QUICK-START + deployment guide assume Ubuntu 22.04 + Docker via piped curl + Python venv. Promised ISO/USB appliance does not exist (`docker/` is empty). Non-technical clerk cannot install. | Ease of Use, Equity | L |

### Medium (60)

| ID | Module | Description | Manifesto principle | Effort |
|---|---|---|---|---|
| core-003 | [core](sections/core.md) | Hand-rolled DI container (~600 LoC, 7 files, 7 test files) for 11 manually-wired services. `DependencyResolver.extractDependencies()` is a TODO returning `[]`. Service-locator with extra ceremony. | Ease of Use (contributors) | L |
| core-004 | [core](sections/core.md) | `SagaRecovery.recoverFailedSagas()` (`saga/saga-recovery.ts:118-131`) is a placeholder ("Actual compensation would need saga instance"). Crashed sagas marked failed but no compensation runs. | Trust | M |
| core-005 | [core](sections/core.md) | `SagaMetricsCollector` and `CacheWarmer` exported but never instantiated in production code. Dead-on-arrival infrastructure. | Public Good (focus) | S |
| core-006 | [core](sections/core.md) | `'hybrid'` cache strategy is a typed `CacheConfig` option but `unified-cache-manager.ts:73-77` throws "not yet implemented" if used. Fake comprehensiveness. | Trust | S |
| core-007 | [core](sections/core.md) | `core/README.md` documents a four-component architecture; the code ships DI, sagas, unified cache, secrets, notifications, audit logger, diagnostics — none mentioned. | Transparency, Ease of Use | S |
| core-008 | [core](sections/core.md) | God-objects: `record-manager.ts` 1,420 LoC, `database-service.ts` 1,577, `auth-service.ts` 1,319. Each accumulates DB, file I/O, validation, hooks, audit, git, cache responsibilities. | Trust (testability) | L |
| core-009 | [core](sections/core.md) | `RecordManager` does `dynamic import('../saga/...')` and `civic-core.ts` does dynamic import to dodge circular imports. `IndexingService` registered as placeholder then replaced. Inverted layering. | Trust (reliability) | M |
| core-010 | [core](sections/core.md) | Notifications duplicated: `core/src/notifications/` (~2,465 LoC, 18 files) and `modules/notifications/` both exist. Unclear ownership and double surface area. | Trust | M |
| core-011 | [core](sections/core.md) | Storage module integration in `civic-core-services.ts:244-349` is ~100 lines of nested try/catch with multiple package + file:// URL fallbacks. Defensive code patching an unresolved monorepo build issue. | Ease of Use (contributors) | M |
| cli-007 | [cli](sections/cli.md) | `auto-index` is a developer demo command exposed in the production CLI binary with 3 `TODO: Fix type compatibility` comments. Pollutes `civic --help` discoverability. | Trust, Ease of Use | S |
| cli-008 | [cli](sections/cli.md) | `diagnose.ts` (803 LoC) duplicates a long if/else chain rendering `issue.details.*` shapes in two places. A `renderIssueDetails(details)` would replace ~250 LoC with ~50. | Trust | S |
| cli-009 | [cli](sections/cli.md) | `--token <token>` flag accepted on every authenticated subcommand. CLI tokens leak via shell history and `ps`/`/proc`. `--token-file` and `CIVIC_TOKEN` env-var would be safer. | Trust | S |
| cli-010 | [cli](sections/cli.md) | `auth:simulated` is disabled only when `NODE_ENV === 'production'`. A clerk laptop with `NODE_ENV` unset can issue admin tokens. Should use positive opt-in (`CIVIC_DEV_MODE=1`). | Trust | S |
| cli-011 | [cli](sections/cli.md) | `cli/README.md` and `docs/cli.md` advertise commands/flags that don't exist (e.g., `civic users list` vs actual `users:list`; `civic list --author/--format csv/--sort`). | Trust, Ease of Use | S |
| cli-012 | [cli](sections/cli.md) | Action handlers nearly all use `(options: any)`. `BackupCommandOptions` in `backup.ts` shows what good looks like; the rest of the codebase should match. | Trust | M |
| api-009 | [api](sections/api.md) | 503 `as any` casts in `modules/api/src/`, including a 23-line nested type-laundering loop in `routes/records.ts:627-650`. `AuthenticatedRequest` type exists but is widely bypassed. | Trust | M |
| api-010 | [api](sections/api.md) | OpenAPI spec at `routes/docs.ts` is stale: `version: '0.1.3'`, describes `X-API-Key` auth that runtime doesn't accept, lists `status: 'active'` enum that no longer exists. | Ease of Use, Transparency | S |
| api-011 | [api](sections/api.md) | No `Accept-Language` handling anywhere; all error messages hard-coded English. UI is EN/FR; API doesn't localise its error payloads. | Equity | M |
| api-012 | [api](sections/api.md) | Response-shape inconsistency: 20 places call `res.json(...)` directly instead of `sendSuccess`, with subtly different envelopes. | Ease of Use | S |
| api-013 | [api](sections/api.md) | `routes/records.ts` 1,459 LoC and `routes/users.ts` 1,443 LoC are monolithic with heavy per-handler boilerplate duplication (auth-check + audit-log + error-handle). | Ease of Use | M |
| api-014 | [api](sections/api.md) | Audit logging inconsistently applied: records/users/config/notifications emit events; templates/geography/uuid-storage/indexing do not. Clerk reading `/api/v1/audit` sees an incomplete picture. | Transparency | M |
| ui-009 | [ui](sections/ui.md) | Inconsistent permission checks: `edit.vue:161-164` uses permission-based; `new.vue:14-17` and `RecordList.vue:113-116` use role-based. Same operation, different policy. | Trust | S |
| ui-010 | [ui](sections/ui.md) | `stores/auth.ts:260-284` `setMockUser()` action grants admin role + permissions with no env guard; callable from devtools in any build. | Trust | S |
| ui-011 | [ui](sections/ui.md) | 208 explicit `: any` annotations and pervasive `(response as any).success` access. Defeats `typescript.strict: true` setting. | Trust | M |
| ui-012 | [ui](sections/ui.md) | `useErrorHandler.ts` has 4 near-identical handler functions each repeating ~30 lines. Hardcoded English titles defeat i18n. | Ease of Use | S |
| ui-013 | [ui](sections/ui.md) | `pages/settings/configuration/index.vue:321,340` carries `// TODO: Implement configuration export API endpoint` while showing "Export All"/"Import" buttons that open "coming soon" toasts. Vapor-buttons. | Trust, Transparency | S |
| ui-014 | [ui](sections/ui.md) | 112 `console.log/warn/error` calls remain in production code, including verbose auth-state logging in `stores/auth.ts:55-82`. Leaks session info to browser console. | Trust | S |
| realtime-005 | [realtime](sections/realtime.md) | Yjs snapshots stored as opaque, unsigned, unbounded BLOBs (`realtime_snapshots.snapshot_data BLOB`). No Markdown reconstruction, no schema check, no size limit, no integrity hash. y-protocols major-version bump could orphan civic archives. | **Resilient archival**, Transparency | M |
| realtime-006 | [realtime](sections/realtime.md) | `TESTING.md` and `test-websocket.mjs` document the JSON `sync` message protocol removed in commit `5d73791`. `DEPLOYMENT.md` references a `tls.enabled` config that doesn't exist. Operator following docs would conclude server is broken. | Ease of Use, Transparency | S |
| realtime-007 | [realtime](sections/realtime.md) | `generateParticipantColor()` and `PARTICIPANT_COLORS` are dead — never called. Identical palette in UI is used. Server copy is fossil. | (cleanup) | S |
| realtime-008 | [realtime](sections/realtime.md) | Client `useRealtimeEditor.ts` declares `MAX_RECONNECT_ATTEMPTS=5` and `RECONNECT_DELAYS` but never reads them; reconnection is delegated to `y-websocket`. Dead scaffolding. | Trust | S |
| realtime-009 | [realtime](sections/realtime.md) | `RealtimeServer` carries device-specific concerns: `DeviceConnectionMetadata` type, `clientToDevice`/`deviceConnections`/`deviceConnectionMetadata` maps, `calculateConnectionScore`, `checkStaleConnections`. None of this belongs in a generic Yjs server. | (boundary violation) | M |
| realtime-010 | [realtime](sections/realtime.md) | Legacy device ACK normalizer (`realtime-server.ts:1571-1665`) accepts three competing payload shapes via cascading conditionals. Both sides accumulate compatibility code rather than fixing one. | Trust | M |
| realtime-011 | [realtime](sections/realtime.md) | Realtime not mentioned in `docs/roadmap.md` or `docs/project-status.md`'s "What's Working" section despite shipping with 111 tests and being load-bearing for editor UX. | Transparency | S |
| broadcast-box-009 | [broadcast-box](sections/broadcast-box.md) | Session lifecycle has 7 states but `stopSession` immediately writes `complete` (line 213) while device is still encoding/uploading. DB state lies. No reconciliation when upload events arrive. | Trust | M |
| broadcast-box-012 | [broadcast-box](sections/broadcast-box.md) | Realtime server has 4 broadcast-box-specific setter methods + `registerRoomTypeHandler`. Module boundary collapsed: `@civicpress/realtime` is no longer Yjs-only. | (architectural cleanliness) | L |
| broadcast-box-013 | [broadcast-box](sections/broadcast-box.md) | `websocket/command-handlers.ts` (1124 lines, 12 tests) defines handlers — but runtime path does NOT route device-sent messages to this registry. Vestigial from earlier design. | Trust (no fake confidence) | M |
| broadcast-box-014 | [broadcast-box](sections/broadcast-box.md) | Device capabilities have three sources of truth (REST registration, `device.connected` event, status messages) and three independent merge sites. Same data merged thrice with subtly different rules. | Trust | M |
| broadcast-box-015 | [broadcast-box](sections/broadcast-box.md) | UI composables `useDevicePreview` (1419), `useDeviceConnectionStatus` (1459), `useDeviceCommands` (969) are stateful machines, not composables. Page manually tracks 6+ mount-state variables. | Ease of Use (maintainability) | L |
| broadcast-box-016 | [broadcast-box](sections/broadcast-box.md) | Device lifecycle defines 5 states but no service method ever transitions to `suspended` or `decommissioned`. Documentation/code mismatch. | Trust | S |
| broadcast-box-017 | [broadcast-box](sections/broadcast-box.md) | `UploadProcessor.finalizeUpload` reads the entire combined recording into memory twice (hash + upload). Streaming hash + streaming upload needed for resilient archival of full sessions. | Resilient archival | M |
| broadcast-box-018 | [broadcast-box](sections/broadcast-box.md) | WIP `findByCode()` does O(n) bcrypt loop over all unused codes in the last 24 hours. Pairs dangerously with dev-mode no-rate-limit (BB-007). Zero tests on this new path. | Trust | S |
| broadcast-box-019 | [broadcast-box](sections/broadcast-box.md) | Admin endpoint `POST /api/v1/broadcast-box/admin/reset-rate-limits` registered with NO auth when `authMiddleware` is not passed. Foot-gun on partial init paths. | Trust | S |
| broadcast-box-020 | [broadcast-box](sections/broadcast-box.md) | `DeviceCommandService.getRoomManager()` lazy-resolves `realtimeRoomManager` from DI on first command. Log message reads "CRITICAL: DeviceCommandService requires RoomManager" if resolution fails. Service registration order is implicit and load-bearing. | Trust | M |
| storage-009 | [storage](sections/storage.md) | `UuidStorageService` (458 LoC, local-only) exported from index.ts but unused by any production code path. Duplicates upload/validate/format-bytes logic. Contains unreachable "Only local storage is currently supported" branch. | (cleanup) | S |
| storage-010 | [storage](sections/storage.md) | Cloud provider abstraction is a per-operation `switch(provider.type)` rather than a Strategy pattern. Adding a 5th provider means editing every switch. ~1,500 LoC removable with proper refactor. | Open-source, Public Good | L |
| storage-011 | [storage](sections/storage.md) | Executable file types (exe/bat/cmd/sh/ps1) added to `warnings[]` not `errors[]`, and warnings are silently discarded. A folder mis-configured with `exe` in `allowed_types` accepts executables. | Trust | S |
| storage-012 | [storage](sections/storage.md) | Storage operation auditing writes to `logger.info` only — no DB table, no Git artifact, no structured record. README promises "Complete record of all file operations" but the trail is unstructured log lines. | Transparency, Trust | M |
| storage-013 | [storage](sections/storage.md) | `extractErrorCode()` string-matches `err.message.includes('quota')`, `'timeout'`, etc. to assign error codes. Brittle, locale-sensitive, and unnecessary given typed `CivicPressError` hierarchy. | Trust | S |
| storage-014 | [storage](sections/storage.md) | No end-to-end integration test exercises the storage path with the real local filesystem through `CloudUuidStorageService`. 17 mock-only tests; failure modes that only surface when DB+FS+provider interact are uncovered. | Trust | M |
| legal-register-003 | [legal-register](sections/legal-register.md) | Every legal field in the extension is already declared in `core/src/schemas/record-base-schema.json:342-605`. Extension is largely duplicative; only `document_number` regex is additive. README claim "Validates legal compliance fields" overstates. | Trust | S |
| legal-register-004 | [legal-register](sections/legal-register.md) | Zero tests inside `modules/legal-register/`. Schema's behavior exercised only indirectly via indexing tests. For a module that exists to validate legal compliance, this is a notable gap. | Trust | S |
| legal-register-005 | [legal-register](sections/legal-register.md) | `record-schema-builder.ts:187-193` resolves module schemas via `process.cwd() + 'modules/' + name`. Couples discovery to CWD and monorepo layout; blocks real npm-installed modules. | No vendor lock-in, Trust | M |
| notifications-008 | [notifications](sections/notifications.md) | `NotificationQueue` instantiated but `enqueue`/`processQueue` never called from anywhere. CLI `notify:retry` returns `'Retry functionality not yet implemented'` despite the queue class existing. | Trust | S/M |
| notifications-009 | [notifications](sections/notifications.md) | SMS and Slack channels appear in config, rate limits, `getChannelRecipient` switch, settings UI — but NO implementation class exists. Multi-channel claim overstated. | Trust, Equity | S/L |
| notifications-010 | [notifications](sections/notifications.md) | Notification email templates hardcoded English. Platform claims complete EN/FR i18n; French-locale user receives English verification emails. No locale hook in template processing. | Equity | M |
| notifications-011 | [notifications](sections/notifications.md) | Rate limits are in-memory per `NotificationService` instance. At least 4 instances exist at runtime. Per-channel limits are per-instance, not per-deployment. Also: per-channel only, not per-recipient. | Trust, Public Good | M |
| notifications-012 | [notifications](sections/notifications.md) | `NotificationService.getChannelRecipient` silently returns `''` for missing email/phone. Emails to `to: ''` are dispatched silently. | Trust | S |
| notifications-013 | [notifications](sections/notifications.md) | Webhook security primitives well-implemented (HMAC-SHA256) — but NO inbound webhook endpoint and NO outbound webhook channel exist. Spec's "All webhook endpoints must be cryptographically signed" is unenforceable. | Trust | S/L |
| BB-HW-010 | [broadcast-box-hw](sections/civicpress-broadcast-box-hardware.md) | Token passed BOTH in `Authorization: Bearer` header AND as `?token=…` query parameter. Query-param tokens leak through logs and proxies. | Trust | S |
| BB-HW-011 | [broadcast-box-hw](sections/civicpress-broadcast-box-hardware.md) | AP-mode auto-deactivation hard-disabled in production code: `service.py:52` reads `self.timeout_minutes = 0  # Disabled for testing`. Wifi AP left open after enrollment is a network-exposure risk. | Trust | S |
| BB-HW-012 | [broadcast-box-hw](sections/civicpress-broadcast-box-hardware.md) | `docs/security-considerations.md` claims "Credentials stored encrypted in SQLite," but no encryption visible in `CredentialManager`/`StateManager` code paths. Doc-vs-code drift on a security claim. | Trust | S |
| BB-HW-013 | [broadcast-box-hw](sections/civicpress-broadcast-box-hardware.md) | Hardware-side enrollment code stored as plain config string in SQLite + re-used automatically on `AUTH_FAILED`. Combined with unencrypted DB, compromised device can silently re-enroll. Cross-repo finding. | Trust | M |
| BB-HW-014 | [broadcast-box-hw](sections/civicpress-broadcast-box-hardware.md) | 33 documentation files for a 22k-LoC alpha project, many duplicating or contradicting each other. Doc-debt cleanup needed. | Transparency | M |
| BB-HW-015 | [broadcast-box-hw](sections/civicpress-broadcast-box-hardware.md) | `pyproject.toml` ships `version="0.1.0"`, README/agent say "core implementation complete", CHANGELOG declares `[0.1.0] - TBD`. Three sources, three claims. | Transparency | S |

### Low (30)

| ID | Module | Description | Manifesto principle | Effort |
|---|---|---|---|---|
| core-012 | [core](sections/core.md) | 14 `TODO` comments in production source. 4 in `geography/geography-manager.ts` for unimplemented DB persistence. Each is small; cluster around features marked "complete". | Trust | S |
| core-013 | [core](sections/core.md) | `core/src/audit/` is a single 137-line file. The "audit-trail feature" the platform advertises is essentially `AuditLogger.tail(N)` + admin-only API filter. No citizen-facing audit visibility. | Transparency | M |
| core-014 | [core](sections/core.md) | Saga step classes log start/complete/fail via `coreDebug` AND executor also logs — duplicated logging. | — | S |
| cli-013 | [cli](sections/cli.md) | `create.ts:168` sets template context `author: 'system'` with `// TODO: Get from user context`. Templates referencing `${author}` substitute `'system'`. | Transparency | S |
| cli-014 | [cli](sections/cli.md) | `cli/dist/` appears tracked in the repository. Compiled JS in version control invites supply-chain confusion. | Open-source | S |
| cli-015 | [cli](sections/cli.md) | `cache.ts` lines 60, 89, 192, 262 use `console.log` directly instead of `cliOutput`. Breaks centralized-output contract; `--json` mode gets human-formatted output. | Trust | S |
| cli-016 | [cli](sections/cli.md) | `init.ts:138` defines a hostile-to-read ternary. Minor readability. | — | S |
| api-015 | [api](sections/api.md) | `routes/uuid-storage.ts:307-321` decides HTTP status by substring-matching error message text (`includes('size') \|\| 'limit' \|\| 'exceeds'` → 413). Should be typed errors. | Trust | S |
| api-016 | [api](sections/api.md) | `middleware/csrf.ts:42-44` skips CSRF whenever `X-Mock-User` is present, with comment "only used in tests" — no runtime guard asserts `NODE_ENV !== 'production'`. | Trust | S |
| ui-015 | [ui](sections/ui.md) | `pages/records/drafts.vue:67` uses native `window.confirm()` for destructive draft deletion; breaks i18n, a11y, and brand consistency. | Ease of Use, Equity | S |
| ui-016 | [ui](sections/ui.md) | 33 uses of `process.client` (Nuxt 3 idiom); Nuxt 4 prefers `import.meta.client`. Deprecation-warning surface. | — | S |
| ui-017 | [ui](sections/ui.md) | `nuxt.config.ts:24-30` hardcodes `appVersion: '0.1.3'` in runtime config; rest of repo is on v0.2.0. Citizens see the wrong version. | Transparency | S |
| realtime-012 | [realtime](sections/realtime.md) | 46 occurrences of `: any` in `realtime-server.ts`. Most in legacy device path payload handling. Reduces type-safety value. | Trust | M |
| realtime-013 | [realtime](sections/realtime.md) | Emoji-heavy `coreInfo` calls in WebRTC preview routing at info level. High-volume noisy logs during streaming. | Ease of Use (ops) | S |
| realtime-014 | [realtime](sections/realtime.md) | Yjs `XmlFragment` coexists with `Y.Text('initialMarkdown')` shadow and deprecated `getYjsText()`. The server-side Markdown round-trip does not work: `toMarkdown()` returns XML stringification, not Markdown. | Markdown as civic format | S |
| broadcast-box-021 | [broadcast-box](sections/broadcast-box.md) | README inside module stamped 2025-01-30 saying "Phase 8 Complete" / "Phase 9: Documentation as next". Prior CLEANUP-AND-TEST-AUDIT-REPORT (Jan 2025) was deleted in commit 1181c17 without enacting most findings. | Transparency | S |
| broadcast-box-022 | [broadcast-box](sections/broadcast-box.md) | Types carry Legacy/New duality with no migration plan: `videoSources` vs `videoSourceObjects`; `PiPConfig` vs `PiPConfiguration`. Comments mark "legacy" but they're still active. | (maintainability) | M |
| storage-015 | [storage](sections/storage.md) | Defensive `as any` casts across provider boundaries (~80+ occurrences). SDKs and core offer typed surfaces. | (none) | M |
| storage-016 | [storage](sections/storage.md) | Double-emitted debug log in `civic-core-services.ts:319-326`: same `logger.debug('Storage services registered successfully')` twice consecutively. AI-edit churn. | (none) | S |
| legal-register-006 | [legal-register](sections/legal-register.md) | `package.json` is a `pnpm init` stub: empty description/author/keywords, `main: "index.js"` (no file), default `"test": "echo \"Error: no test specified\" && exit 1"`. Signals abandoned scaffolding. | Trust | S |
| legal-register-007 | [legal-register](sections/legal-register.md) | Schema's `change_history` and `approval_chain` describe audit-trail data but module does no enforcement and no service-level integration ensures fields are populated. Aspirational metadata, not an audit boundary. | Transparency, Trust | M |
| notifications-014 | [notifications](sections/notifications.md) | Comments throughout the folder explain *what* the next line does not *why*. JSDoc blocks above one-line getters. Classic AI-generation smell. | Ease of Use | S |
| notifications-015 | [notifications](sections/notifications.md) | `private simulateEmailSending()` in `modules/notifications/channels/email-channel.ts:386-394` is dead code — never called. Leftover dev scaffolding. | — | S |
| BB-HW-016 | [broadcast-box-hw](sections/civicpress-broadcast-box-hardware.md) | `agent/manifesto-slim.md` is a separate, slimmed-down copy of the manifesto kept inside agent memory. Will drift from canonical `manifesto/manifesto.md`. | Transparency | S |
| BB-HW-017 | [broadcast-box-hw](sections/civicpress-broadcast-box-hardware.md) | Hardware repo bundles a SECOND Nuxt 4 UI under `frontend/` with its own `@nuxt/ui-pro` dep — separate from monorepo's Nuxt UI Pro. Two flagship-quality UIs to maintain. | Ease of Use (long-term cost) | M |

---

## View 2: Findings grouped by manifesto principle (key violations only)

### Hard-constraint violations (priority for any pilot deployment)

**Markdown as civic format**
- broadcast-box-002 (Critical) — recordings produce media blobs only
- BB-HW-003 (Critical) — 69 mp4 / 0 json sidecars; metadata code path not running
- realtime-003 (High) — collab edits never write back to Markdown
- realtime-014 (Low) — server-side `toMarkdown()` returns XML

**No vendor lock-in**
- ui-002 (Critical) — `@nuxt/ui-pro` paid commercial dep in critical path
- notifications-005 (High) — 4 ad-hoc inline EmailChannel reimplementations; abstraction unused
- storage-006 (High) — three cloud SDKs as direct deps
- legal-register-005 (Medium) — `process.cwd()`-based module discovery blocks npm-installed modules

**Resilient archival**
- ui-003 (Critical) — SPA-only, no service worker, no offline cache
- storage-007 (High) — SQLite DB loss makes UUID files unreachable
- realtime-003 (High) — collab edits not in Markdown / Git
- realtime-005 (Medium) — opaque Yjs snapshots could orphan civic archives
- broadcast-box-017 (Medium) — full-recording-in-memory pattern fails for long meetings

### Trust-principle violations (structural dishonesty)

- notifications-001 (Critical) — audit log hardcodes `success: true`; 89% of entries have empty channels
- api-004 (Critical) — 4 stub routers return fake `200 OK`
- BB-HW-008 (High) — engineering-analysis.md self-grades "Top 0.1% Senior Engineer / 95% production-ready"
- cli-001 (High) — 15/27 CLI tests assert literal "CLI testing disabled" string
- ui-005 (High) — "80+ tests / 85% coverage" claim is 1 file / 32 cases / 0 component coverage
- broadcast-box-004 (High) — `api.devices.test.ts` only asserts `toBeDefined()` / `toBeInstanceOf(Function)`
- legal-register-001 (High) — "stable v1.0.0" spec for a module that doesn't exist
- notifications-007 (High) — spec declares "stable v1.0.0" with no SMS/Slack/webhooks/queue/hooks implementation
- core-002 (High) — workflow engine "default workflows" are TODO log-only stubs registered as functional
- storage-001 (Critical) — `QuotaManager.checkQuota` never called; quotas not enforced
- broadcast-box-009 (Medium) — `stopSession` writes `complete` while device still encoding

### Transparency-principle violations

- broadcast-box-001 (High) — flagship invisible in roadmap and manifesto
- BB-HW-007 (High) — hardware repo invisible in roadmap and project-status
- core-001 (High) — two parallel uncoordinated audit systems; RecordManager DB audit lacks `userId`
- core-007 (Medium) — `core/README.md` documents a four-component architecture; code ships much more
- legal-register-001 (High) — architecture doc + spec claim a working module that doesn't exist
- realtime-011 (Medium) — realtime not in roadmap or project-status despite shipping with 111 tests
- BB-HW-014 (Medium) — 33 doc files for 22k-LoC alpha project; many duplicating/contradicting

### Ease of Use & Equity violations

- cli-005 (High) — CLI English-only + emoji-heavy; Quebec clerk on demo town gets English
- broadcast-box-005 (High) — live-event setup demands engineer-grade RTMP URL + stream key
- BB-HW-009 (High) — promised USB-appliance ISO doesn't exist; non-technical clerk cannot install
- cli-006 (High) — `cleanup --force` wipes records with no real confirmation
- ui-006 (High) — i18n incomplete despite "Complete EN/FR" claim
- api-011 (Medium) — no `Accept-Language` handling; all API errors English-only
- notifications-010 (Medium) — notification templates hardcoded English
- cli-004 (High) — two parallel auth UX trees (login vs auth:*)

---

## View 3: Findings sorted by module (cross-reference index)

| Module | Section | Findings (total) | Crit | High | Med | Low |
|---|---|---|---|---|---|---|
| core | [core.md](sections/core.md) | 14 | 0 | 2 | 9 | 3 |
| cli | [cli.md](sections/cli.md) | 16 | 0 | 6 | 6 | 4 |
| api | [api.md](sections/api.md) | 16 | 4 | 4 | 6 | 2 |
| ui | [ui.md](sections/ui.md) | 17 | 3 | 5 | 6 | 3 |
| realtime | [realtime.md](sections/realtime.md) | 14 | 0 | 4 | 7 | 3 |
| broadcast-box (FLAGSHIP) | [broadcast-box.md](sections/broadcast-box.md) | 22 | 2 | 8 | 10 | 2 |
| storage | [storage.md](sections/storage.md) | 16 | 2 | 6 | 6 | 2 |
| legal-register | [legal-register.md](sections/legal-register.md) | 7 | 0 | 2 | 3 | 2 |
| notifications | [notifications.md](sections/notifications.md) | 15 | 3 | 4 | 6 | 2 |
| broadcast-box-hw | [civicpress-broadcast-box-hardware.md](sections/civicpress-broadcast-box-hardware.md) | 17 | 3 | 6 | 6 | 2 |
| **Phase 1+2 subtotal** | | **154** | **17** | **47** | **60** | **30** |
| civicpress-ingest (ext) | [civicpress-ingest.md](sections/civicpress-ingest.md) | 10 | 0 | 4 | 3 | 3 |
| site (ext) | [site.md](sections/site.md) | 14 | 0 | 4 | 7 | 3 |
| dependencies-licenses (ext) | [dependencies-licenses.md](sections/dependencies-licenses.md) | 12 | 3 | 5 | 3 | 1 |
| workspace-cleanup (ext) | [workspace-cleanup.md](sections/workspace-cleanup.md) | 15 | 0 | 5 | 6 | 4 |
| **Phase 3 subtotal** | | **51** | **3** | **18** | **19** | **11** |
| **GRAND TOTAL** | | **205** | **20** | **65** | **79** | **41** |

---

## Phase 3 Extension Findings (2026-05-17, added at user request)

### Phase 3 Critical (3)

| ID | Module | Description | Manifesto principle | Effort |
|---|---|---|---|---|
| deps-001 | [dependencies-licenses](sections/dependencies-licenses.md) | `simple-git` 3.28.0 has `blockUnsafeOperationsPlugin` bypass (GHSA-vx2g-25mq-9c2h). Git is the civic platform's authoritative history store — a bypass here is a Trust failure. Pairs with `api-007` (simple-git also undeclared in `modules/api/package.json`). | Trust | S |
| deps-002 | [dependencies-licenses](sections/dependencies-licenses.md) | `fast-xml-parser` (4.5.3 via `@google-cloud/storage`; 5.2.5 via `@aws-sdk/client-s3`) has entity-encoding bypass via DOCTYPE regex injection (GHSA-mpg4-rc92-vx8v). Reachable via cloud storage operations. | Trust | S |
| deps-003 | [dependencies-licenses](sections/dependencies-licenses.md) | `handlebars` 4.7.8 (via `plop > node-plop`) has JS injection via AST type confusion (GHSA-3wjp-mcw9-37jh). | Trust | S |

### Phase 3 High (18)

| ID | Module | Description | Manifesto principle | Effort |
|---|---|---|---|---|
| ingest-001 | [civicpress-ingest](sections/civicpress-ingest.md) | No git remote — pipeline only exists on the developer's laptop. Cross-ref `workspace-003`. | Trust, Resilient archival | S |
| ingest-002 | [civicpress-ingest](sections/civicpress-ingest.md) | Repo invisible in `docs/roadmap.md` and `docs/project-status.md`. Roadmap v0.5–0.8 names "migration/import tool" — but this *is* that tool. | Transparency | S |
| ingest-003 | [civicpress-ingest](sections/civicpress-ingest.md) | Last commit 2025-11-11 — 6 months stale. Predates broadcast-box flagship pivot and several rounds of `record-format-standard.md` changes. Pipeline may silently produce records the current monorepo rejects. | Trust | M |
| ingest-004 | [civicpress-ingest](sections/civicpress-ingest.md) | No real test suite (1 informal OCR helper). For OCR + heuristic-cleanup with per-municipality rules, no regression coverage means each new municipality's rules can silently break Richmond's. | Trust | M |
| site-001 | [site](sections/site.md) | Public site repeats the "v0.2.0 stable / production-ready / ready for pilots" overclaim to municipal evaluators while monorepo has 17 open Criticals (pre-extension). | Transparency, Trust | S |
| site-002 | [site](sections/site.md) | Broadcast-box (flagship per user) is invisible on the public site — the "Every meeting, visible." card never names the module, hardware repo, or protocol. Mirrors the roadmap/manifesto staleness. | Transparency, Public Good | S |
| site-003 | [site](sections/site.md) | Five docs (README, `.cursor/rules.md`, 3 `agent/*` files) claim "Nuxt UI Pro" is the framework; `package.json` ships free `@nuxt/ui ^4.2.1`. Docs wrong about clean code. | Trust, Open-source | S |
| site-004 | [site](sections/site.md) | No `.github/workflows/`, no `public/CNAME` — site is not reproducibly deployable from a commit. Manual `pnpm generate` + copy. | Transparency, Open-source | S |
| workspace-001 | [workspace-cleanup](sections/workspace-cleanup.md) | **Sensitive:** Personal billing CSV/XLSX (timesheet_*) inside `_work_bk/` adjacent to public repos. Mode-600 today but one `git add -A` would leak PII + financial data. | (sensitive content) | S — **RELOCATE** out of workspace |
| workspace-002 | [workspace-cleanup](sections/workspace-cleanup.md) | **Sensitive:** `_work_bk/__system-data-backup-20250903-160938/` has `civic.db`, `notification-audit.jsonl`, `org-config.yml`, `roles.yml` — operational state with potential user data, wrong location. | (sensitive content) | S — INVESTIGATE then delete or move |
| workspace-003 | [workspace-cleanup](sections/workspace-cleanup.md) | Three local-only repos with no git remote: `civicpress-broadcast-box`, `civicpress-broadcast-box-backup`, `civicpress-ingest`. Flagship hardware module + ingest pipeline exist only on this laptop. Pairs with `BB-HW-002` (no license). | Resilient archival, Open-source | M — push to GitHub |
| workspace-004 | [workspace-cleanup](sections/workspace-cleanup.md) | `civicpress-broadcast-box-backup/` is **4.3 GB** Jan-30 snapshot of an active repo at Feb 3. Non-gitignored differentiators are likely empty. Blocks parent dir from feeling clean. | (waste) | S — investigate then DELETE |
| workspace-005 | [workspace-cleanup](sections/workspace-cleanup.md) | `_work_bk/` is **3.8 GB** of undifferentiated grab-bag: dated snapshots + 3rd hardware-repo copy + system-data backup + Quebec GeoJSON dataset + 2 monorepo tarballs + personal billing data. | (waste) | M — triage subitems, archive off-disk, delete |
| deps-004 | [dependencies-licenses](sections/dependencies-licenses.md) | 140 total advisories (most remediable by minor/patch bumps). Concentrations: `minimatch` (9), `node-forge` (6), `axios` (6), `tar` (6), `seroval` (5), `fast-xml-parser` (5), `handlebars` (4). | Trust | M (1-2 days bump + test) |
| deps-005 | [dependencies-licenses](sections/dependencies-licenses.md) | No Dependabot/Renovate config in `.github/` — no automated dep-freshness loop. The 140-advisory backlog is a direct consequence. | Trust | S |
| deps-006 | [dependencies-licenses](sections/dependencies-licenses.md) | `axios` 6 high advisories — DoS, prototype pollution, header injection, NO_PROXY bypass. In the API hot path. | Trust | S |
| deps-007 | [dependencies-licenses](sections/dependencies-licenses.md) | `h3` 2 high — SSE injection + request smuggling. Combined with `ui-004` (analytics injection), SSR-side surface for token theft. | Trust | S |
| deps-008 | [dependencies-licenses](sections/dependencies-licenses.md) | Cloud SDKs (`@aws-sdk/client-s3`, `@azure/storage-blob`, `@google-cloud/storage`) as direct non-optional deps. Local-only municipalities install ~tens of MB of unused SDK. Cross-ref `storage-006`. | **No vendor lock-in (soft fail)** | M |

### Phase 3 Medium (19)

| ID | Module | Description | Manifesto principle | Effort |
|---|---|---|---|---|
| ingest-005 | [civicpress-ingest](sections/civicpress-ingest.md) | `cli.py` is 3,927 lines in a single file holding all 7 commands + helpers + nested functions. Will fragment unmaintainably as municipalities add. | Ease of Use | M |
| ingest-006 | [civicpress-ingest](sections/civicpress-ingest.md) | No template config for adding a new municipality — only Richmond configs exist. Contributor onboarding gap. | Ease of Use, Public Good | S |
| ingest-007 | [civicpress-ingest](sections/civicpress-ingest.md) | Two frontmatter builders coexist (`build_frontmatter` at line 497, nested `build_final_frontmatter` at line 3421). Likely should be unified. | Trust | S |
| site-005 | [site](sections/site.md) | Plausible script loaded from `plausible.io` with no SRI hash and no privacy/consent disclosure. Risky under Quebec privacy law 25. `@nuxt/scripts` already installed but unused. | Transparency, Trust | S |
| site-006 | [site](sections/site.md) | `pages/index.vue` is 1,020-line god-page with 12 sections + duplicate SVG decoration. `agent/conventions.md` says split via layout components; the page violates its own convention. | Ease of Use | M |
| site-007 | [site](sections/site.md) | Unused deps in `package.json`: `marked`, `leaflet`, `@vueuse/core`, `@nuxt/scripts`. Three are misclassified as runtime instead of dev. Fake comprehensiveness echo. | Open-source (lean deps) | S |
| site-008 | [site](sections/site.md) | Mixed `process.client` + `import.meta.client` in the same file. Same pattern as `ui-016`. | — | S |
| site-009 | [site](sections/site.md) | `showDemoSection = false` hardcoded with 25 lines of dead `v-if`-gated demo template + i18n keys. Ship the demo or delete the section. | Ease of Use | S |
| site-010 | [site](sections/site.md) | `appVersion: '0.1.2'` in `nuxt.config.ts` vs landing copy "v0.2.0". Same drift pattern as `ui-017`. | Transparency | S |
| site-011 | [site](sections/site.md) | No security headers configurable from repo (no CSP, HSTS, X-Frame-Options, Referrer-Policy). Mozilla Observatory will flag — first signal a journalist or municipal IT contact sees. | Trust | M (requires reverse-proxy hosting) |
| workspace-006 | [workspace-cleanup](sections/workspace-cleanup.md) | `_work_bk/civicpress-backup-20251217-*.tar.gz` (1.4 GB) full-repo tarballs. Git already provides this. | (waste) | S — DELETE |
| workspace-007 | [workspace-cleanup](sections/workspace-cleanup.md) | `_work_bk/_geo_data/` (~250 MB Quebec municipal SHP/GDB/GeoJSON) used to seed Richmond demo. Living in "work backup" is wrong place. | (relocate) | M |
| workspace-008 | [workspace-cleanup](sections/workspace-cleanup.md) | `_images/` has `.ai` Illustrator source files for civic icons whose PNG exports already live in storage. Sources live nowhere documented. | (relocate) | S |
| workspace-009 | [workspace-cleanup](sections/workspace-cleanup.md) | `demo-update-commands.md` is a loose ops runbook at parent root. Not discoverable. Includes `git pull origin main` — meant to live inside the main repo. | (relocate) | S |
| workspace-010 | [workspace-cleanup](sections/workspace-cleanup.md) | No `README.md` at parent dir. New contributors cannot tell from `ls` what the 6 repos are. | Transparency, Ease of Use | S |
| workspace-011 | [workspace-cleanup](sections/workspace-cleanup.md) | Audit prompt described workspace as "5 named repos + 1 backup." Reality is **6 repos** (`media/` is the unmentioned sixth). | (docs accuracy) | S |
| deps-009 | [dependencies-licenses](sections/dependencies-licenses.md) | `@nuxt/ui-pro ^3.3.7` is the only paid-commercial-license dep in the monorepo. Activation hook still wired (`theme.env: "NUXT_UI_PRO_LICENSE"`). Cross-ref `ui-002`. | **No vendor lock-in (HARD)**, Open-source | L |
| deps-010 | [dependencies-licenses](sections/dependencies-licenses.md) | Cross-workspace undeclared imports: `modules/api/` imports `simple-git`, `gray-matter`, `nodemailer`, `@sendgrid/mail` without declaring. Works via pnpm hoisting; strict install breaks. Cross-ref `api-007`. | Trust | S |
| deps-011 | [dependencies-licenses](sections/dependencies-licenses.md) | No `pnpm licenses ls` output captured as project artifact; license posture essentially undocumented. Recommend `docs/licenses.md` auto-generated per release. | Open-source, Transparency | S |

### Phase 3 Low (11)

| ID | Module | Description |
|---|---|---|
| ingest-008 | [civicpress-ingest](sections/civicpress-ingest.md) | README mixes three install paths ("virtualenv or Poetry" + `pip install -e .`) in one sentence. |
| ingest-009 | [civicpress-ingest](sections/civicpress-ingest.md) | Several `temp_*.txt` files at repo root — leftover debugging scratch. |
| ingest-010 | [civicpress-ingest](sections/civicpress-ingest.md) | Dashboard is a second Nuxt 4 app with different (better) UI dep stack than monorepo. Consolidation candidate later. |
| site-012 | [site](sections/site.md) | Nav links skip sections that exist on the page (`#why-intro`, `#why-video`, `#municipal-leaders`, `#values`, `#cta`). Cannot deep-link. |
| site-013 | [site](sections/site.md) | i18n message-AST unwrap via internal `@nuxtjs/i18n` shape. Will silently render empty strings if AST changes. |
| site-014 | [site](sections/site.md) | No `<noscript>` fallback. Locale switcher, theme toggle, mobile menu all JS-only. |
| workspace-012 | [workspace-cleanup](sections/workspace-cleanup.md) | Repo naming inconsistent: 3 prefixed (`civicpress-*`), 3 unprefixed. |
| workspace-013 | [workspace-cleanup](sections/workspace-cleanup.md) | `_work_bk/20260125-civicpress-broadcast-box copy/` contains literal macOS Finder " copy" suffix. |
| workspace-014 | [workspace-cleanup](sections/workspace-cleanup.md) | Multiple `.DS_Store` files at parent root + several repos. |
| workspace-015 | [workspace-cleanup](sections/workspace-cleanup.md) | `site/dist -> /Users/stakabo/Work/repos/civicpress/site/.output/public` symlink encodes host's absolute path. |
| deps-012 | [dependencies-licenses](sections/dependencies-licenses.md) | `vite` 2 high advisories (build-time exposure). Affects v0.9 build pipeline. |

### Phase 3 sensitive-content summary

Two High-severity sensitive-content findings (workspace-001, workspace-002) both inside `_work_bk/`. **No `.env`, key, or credential files** found anywhere in the workspace (confirmed by the workspace-cleanup agent). The two sensitive items are operational/personal data that needs to be **relocated out of the public-repo-adjacent workspace**, not security secrets.

### Phase 3 cross-cutting observations

1. **The "stale upstream docs" pattern propagates outward.** Phase 1+2 found `docs/roadmap.md`, manifesto §3.5, `docs/project-status.md` overclaim or undermention reality. Phase 3 found that pattern propagates to `civicpress-ingest` (which doesn't update its own README/CHANGELOG either), to `site` (which faithfully mirrors the upstream overclaim to municipal evaluators), and to a 6-month gap between the ingest repo's last commit and the broadcast-box pivot. Fixing the upstream docs cascades downstream.
2. **The "no git remote" pattern is a workspace-level issue.** 3 of 6 repos have no remote (broadcast-box, broadcast-box-backup, ingest). The flagship hardware module + the working migration/import pipeline exist only on this laptop. Pairs with `BB-HW-002` (no license on the flagship hardware) — both block the manifesto's redistributability + resilience.
3. **The dependency criticals are minor-version-bump fast wins.** `simple-git`, `fast-xml-parser`, `handlebars` are all remediable by updating to patched versions. Adding Dependabot would prevent recurrence.
4. **The civicpress-ingest pipeline is the manifesto-cleanest repo in the ecosystem.** Its job is exactly "produce Markdown civic records," and it does. The lessons it carries (per-municipality YAML configs, CLI sequence of pure-ish commands, file-based handoff) could be a model for the broadcast-box civic-artifact derivation service recommended in the main audit's Recommended Next Sessions § 2.
5. **`site` is also manifesto-cleaner than the monorepo UI** (free `@nuxt/ui`, statically generated, EN/FR parity, no XSS surface). Its primary failure is being a faithful public mirror of stale upstream docs.

### Phase 3 workspace cleanup roll-up — recoverable space + recommended actions

| Item | Size | Action |
|---|---|---|
| `_work_bk/` | 3.8 GB | Triage subitems, delete what's redundant (most), keep `_geo_data/` (relocate to `civicpress-ingest/data-sources/` or `civicpress-data/`), keep billing CSV/XLSX (relocate to `~/Documents/civicpress-admin/`). |
| `civicpress-broadcast-box-backup/` | 4.3 GB | Investigate (verify nothing salvageable), then DELETE. Git provides the real backup. |
| `_images/` `[Recovered]` autosave | small | DELETE the Illustrator autosave. Move `.ai` sources into `media/`. |
| Various `.DS_Store` files | trivial | DELETE + system-wide `DSDontWriteNetworkStores` plist. |
| `demo-update-commands.md` (loose file) | small | RELOCATE into `civicpress/docs/operations/demo-deploy.md`. |

**Total reclaimable: ~8.1 GB.** Most can be done in one evening session.

---

## Status tracker

> Established 2026-05-17 as part of the base refactor (master plan `docs/plans/2026-05-17-base-refactor-master-plan.md`). Per the [finding tracking convention](../plans/finding-tracking-convention.md), this section lists every finding whose status is no longer `open`. **The implicit default for any finding not listed below is `open`.**

### Snapshot

| Status | Count | Notes |
|---|---|---|
| `open` | 187 | (default; not listed below) |
| `closed-no-commit` | 1 | workspace-001 — out-of-band filesystem move on 2026-05-17 |
| `closed-with-commit-SHA` | 17 | Task 1 (5) + Task 2 (3) + Task 3 (1) + Task 4 (2) + Task 5 (2) + Tasks 6-8 (3) + Task 9 (1) |
| `wontfix-pending-phase-X` | 0 | populated as Phase 2a defers in-scope items |
| **TOTAL** | **205** | |

### Closed findings

| ID | Status | When | Action / commit |
|---|---|---|---|
| workspace-001 | `closed-no-commit` | 2026-05-17 | Personal billing files (timesheets 2025-05 → 2026-03 + summaries, 26 files total) moved from `_work_bk/` to `~/Documents/civicpress-admin/`. Mode-600 permissions preserved. Source directory now has zero billing files. No git commit (filesystem move only). |
| BB-HW-002 | `closed-with-commit-SHA` | 2026-05-17 | AGPL-3.0-or-later license added to `civicpress-broadcast-box` repo. Commit `f63edaf` on the hardware repo (local-only; no remote yet — see workspace-003). |
| deps-001 | `closed-with-commit-SHA` | 2026-05-17 | `simple-git` bumped `^3.28.0` → `^3.36.0` in `core/package.json`. Cleared GHSA-vx2g-25mq-9c2h (`blockUnsafeOperationsPlugin` bypass). |
| deps-002 | `closed-with-commit-SHA` | 2026-05-17 | `@aws-sdk/client-s3` bumped `3.879.0` → `3.1048.0` (root + `modules/storage`); `@google-cloud/storage` `^7.15.0` → `^7.19.0`; `@azure/storage-blob` `12.28.0` → `12.31.0` (modules/storage). Cleared all paths to vulnerable `fast-xml-parser` via cloud SDKs (GHSA-mpg4-rc92-vx8v). |
| deps-003 | `closed-with-commit-SHA` | 2026-05-17 | `plop` bumped `4.0.1` → `4.0.5`. Cleared `handlebars` GHSA-3wjp-mcw9-37jh via `node-plop`. |
| deps-005 | `closed-with-commit-SHA` | 2026-05-17 | `renovate.json` added at repo root. Weekly Monday schedule, auto-merge minor+patch via branch, major requires manual review, security advisories labeled. Renovate chosen over Dependabot for manifesto "no vendor lock-in" alignment (runs anywhere, not GitHub-coupled). |
| api-001 | `closed-with-commit-SHA` | 2026-05-17 | `routes/info.ts` now uses `(req as any).civicPress` (injected by mount middleware in `src/index.ts:227`) instead of allocating a fresh `CivicPress` per request + initialise + shutdown. Removes the DoS amplifier on the unauthenticated `/api/v1/info` endpoint. |
| api-002 | `closed-with-commit-SHA` | 2026-05-17 | Validation router mount at `src/index.ts:303` now wraps with `authMiddleware(this.civicPress)` + civicPress injection. All 4 validation routes use `requirePermission('records:view')` which needs `req.user`; previously the mount supplied neither, so production calls always 401d. |
| api-003 | `closed-with-commit-SHA` | 2026-05-17 | Status router mount at `src/index.ts:281` now injects `(req as any).civicPress = this.civicPress` via middleware. Previously the status endpoints read `req.civicPress` and threw 500 outside of test fixtures. |
| api-004 | `closed-with-commit-SHA` | 2026-05-17 | 4 stub routers (`workflows.ts`, `hooks.ts`, `export.ts`, `import.ts`) — previously returned fake `200 OK` with hardcoded payloads while looking live to callers — now return `501 Not Implemented` with a structured body (`error`, `code`, `message`, `retry_after_milestone`). Workflows/hooks point at v0.4.x; export/import point at v0.5.x. Import also documents the civicpress-ingest workaround. Auth gates retained so the surface stays bounded. OpenAPI spec for `/api/v1/workflows` updated to document 501. |
| ui-001 | `closed-with-commit-SHA` | 2026-05-17 | `useMarkdown.ts:140-ish` now sanitizes `marked.parse()` output via `isomorphic-dompurify` before returning (and before calling any `onTransformHtml` callback). Closes the XSS-via-published-record vector that could steal JWT/CSRF tokens from `localStorage` for any citizen viewing a malicious record. Both v-html sinks (`RecordPreview.vue:33` and `pages/records/[type]/[id]/index.vue:675`) go through this composable. 8 unit tests added at `modules/ui/app/composables/__tests__/useMarkdown.test.ts` covering script tags, iframes, on* handlers, javascript: URIs, data: URIs, object/embed tags, and preservation of safe markdown + the empty-line marker. **First real unit tests for the UI module.** Required adding `modules/ui/app/**/__tests__/**/*.{test,spec}.ts` to `vitest.config.mjs` `include` and fixing a duplicate `fileParallelism` key in that same config (small "make truth true" bonus). |
| ui-003 | `closed-with-commit-SHA` (partial) | 2026-05-17 | `app.vue` template now includes a `<noscript>` block telling JS-disabled visitors what CivicPress is, where records live (`data/records/` Markdown), and how to read them without the SPA. Full SSR/prerender for the public read paths still deferred to Phase 2d as planned — this is the partial fix the master plan called out. |
| storage-001 | `closed-with-commit-SHA` | 2026-05-17 | `cloud-uuid-storage-service.ts` now calls `quotaManager.checkQuota(folder, fileSize)` before accepting both the non-streaming and streaming upload paths. Previously `QuotaManager.checkQuota` was implemented + unit-tested but never called from any production code path; configured quotas were not enforced. Streaming path checks against the declared `request.size` if provided; if size is unknown the path logs a warning and proceeds (alternative — buffering to count bytes — defeats streaming). |
| storage-002 | `closed-with-commit-SHA` | 2026-05-17 | `routes/uuid-storage.ts` `GET /folders/:folder/files` no longer requires `storage:download` unconditionally. The handler now loads the folder's `access` config; if `'public'`, unauthenticated callers can list (matching the existing pattern on `GET /files/:id` and `GET /files/:id/info`). For non-public folders, `req.user` is required and `userCan(...)` is checked. Also handles missing-folder gracefully with a 404 instead of empty list (small UX win against silent probing). |
| notifications-001 | `closed-with-commit-SHA` | 2026-05-17 | `notification-service.ts` `sendNotification` now computes `success` from the actual `Promise.allSettled` results (`success = sentChannels.length > 0 && failedChannels.length === 0`). Audit row also carries `failedChannels`, `partial`, per-channel `errors`, and `template`. Action becomes `notification_sent` on full success, `notification_partial_or_failed` otherwise. **`.system-data/notification-audit.jsonl` wiped of its 5,156 leftover dishonest entries** (test/dev leftovers per the user; option (b) — truncate — from the Phase 2a plan). Logging starts fresh and honest. |
| notifications-002 | `closed-with-commit-SHA` | 2026-05-17 | `validateRequest()` and `checkRateLimit()` return values are now inspected. Invalid requests throw with the validator's errors AND emit a `notification_rejected` audit entry. Rate-limited requests throw with the reset time AND emit a `notification_rejected` audit entry. The rejection audit entries include reason, template, channels, and (for rate limit) resetTime + remaining — so an operator can see what got blocked and why. |
| notifications-003 | `closed-with-commit-SHA` | 2026-05-17 | Removed the `security.sanitizeContent(request.data)` call from the render path in `notification-service.ts:124`. The template variable bag is the message content; sanitizing it pre-render made recipient-bound emails read "Hello [REDACTED]". Sanitization remains available as a method for the audit-log path (the actual right place for PII redaction); the audit log entries currently don't include user PII, so no PII fields are persisted at all today. Also fixed `notification-security.ts:15`'s literal-pipe bug inside the email regex character class (`[A-Z|a-z]` → `[A-Za-z]`). |
| deps-004 | `closed-with-commit-SHA` | 2026-05-17 | `pnpm update --recursive` (semver-respecting, no `--latest`) bumped 100+ packages within their existing version ranges. **143 → 21 vulnerabilities** (Critical 0/0, High 73 → 10, Moderate 53 → 7, Low 17 → 4). All 10 remaining Highs are transitive in dev-tooling or test-only paths (node-tar variants via sqlite3 prebuild + cli > tar; glob CLI; nodemailer addressparser DoS; happy-dom test env). Documented in `docs/dependencies-known-issues.md` with parent path + reason-not-bumpable + action. Renovate (deps-005) will surface upstream patches as they release. |

**pnpm audit before:** 140 advisories (4 Critical, 69 High, 49 Moderate, 18 Low).
**pnpm audit after Task 1:** 143 advisories (**0 Critical**, 73 High, 53 Moderate, 17 Low). High +4 is expected — newer cloud SDKs pulled additional transitive deps; addressed by deps-004 in Task 9.

### Pending deferrals (populated by Phase 2a Task 10)

(None yet — Phase 2a tasks will mark `broadcast-box-002`, `broadcast-box-007`, `BB-HW-001`, `BB-HW-003`, and possibly `ui-002` as `wontfix-pending-phase-N` when their respective phases are scoped. `ui-002` may be promoted to `triaged` within Phase 2a instead, pending the Nuxt UI Pro v3→v4 migration scoping — see `nuxt-ui-pro-v4-free` memory.)
