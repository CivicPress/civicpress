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
| `open` | 154 | (default; not listed below) |
| `triaged-phase-2b` | 0 | (all 9 cluster findings closed during Phase 2b) |
| `triaged-phase-2c` | 0 | (all 13 Phase-2c-triaged-with-code findings closed) |
| `triaged-phase-2c-for-recon-close` | 0 | (all 3 closed in Phase 2c Task 2 — see closed-by-recon-no-commit + wontfix-pending-phase-X rows) |
| `closed-no-commit` | 1 | workspace-001 — out-of-band filesystem move on 2026-05-17 |
| `closed-by-recon-no-commit` | 2 | notifications-008 (recon Task 2 — NotificationQueue actually wired; audit was stale); core-010 (recon Task 8 — `modules/notifications/` already gone as a side effect of Task 6's EmailChannel consolidation; never had a workspace package entry) |
| `closed-with-commit-SHA` | 47 | 2a (17) + 2b Task 1 (3) + 2b Task 4 (2) + 2b Task 5 (1) + 2b Tasks 8-11 (2: ui-005, cli-001) + 2c Tasks 3-7 (10: core-004/5/6, api-008, storage-003/4/9, notifications-005/6/13) + 2c Task 9 (2: core-001, core-013) + 2d W3 (3: api-009, ui-011, storage-015) + 2d W4 (5: storage-006, deps-008, api-007, deps-010, deps-011) + 2d-followup ui-002 v3→v4 migration (2: ui-002, deps-009). **Original-205 only.** Phase-2c-surfaced closures (email-validation-regression, ui-record-form-emit, ui-geography-form-nullguard, docs-overclaim-architecture, docs-overclaim-5, ci-truth-check), Phase-2c.5-surfaced closures (phase-2c.5-followup-1/2/3/4), and Phase-2d-W2 god-file decomposition closures (21 rows) are tracked as separate rows in the Closed findings table below; not counted in the original-205 truth-meter. |
| `wontfix-by-phase-strategy` | 1 | site-002 (Phase 5) |
| `superseded-by-deletion` | 1 | broadcast-box-004 (verified absent) |
| `wontfix-pending-phase-X` | 8 | Phase 2a deferrals (4: broadcast-box-002/007, BB-HW-001/3 — ui-002 promoted to `closed-with-commit-SHA` 2026-05-28 on the 2d-followup branch) + Phase 2c deferrals (4: broadcast-box-003 → Phase 4/5, broadcast-box-013 → Phase 5, realtime-007/008 → Phase 3) |
| **TOTAL** | **205** | (154 implicit-open + 51 tracked rows) — original snapshot's `open: 173` was 1-off; corrected here. |

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
| legal-register-001 | `closed-with-commit-SHA` | 2026-05-18 | `docs/specs/legal-register.md` rewritten in Phase 2b Task 1: frontmatter demoted to `status: planned, version: 0.3.x-scope`; new "Current implementation" section documents the 210-line schema-only reality at `core/src/records/record-schema-builder.ts:219-236`. Triage rationale: `docs/audits/spec-stability-triage.md`. Real module build sequenced post-Phase-2d per master plan §9.4. |
| legal-register-006 | `closed-with-commit-SHA` | 2026-05-18 | Closed alongside legal-register-001 — the empty `modules/legal-register/package.json` scaffold is now correctly framed by the spec's planned status (no longer claimed as a stable module). Real package metadata revisit happens when the module gets built. |
| notifications-007 | `closed-with-commit-SHA` | 2026-05-18 | `docs/specs/notifications.md` frontmatter demoted to `status: partial, version: 0.2.x`. Implementation now honest after Phase 2a Tasks 6-8 (notifications-001/2/3); email channel works, SMS/Slack/webhooks/queue absent. Spec body retained as the target shape; frontmatter status is the truth signal. |
| site-001 | `closed-with-commit-SHA` | 2026-05-18 | civicpress-site repo commit `e7ee413` (local only — pending maintainer push). i18n hero copy in `en.json` + `fr.json` softened: "first stable foundation" → "first working alpha"; mentions the post-audit refactor. The site is now mirror-honest with the monorepo's alpha status. |
| site-003 | `closed-with-commit-SHA` | 2026-05-18 | civicpress-site repo commit `e7ee413` (local only). 6 docs corrected to say `@nuxt/ui` (free + OSS, what the site ships on) instead of `@nuxt/ui-pro`: README.md, .cursor/rules.md, agent/conventions.md, agent/tools/quick-guide.md, agent/memory/decisions.md, agent/memory/project-state.md. |
| BB-HW-008 | `closed-with-commit-SHA` | 2026-05-18 | civicpress-broadcast-box repo commit `6c881db` (local only — repo has no remote yet, workspace-003). Deleted `docs/engineering-analysis.md` (765 lines self-grading "Top 0.1% Senior Engineer / 95% production-ready" while 20+ action items unchecked); added `docs/engineering-analysis-pending.md` pointing at Phase 4 of refactor master plan for honest assessment. |
| BB-HW-011 | `closed-with-commit-SHA` | 2026-06-18 | Phase 4 quick-win. civicpress-broadcast-box repo commit `afda81d` (local only — no remote). `services/ap_mode/service.py` hardcoded `self.timeout_minutes = 0  # Disabled for testing`, leaving the enrollment Wi-Fi AP open indefinitely. Made `timeout_minutes` a constructor param with a safe default of 15 (the existing `if timeout_minutes > 0` guard + `_timeout_timer` auto-deactivate the AP); 0 still disables it for tests. py_compile clean; no test references the timer. Full pytest not run (hardware-repo deps not installed in the dev VM). |
| BB-HW-012 | `closed-by-recon-no-commit` | 2026-06-18 | Phase 4 recon. Audit (2026-05) flagged `security-considerations.md` "Credentials stored encrypted in SQLite" as doc-vs-code drift. Re-verified against current code: `services/device/credentials.py` now implements real encryption (`Fernet` + PBKDF2HMAC); `store_credentials` encrypts before `state_manager.set_config(...)` and `get_credentials` decrypts. The doc claim is now TRUE — encryption was added since the audit snapshot. No change needed; registry-only closure. |
| BB-HW-015 | `closed-with-commit-SHA` | 2026-06-18 | Phase 4 quick-win. civicpress-broadcast-box repo commit `6b45fc9` (local only — no remote). Version/status claims disagreed across three sources: `pyproject.toml` (`version = "0.1.0"`, no maturity signal), CHANGELOG (`[0.1.0]` = "Initial design and documentation phase" — false; the real implementation sat under `[Unreleased]`), and `agent/goals.md` ("✅ CORE IMPLEMENTATION COMPLETE"). Maintainer chose the "alpha, not pilot-ready" framing (2026-06-18); aligned all four sources (those three + README `## Status`) on: **0.1.0, alpha, unreleased — core capture/encoding/preview/CivicPress integration operational; not yet pilot-ready (no civic-artifact output, no installer)**. Added a `Development Status :: 3 - Alpha` classifier to pyproject. Doc-only; pyproject still parses. |
| BB-HW-007 | `closed-with-commit-SHA` | 2026-06-18 | Phase 4 W0. The hardware appliance is now documented in the published base docs (this Phase 4 W0 base commit on `refactor/phase-4-w0`): `docs/roadmap.md` Phase 4 truth-meter row expanded from "_pending_" to the in-progress state, and `docs/project-status.md` "In Progress" gains a **"BroadcastBox Hardware Appliance (Alpha — Phase 4)"** subsection — separate repo, AGPL-3.0, working capture/encode/preview, honest about the gaps (no Markdown civic record yet, no installer). Closes the "flagship's hardware side invisible to published roadmap" gap. |
| bb-hw-pyproject-dep-drift | `closed-with-commit-SHA` | 2026-06-18 | (Phase 4 W0 scoping finding N1, not in original 205) civicpress-broadcast-box `23b87c9` (local only — no remote, workspace-003). `pyproject.toml [project.dependencies]` omitted `fastapi`, `uvicorn`, `av`, `aiortc` — all imported at module load by `src/` (`web/api/routes.py`, `services/preview/*`, `services/ap_mode/web_server.py`) — so a clean `pip install -e .` produced a non-importable app (the Mac flow worked only because the Makefile installed from `requirements.txt`, which did list them). Added the four to pyproject (now a complete single source of truth); pointed Makefile `install`/`dev-setup` at `pip install -e ".[dev]"`; kept `requirements.txt` as a documented mirror. |
| bb-hw-opencv-headless | `closed-with-commit-SHA` | 2026-06-18 | (Phase 4 W0 scoping finding N2, not in original 205) `23b87c9`. Switched `opencv-python` → `opencv-python-headless` in pyproject + requirements. The appliance is a headless SBC (no display / no `libGL.so.1`); the GUI build can't import there and is the wrong dependency for a Raspberry Pi. Verified zero `cv2` GUI calls (`imshow`/`namedWindow`/`waitKey`/…) in the tree, so headless is behaviour-preserving. Ties into BB-HW-009 (Pi install path). |
| bb-hw-v4l2-encoder-test | `closed-with-commit-SHA` | 2026-06-18 | (Phase 4 W0 scoping finding N3, not in original 205) `23b87c9`. `tests/unit/test_unified_encoder.py::test_encoder_detection` allow-list omitted `EncoderType.V4L2_M2M` (`h264_v4l2m2m`) — the Raspberry Pi's hardware encoder that production **defines and selects** (`services/encoder/detection.py:17,210`). The test therefore passed on a Mac (VideoToolbox) but would **fail on the actual Pi target** — inverse of what a hardware appliance's suite should do. Production code is correct; added `V4L2_M2M` to the test. With N1+N2+N3 and the system `ffmpeg` binary, a clean `pip install -e ".[dev]"` yields **283 passed / 7 skipped / 0 failed** on the ARM dev VM (was un-runnable from a clean checkout before W0). |
| bb-hw-gitignore-venvs | `closed-with-commit-SHA` | 2026-06-18 | (Phase 4 W0 scoping finding N4, not in original 205) `23b87c9`. `.gitignore` hardened to ignore side venvs (`.venv*/`) created by the documented dev-env recipe; removed on-disk macOS/build cruft (`.DS_Store`, `.coverage`, `coverage.xml`, `htmlcov/`, dead macOS `.venv/`) — all were already gitignored/untracked, so disk-only cleanup, no tracked-file change. |
| truth-check-makefile-allowlist | `closed-with-commit-SHA` | 2026-06-18 | (Phase 4 W0 surfaced finding N5, base repo, not in original 205) The `audit-truth-check` gate itself was failing whole-repo: `make help`'s text (`Makefile:12`) lists the overclaim patterns as examples of what it scans for, so the gate flagged its own documentation. Latent since `443a577` (2026-05-18, the commit that added both the gate and the help text); never observed because the refactor runs on local-only branches, so GitHub CI hasn't executed. Fix: added `Makefile` to `scripts/audit-truth-check-allowlist.txt`, extending the existing "this script + its allow-list + the CI workflow naturally mention the patterns" stanza (the Makefile target is the same gate machinery, simply omitted). Gate now PASSES whole-repo under both GNU grep (CI-equivalent) and the dev VM's ugrep shim. |
| workspace-003 | `partially-addressed` | 2026-06-19 | **Resilience half closed for the flagship hardware repo.** `civicpress-broadcast-box` is now pushed to a **private** remote `git@github.com:CivicPress/BroadcastBox.git` (all 4 local branches — `main`, `refactor/phase-4-w0-unblock`, `backup/preview-routes-wip-20260618`, `claude-test`; default `main`; private per the "keep hidden until the Phase 5 reveal" decision). The "exists only on this VM" data-loss risk is removed for the flagship. Naming follows the Automattic model (org namespaces it → `CivicPress/BroadcastBox`, no `civicpress-` prefix). **Remaining (open):** `civicpress-broadcast-box-backup` (stale copy — cleanup, workspace-004, not a backup target) and `civicpress-ingest` (private PDF→.md demo-data helper — intentionally NOT published). **Redistributability half** (flip BroadcastBox to public; license already added via BB-HW-002) completes at the Phase 5 reveal. |
| BB-HW-004 | `closed-with-commit-SHA` | 2026-06-20 | Phase 4 W1b. Hardware now speaks ONE wire format. civicpress-broadcast-box `c6c71e7` (branch `refactor/phase-4-w1-protocol`). The receive loop validates every frame against the vendored canonical schema (`protocol/broadcast-protocol.schema.json`, from `@civicpress/broadcast-protocol`) and drops non-conforming frames; the three defensive inbound shapes are **deleted** (the `type=control` event→action branch + the no-`type` `{action, commandId}` "server format"). Commands carry top-level action/id/timestamp (canonical). Greenfield — no migration (nothing public depended on the old shapes). `connector/protocol.py` = jsonschema Draft-2020 validator; `make protocol-sync`/`protocol-check` keep the vendored copy byte-identical to canonical. |
| BB-HW-005 | `closed-with-commit-SHA` | 2026-06-20 | Phase 4 W1c. civicpress-broadcast-box `c6c71e7`. Replaced `command_handler`'s 22-branch `if/elif command_type` chain with a `{action: handler}` dispatch table built in `__init__`; aliases (get_sources/list_sources, set_pip/pip.configure) map to one handler; unknown action → ValueError → error ACK (behavior unchanged). 62 command-handler tests + 10 new protocol tests pass; full HW suite 293 passed / 7 skipped. |
| BB-HW-017 | `triaged-deferred` | 2026-06-21 | Phase 4 W1f re-scope. The architecture's "kill the device control UI" premise was **wrong**: `frontend/` (`@broadcast-box/ap-mode-ui`, pages enrollment/network/settings/preview/index) is the **AP-mode enrollment/setup UI** served by `services/ap_mode/web_server.py`, not a separate control UI — deleting it would break first-run setup. The device is *already* headless for operational control (control = CP WebSocket commands; verified in code). BB-HW-017's real residue (a second heavy Nuxt + `@nuxt/ui-pro` app) is addressed by **slimming** that enrollment UI (drop `@nuxt/ui-pro`, reduce to enrollment+network) — a focused UI task, **deferred** (not W1, no deletion). Design doc + W1 plan corrected. |
| BB-HW-013 | `triaged-deferred` | 2026-06-22 | Phase 4 enrollment review. **Strategy decided:** re-enrollment uses **one-time, server-revocable** codes — on `AUTH_FAILED` the device goes dormant and needs a fresh code / re-pairing (NO silent auto-re-enroll). Review also confirmed: enrollment_code stored **plaintext** (`services/device/enrollment.py:34`) while JWT is Fernet-encrypted (E1); the Fernet key is **co-located** with the ciphertext in the state-manager config (`services/device/credentials.py`), so encryption gives limited confidentiality vs DB read (E2, nuances BB-HW-012); `generate_qr_code` re-exposes the stored code (E4). E1/E2/E4 are **bundled with the one-time-code work into a single coordinated device+server enrollment-hardening pass** (needs server support → Phase 5 coordination); not done piecemeal. The auto-re-enroll path (`command_handler._attempt_re_enrollment`) is touched by W1d, so W1d's reconnect consolidation lands after this. Decision recorded in the `broadcast-box-enrollment-strategy` memory. **Progress 2026-06-22 (P5d, `3c02e2c`):** SERVER half now enforces one-time/revocable — `device-manager.registerDevice` drops the `findByDeviceUuid` reuse fallback + the existing-device recovery path (which accepted expired AND already-used codes); registration now requires a fresh unused, non-expired code and consumes it. **Device half 2026-06-22 (`17a1759`, HW repo `refactor/phase-4-enrollment-hardening`):** E1/E4 + no-silent-re-enroll done — `enroll_with_civicpress` deletes the `enrollment_code` after success (no plaintext at rest; QR has nothing to re-expose) and `_attempt_re_enrollment` is now a no-op (device goes dormant on `AUTH_FAILED`; re-enroll needs a fresh code via re-pairing). E2 (key co-located with ciphertext) documented as an honest threat-model note on `CredentialManager` (real key separation = platform-specific future work). HW suite 299 passed / 7 skipped. **Tests 2026-06-22 (P5e):** the one-time semantics are now locked by the server module suite — `registerDevice` gained positive consume / reject-expired / reject-used / re-pair-with-fresh-code tests; the integration enroll→register round-trip runs against a stateful enrollment store where a *consumed* code stops resolving; `switch_source` asserts the canonical `ERR_SOURCE_NOT_FOUND`; and device tokens gained a `jti` so a refresh always rotates the token. Module suite 108/108, `tsc` clean. **Still open:** real key separation (E2). BB-HW-010 header-only auth is now **done** (2026-06-22, `7e5978f`) — see its own row below. |
| BB-HW-010 | `closed-with-commit-SHA` | 2026-06-22 | Phase 4 security pass (W0 had unblocked the runnable suite). The device sent its auth token BOTH in the `Authorization: Bearer` / `X-Device-Token` headers AND as a `?token=` query param (leaks via server logs + intermediary proxies). The token was baked into the WS endpoint URL at two construction sites (`main.py` + the `_handle_re_enrolled` re-enrollment path); rather than a two-site refactor, the fix lands at the single chokepoint they both flow through — `connector/websocket_client.py::connect()` now lifts the token into the headers and **strips the `token` query param from the URL actually sent on the wire** (other params preserved). **Server side needed no change:** `@civicpress/realtime`'s `extractToken` (`modules/realtime/src/auth.ts:124`) already resolves header → subprotocol → query (query logs a deprecation warning) and `realtime-server.ts:355` passes `req.headers` — so the coordination prerequisite was already satisfied. HW repo commit `7e5978f` (branch `refactor/phase-4-enrollment-hardening`); adds `tests/unit/test_websocket_token_header.py` driving the real `connect()` against a mocked transport (asserts no token on the wire URL + token present in the header). Full HW suite 302 passed / 7 skipped. **Follow-up `e03b4d9`:** dropped the redundant `X-Device-Token` header — nothing consumed it (server reads `Authorization` only), so the token now rides a single header; test asserts its absence. HW branch pushed to the private backup (`CivicPress/BroadcastBox`). |
| ui-005 | `closed-with-commit-SHA` | 2026-05-18 | Phase 2b Tasks 8 (`b58cd27` — RecordForm/GeographyForm/UserForm, 24 cases) + 9 (`10997e3` — RecordList/RecordSearch/RecordPreview/StatusTransitionControls, 23 cases). 47 component test cases pinning the 7 civic-critical UI surfaces. `data-test` hooks added to the 4 viewing components. Full ≥25-component coverage rolls to Phase 2d structural hardening. |
| cli-001 | `closed-with-commit-SHA` | 2026-05-18 | Phase 2b Tasks 10 (`5d9587d` — init/create/list/publish/validate, 34 cases incl. 3 .skip-with-TODO) + 11 (`08ed68a` — history/search/status/users/login, 37 cases). 71 CLI test cases pinning command registration, options, positional args. Surfaced real bugs: `publish.ts` doesn't exist (folded into status command); `status.ts` hardcodes valid statuses without 'published' while `init.ts` seeds it. Bugs tracked for Phase 2c, not fixed in scope. Full 28-command coverage rolls to Phase 2d. **Phase 2c follow-ups (post-closure):** Task 10 (`b2914ea`) deleted 16 placeholder `tests/cli/*.test.ts` theatre files (2232 LoC) that asserted only the "CLI testing disabled" stub — plus removed `runCivicCommand` from `tests/utils/cli-test-utils.ts`. Kept the 10 real `tests/cli/*` integration files that exec the built binary. Task 11 (`230976e`) wired `civic publish` as a top-level CLI command (wraps `publishDraft` saga path), exported `VALID_STATUSES` from `status.ts` with `'published'` added (matches what `init.ts` seeds), and replaced the 3 `.skip-with-TODO` cases in `cli/src/commands/__tests__/publish.test.ts` with real assertions. Test count drop on suite (1309 → 1191) is the theatre removal. CLI's real test surface is now `cli/src/commands/__tests__/` (Phase 2b+2c, 12 files / 84 cases) + `tests/cli/` (10 integration files exercising the built binary). |
| realtime-007 | `wontfix-pending-phase-3` | 2026-05-18 | Phase 2c Task 2 recon: `modules/realtime/src/realtime-server.ts` does not exist on `dev` (only compiled `.d.ts` artefacts remain). The file lives on the paused `broadcast-box` branch; per master plan §5/§9 Phase 3 reintroduces realtime "Yjs-only, no broadcast-box code." `generateParticipantColor()` and `PARTICIPANT_COLORS` get cleaned up as part of Phase 3 realtime reintroduction. No commit on Phase 2c branch (registry-only). |
| realtime-008 | `wontfix-pending-phase-3` | 2026-05-18 | Phase 2c Task 2 recon: `modules/ui/app/composables/useRealtimeEditor.ts` does not exist on `dev`. Same rationale as realtime-007 — addressed during Phase 3 realtime reintroduction. `MAX_RECONNECT_ATTEMPTS` + `RECONNECT_DELAYS` cleanup deferred. |
| notifications-008 | `closed-by-recon-no-commit` | 2026-05-18 | Phase 2c Task 2 recon: the audit finding said `NotificationQueue` was orphaned. Verification: `core/src/notifications/notification-service.ts:46` instantiates it (`this.queue = new NotificationQueue();`). Audit was stale — the queue IS wired into the production notification path. No code change required; registry-only closure. |
| core-004 | `closed-with-commit-SHA` | 2026-05-18 | Phase 2c Task 3 (`42bf991`) deleted `core/src/saga/saga-recovery.ts` per delete-or-wire-criteria.md §4. `recoverFailedSagas()` had been a TODO placeholder for 18+ months; only `saga/index.ts` + the recovery describe block in `saga-e2e.test.ts` imported it. No v0.3.x production path needs saga compensation re-run; reintroduce when saga reliability becomes a real pain. The orphan `SagaRecoveryError` class in `core/src/saga/errors.ts` was left in place (tangential; flagged as a Phase 2d hygiene item). |
| core-005 | `closed-with-commit-SHA` | 2026-05-18 | Phase 2c Task 3 (`42bf991`) deleted both subsystems named by the finding: `core/src/saga/saga-metrics.ts` (`SagaMetricsCollector` was only imported by its test) and `core/src/cache/warming/cache-warmer.ts` (`warming.enabled` was never set true; also removed the warming-init block, `warmers` Map field, warmer-shutdown loop, and `warming?:` field on `CacheConfig`). Per delete-or-wire-criteria.md §4. |
| core-006 | `closed-with-commit-SHA` | 2026-05-18 | Phase 2c Task 3 (`42bf991`) removed `'hybrid'` from the `CacheStrategy` union in `core/src/cache/types.ts` and the corresponding "not yet implemented" throw in `unified-cache-manager.ts:73-77`. DELETE-FROM-UNION per delete-or-wire-criteria.md §4 — type union shouldn't advertise unimplemented options. |
| api-008 | `closed-with-commit-SHA` | 2026-05-18 | Phase 2c Task 4 (`a32a06b`) deleted `modules/api/src/middleware/jwt-auth.ts` (227 LoC) — pure dead duplicate of `middleware/auth.ts` per delete-or-wire-criteria.md §2. Grep confirmed zero imports outside the file itself; no `middleware/index.ts` re-export to clean up. Build clean; tests pass. |
| storage-003 | `closed-with-commit-SHA` | 2026-05-18 | Phase 2c Task 5 (`5e990e3`) deleted `LifecycleManager.archiveFile` per delete-or-wire-criteria.md §2. The method was a DB-only folder rename — never moved bytes. `OrphanedFileCleaner` already compensates for archival drift; its header docstring now records that history. Single internal call site replaced with a Phase-2c marker comment. |
| storage-004 | `closed-with-commit-SHA` | 2026-05-18 | Phase 2c Task 5 (`5e990e3`) WIRED `StorageFailoverManager.checkProviderRecovery` per delete-or-wire-criteria.md §3 (cheap insurance — failover-without-recovery was a real reliability gap). Replaced no-op debug log with a real provider probe via the existing `CloudUuidStorageService.performHealthCheck` primitive (per-type: local `fs.pathExists`; S3 list-with-limit-1; Azure/GCS equivalents). Promoted the probe Map to a `providerProbes` instance field built unconditionally so the failover recovery path uses it even when periodic checks are off. 4 unit tests added at `modules/storage/src/__tests__/provider-recovery.test.ts` pin the contract. **Bonus surfacing:** the storage suite wasn't actually being executed by the root vitest config — Task 5 also added `modules/storage/vitest.config.mjs` to make the module's tests run. Pre-existing storage test breakage uncovered as a result; out of Task 5 scope, flagged in the Phase 2c closure report. |
| storage-009 | `closed-with-commit-SHA` | 2026-05-18 | Phase 2c Task 5 (`5e990e3`) deleted `modules/storage/src/uuid-storage-service.ts` per delete-or-wire-criteria.md §2. No live importers anywhere; `CloudUuidStorageService` is the production path. Re-export removed from `modules/storage/src/index.ts`. |
| notifications-005 | `closed-with-commit-SHA` | 2026-05-18 | Phase 2c Task 6 (`7b783af`) consolidated 3 ad-hoc EmailChannel implementations into one canonical channel at `core/src/notifications/channels/email-channel.ts`. Supports SMTP (with optional `tls.rejectUnauthorized` passthrough) and SendGrid; AWS SES was advertised by the deleted module file but threw "not yet implemented" — dropped per the Phase 2c "delete fake comprehensiveness" rubric. 8 unit tests pin the contract. `modules/notifications/channels/email-channel.ts` deleted. **Follow-up flagged:** a 4th ad-hoc impl exists at `modules/api/src/routes/notifications.ts:83` — recon missed it; migration is a Phase 2c follow-up (see closure report). |
| notifications-006 | `closed-with-commit-SHA` | 2026-05-18 | Phase 2c Task 6 (`7b783af`) implicit closure — the `createTransporter` typo lived only at `modules/notifications/channels/email-channel.ts:129,188` (deleted as part of Task 6's consolidation). The canonical channel uses the correct `createTransport`. |
| notifications-013 | `closed-with-commit-SHA` | 2026-05-18 | Phase 2c Task 7 (`2700e8d`) deleted `validateWebhookSignature()` and the companion `generateWebhookSignature()` (42 LoC total) from `core/src/notifications/notification-security.ts`. No webhook endpoint exists in v0.2.x to wire these to — grep across `modules/api/src/` and `cli/src/` returned zero webhook route handlers. Per delete-or-wire-criteria.md §2; reintroduce with the endpoint when v0.3.x grows webhook support. The `secretsManager?` plumbing in NotificationSecurity is now vestigial (no remaining methods use it); removing it would cascade across 3 files outside Task 7's surface — flagged for a later hygiene pass. |
| core-010 | `closed-by-recon-no-commit` | 2026-05-18 | Phase 2c Task 8 recon: `modules/notifications/` directory does NOT exist on `dev` post-Task-6. The audit claimed two parallel notifications systems, but on inspection `modules/notifications/` had only ever held `channels/email-channel.ts` (1 file, 395 LoC) — no package.json, no service, no workspace entry. Task 6's EmailChannel consolidation deleted that file; git doesn't track empty directories, so the dir is gone. `pnpm-workspace.yaml` never listed `modules/notifications`. Canonical notifications system is `core/src/notifications/`. Net result: split resolved as a side effect of Task 6; no separate code commit required. (Remaining mentions of `modules/notifications` in the codebase are intentional historical-reference comments in T6's canonical channel + test.) |
| core-001 | `closed-with-commit-SHA` | 2026-05-18 | Phase 2c Task 9 introduced `core/src/audit/audit-channel.ts` — the unified audit trail. Composes the existing `AuditLogger` (file-JSONL, resilient archival per the manifesto) and `Database.logAuditEvent` (queryable). Write order: file-JSONL first, DB second (user-resolved Appendix B.6 decision). 8 unit tests pin the contract (write-order, swallowed-JSONL-failure, DB-failure-re-raise, userId propagation, system-event actor omission, outcome default, structured-details serialization, message-over-details precedence). `RecordManager` now has an injected `auditChannel` field; the 3 audit-write call sites in record-manager.ts (createRecord, createRecordWithId, updateRecord) route through a `writeAudit` helper that prefers the channel and falls back to direct `db.logAuditEvent` only when no channel was injected. **The audit's named example (record-manager.ts:778-785 wrote DB audit without `userId`) is now fixed** — userId flows from `user?.id` into the channel. DI wired in `civic-core-services.ts` (new `auditLogger` + `auditChannel` singletons). **Follow-up (not closed in this task):** the 2 remaining direct `db.logAuditEvent` call sites at `core/src/auth/email-validation-service.ts:498` and `core/src/auth/auth-service.ts:717` still bypass the channel; tracked as Phase 2c.5 cleanup. |
| core-013 | `closed-with-commit-SHA` | 2026-05-18 | Phase 2c Task 9 added saga audit hooks to `SagaExecutor` (NOT per-saga — putting the hook on the executor instruments all 4 sagas at once: archive-record, create-record, publish-draft, update-record). `SagaExecutor` constructor now takes an optional `auditChannel`; when provided, the executor writes `saga:<name>:start` after idempotency-pass, `saga:<name>:complete` after success, and `saga:<name>:failure` on timeout / step error / other errors. Audit writes go through `AuditChannel.record` (file-JSONL first, DB second) so saga lifecycle survives DB failure. Audit-write failures are swallowed with a warn log — never breaks saga execution (the existing `coreWarn` lane). DI wiring updated in `civic-core-services.ts`. The audit's framing "sagas write neither store" is now FALSE on dev. |
| email-validation-regression | `closed-with-commit-SHA` | 2026-05-19 | (Phase-2b-surfaced item, not in original 205) Phase 2c Task 12 (`928797d`) fixed the `should reject expired verification token` regression that Phase 2b's stale-artifact purge revealed. The bug was 3-layered: (a) SQL `WHERE expires_at > datetime("now")` was correct but (b) the test's manual UPDATE matched on the public token while the DB stored `sha256(rawToken)`, AND (c) `verifyToken` parsed SQLite datetime strings via `new Date(...)` which interprets un-marked strings as local time — shifting the in-memory Date by the host's UTC offset. Fix: added a defensive in-code expiry check in `verifyToken`, a `parseSqliteDatetime` helper that anchors un-marked datetimes to UTC, and corrected the test's UPDATE to address the row by `user_id AND type='change'`. Suite failure count drops from 2 to 1 (only the §9.1 database-integration session-mgmt flake remains). |
| ui-record-form-emit | `closed-with-commit-SHA` | 2026-05-19 | (Phase-2b-surfaced item #6, not in original 205) Phase 2c Task 13 (`1e49ca7`) removed the dead `submit: [recordData: RecordFormData]` emit declaration from `modules/ui/app/components/RecordForm.vue:67`. The form never emitted `submit`; real submission goes through `saved`/`delete` events. Also removed the orphaned `RecordFormData` interface (no remaining consumers). UI tests 114/114 still pass. |
| ui-geography-form-nullguard | `closed-with-commit-SHA` | 2026-05-19 | (Phase-2b-surfaced item #7, not in original 205) Phase 2c Task 13 (`1e49ca7`) added a template optional-chain null guard at `modules/ui/app/components/GeographyForm.vue:217`: `v-if="preview.validation.errors.length > 0"` → `v-if="(preview?.validation?.errors?.length ?? 0) > 0"`. Would have thrown on malformed validate-API response. UI tests 114/114 still pass. |
| docs-overclaim-architecture | `closed-with-commit-SHA` | 2026-05-19 | (Phase-2b-surfaced, not in original 205) Phase 2c Task 14 (`9aaa0c7`) deleted `docs/architecture-comprehensive-analysis.md` (1286 lines). Redundant with the canonical `docs/architecture.md` (1636 lines); the "comprehensive analysis" framing was itself a self-grading meta-document — parallel pattern to BB-HW-008's deleted engineering-analysis.md. Phase 2b had demoted the header; the body still self-graded "9.7/10" + "production-ready" 4×. Full delete cleaner than per-line revision. git log preserves it. |
| docs-overclaim-5 | `closed-with-commit-SHA` | 2026-05-19 | (Phase-2b-surfaced, not in original 205) Phase 2c Task 15 (`9aaa0c7`) cleared the remaining 5 PHASE 2C TODO docs: file-attachment-system.md + schema-validation-refinement-analysis.md + specs/storage.md + todo.md had overclaim phrasing demoted to honest v0.2.x language. specs/sort-api-spec-analysis.md moved to audits/ (analyses don't belong in specs/). PHASE 2C TODO block removed from `scripts/audit-truth-check-allowlist.txt`. `make audit-truth-check`: PASS. |
| ci-truth-check | `closed-with-commit-SHA` | 2026-05-19 | (Phase-2b-surfaced, not in original 205) Phase 2c Task 16 (`fee8dba`) created `.github/workflows/truth-check.yml`. Runs `make audit-truth-check` on every PR touching docs/ or the gate scripts, and on every push to main/dev. Phase 2b's manual gate is now a recurring CI check, closing the "manual only" caveat noted in the Phase 2b closure report. |
| phase-2c.5-followup-1 | `closed-with-commit-SHA` | 2026-05-19 | (Phase-2c-surfaced item #4, not in original 205) Phase 2c.5 Task 1 (`8dcc346`) deleted the orphan `SagaRecoveryError` class at `core/src/saga/errors.ts:147-166`. Phase 2c T3 deleted `saga-recovery.ts` but left the matching error class behind to keep parallel-subagent scope tight. Grep confirmed zero imports outside the declaring file. The `InternalError` import was also only used by this class — dropped both. Saga test suite (32 tests across 6 files) still passes. |
| phase-2c.5-followup-2 | `closed-with-commit-SHA` | 2026-05-19 | (Phase-2c-surfaced item #3, not in original 205) Phase 2c.5 Task 2 (`fa8513d`) removed the vestigial `secretsManager?` plumbing from `NotificationSecurity` + `NotificationService` + `civic-core-services.ts` + `EmailValidationService.initializeSecrets` relay. Phase 2c T7 (`2700e8d`) deleted `validateWebhookSignature` + `generateWebhookSignature` — the only consumers of `secretsManager` inside `NotificationSecurity`. The field, the `initializeSecrets` method, the constructor arg on NotificationService, and the corresponding DI call were all dead afterward. The Phase 2c T7 closure noted "cascades across 3 files outside Task 7's surface — flagged for a later hygiene pass"; this commit is that pass. Auth services that legitimately use `SecretsManager` for token signing are unaffected. 52 notification + email-validation tests pass; full repo build clean. |
| phase-2c.5-followup-3 | `closed-with-commit-SHA` | 2026-05-19 | (Phase-2c-surfaced item #1, not in original 205 — but finishes the `notifications-005` closure) Phase 2c.5 Task 3 (`8a6a558`) migrated the 4th ad-hoc EmailChannel impl at `modules/api/src/routes/notifications.ts:64-116` to the canonical `EmailChannel` from `@civicpress/core`. Phase 2c T6 (`7b783af`) consolidated 3 of the 4 ad-hoc impls the original `notifications-005` audit named; recon at plan time missed this 4th. The inline channel was wrapped in a thin `NotificationChannel`-shaped adapter so `NotificationService.registerChannel` + `sendNotification` keep working. The standalone `@sendgrid/mail` code path is dropped — the canonical EmailChannel uses nodemailer's `service: 'SendGrid'` shortcut, sufficient for this admin /test endpoint. **Now exactly ONE EmailChannel implementation in the codebase.** Canonical EmailChannel's 8 tests still pass; `modules/api` builds clean. |
| phase-2c.5-followup-4 | `closed-with-commit-SHA` | 2026-05-19 | (Phase-2c-surfaced item #2, not in original 205 — finishes the `core-001` follow-up footnote) Phase 2c.5 Task 4 (`3e0840a`) migrated the 2 remaining direct `db.logAuditEvent` callers in `core/auth` to the unified `AuditChannel` via the same `writeAudit`-helper pattern Phase 2c T9 introduced for `RecordManager`. `AuthService` and `EmailValidationService` now take optional `auditChannel?: AuditChannel` constructor args; DI wires it in `civic-core-services.ts`. 10 internal `logAuthEvent` callers (login_success, logout, password_change, etc.) inherit the new path for free; `completeEmailChange`'s audit at line 545 routes through the channel. Both classes keep their fall-back to direct `db.logAuditEvent` when no channel is injected (transitional safety, same as RecordManager). 2 new test files / 4 cases pin the wire. **Auth events now write file-JSONL first (resilient) + DB second (queryable)** — same contract record events get. Full repo: 1195 passed (+4) / 1 failed (the documented §9.1 flake) / 19 skipped. |

**pnpm audit before:** 140 advisories (4 Critical, 69 High, 49 Moderate, 18 Low).
**pnpm audit after Task 1:** 143 advisories (**0 Critical**, 73 High, 53 Moderate, 17 Low). High +4 is expected — newer cloud SDKs pulled additional transitive deps; addressed by deps-004 in Task 9.

### Phase 2b closures (2026-05-18)

All 9 Phase-2b-triaged findings are now closed (see Closed findings table above for SHAs):

- `legal-register-001`, `legal-register-006`, `notifications-007` → closed in Task 1 (`ae5df26`)
- `site-001`, `site-003` → closed in Task 4 (cross-repo SHA `e7ee413` on civicpress-site main)
- `BB-HW-008` → closed in Task 5 (cross-repo SHA `6c881db` on civicpress-broadcast-box main)
- `ui-005` → closed in Tasks 8 + 9 (`b58cd27`, `10997e3`)
- `cli-001` → closed in Tasks 10 + 11 (`5d9587d`, `08ed68a`)
- `site-002` → `wontfix-by-phase-strategy` (Phase 5)
- `broadcast-box-004` → `superseded-by-deletion` (file no longer exists)

### Phase 2c triage (2026-05-18)

Phase 2c (Foundation Cleanup) starts. Branch: `refactor/phase-2c-foundation-cleanup` off `dev`'s post-Phase-2b tip (`35846c2`). Master plan §5 Phase 2c scope + 8 surfaced-by-Phase-2b items + CI integration. Plan: `docs/plans/2026-05-18-base-refactor-phase-2c-foundation-cleanup.md`.

**13 findings marked `triaged-phase-2c`** (Foundation Cleanup in-scope, code commits expected):

- **Orphaned subsystems** (Task 3 + Task 4 + Task 5 + Task 6 + Task 7): `core-004`, `core-005`, `core-006`, `api-008`, `storage-003`, `storage-004`, `storage-009`, `notifications-005`, `notifications-006`, `notifications-013`
- **Exit-criteria items** (Task 8 + Task 9): `core-010` (notifications split), `core-001` + `core-013` (audit-trail unification)

**3 findings marked `triaged-phase-2c-for-recon-close`** (close in Task 2 by recon — no code commit):

- `realtime-007` — `generateParticipantColor` lives in `realtime-server.ts` which is NOT on `dev` (file is on the paused `broadcast-box` branch; Phase 3 reintroduces realtime). Will be marked `wontfix-pending-phase-3` in Task 2.
- `realtime-008` — same rationale; `useRealtimeEditor.ts` not on `dev`.
- `notifications-008` — recon 2026-05-18 confirmed `NotificationQueue` is actually wired (`notification-service.ts:23` instantiates it). Audit finding was stale. Will be marked `closed-by-recon-no-commit` in Task 2.

**2 findings deferred to later phases** (moved from `open` to `wontfix-pending-phase-X`):

- `broadcast-box-003` (`protocol-adapter.ts` dead) → `wontfix-pending-phase-4` per master plan §5 (defer to hardware-repo + reintroduction work).
- `broadcast-box-013` (`command-handlers.ts` orphaned) → `wontfix-pending-phase-5` per master plan §5 (whole broadcast-box module is paused).

**Follow-up notes (no triage row):**

- `cli-001` (already `closed-with-commit-SHA` from Phase 2b) — Phase 2c Task 10 will delete the 16 legacy `tests/cli/*.test.ts` placeholder files and the `runCivicCommand` stub at `tests/utils/cli-test-utils.ts:145-156`. Phase 2c Task 11 will wire `civic publish` CLI + fix the `status.ts` valid-status list inconsistency. These are post-closure cleanup, not a re-open.
- `api-004` already shows `closed-with-commit-SHA | 2026-05-17` (Phase 2a). No further action in Phase 2c; verified at registry-read time.

**Surfaced-by-Phase-2b items tracked in Phase 2c** (no existing finding ID; closure rows added during execution):

- `email-validation-regression` (Task 12) — expired-token rejection regression revealed by Phase 2b stale-artifact purge.
- `docs-overclaim-architecture` (Task 14) — `docs/architecture-comprehensive-analysis.md` (1286 lines) self-grade cleanup.
- `docs-overclaim-5` (Task 15) — remaining 5 docs allow-listed under `# ---- PHASE 2C TODO ----`.
- `ci-truth-check` (Task 16) — `.github/workflows/truth-check.yml` creation.
- `ui-record-form-emit`, `ui-geography-form-nullguard` (Task 13) — minor UI fixes.

### Phase 2c.5 closures (2026-05-19)

Phase 2c.5 (Foundation Cleanup follow-ups) was a 1-day sub-session that closed 4 of the 5 in-scope items from the Phase 2c closure report's §"Surfaced, not fixed". Branch: `refactor/phase-2c.5-followups` off `dev`'s post-Phase-2c-merge tip (`9e89a42`). Closure note: `docs/audits/phase-2c.5-closure-note.md`. Plan: `docs/plans/2026-05-19-base-refactor-phase-2c.5-followups.md`.

**4 surfaced-by-Phase-2c items tracked here as new rows in the Closed findings table** (no existing audit IDs; not in original 205):

- `phase-2c.5-followup-1` (T1, `8dcc346`) — orphan `SagaRecoveryError` class deletion.
- `phase-2c.5-followup-2` (T2, `fa8513d`) — vestigial `secretsManager?` plumbing removal in `NotificationSecurity` + `NotificationService` + DI chain.
- `phase-2c.5-followup-3` (T3, `8a6a558`) — 4th ad-hoc EmailChannel migration to canonical impl (finishes the `notifications-005` closure).
- `phase-2c.5-followup-4` (T4, `3e0840a`) — 2 direct `db.logAuditEvent` callers in core/auth routed through `AuditChannel` (finishes the `core-001` follow-up footnote).

**1 surfaced-by-Phase-2c item deferred to Phase 2d intake:**

- Pre-existing storage test breakage uncovered by Phase 2c T5's module-local `vitest.config.mjs`. Real scope: 28 failures across 10 test files (`batch-operations`, `streaming-operations`, `timeout-utils`, `circuit-breaker`, `health-checker`, `retry-manager`, `storage-errors`, `lifecycle-manager`, `orphaned-file-cleaner`, `usage-reporter`). Too big for a 1-day sub-session — rolling forward as a sibling task to storage-006/storage-007 inside Phase 2d.

### Phase 2d W0 surfaced findings (2026-05-19, all closed)

Phase 2d's W0 (Storage Test Triage + Rescue) is the first workstream of Phase 2d Structural Hardening. W0-T1 (analysis-only) triaged the 28 storage test failures deferred from Phase 2c.5. **9 underlying source-code defects** were identified as the root cause of 23 of the 28 failures (4 are stale tests; 1 is a fixture schema-drift). These are net-new findings; none existed in the original 205-finding audit (the storage reliability-primitives tests were dormant pre-Phase-2c-T5). All 9 closed by W0-T2.

Full triage + closure: `docs/audits/phase-2d-storage-test-triage.md`.

**9 closed findings:**

| ID | Status | Severity | Module | Description | Closing commit |
|---|---|---|---|---|---|
| `phase-2d-storage-bug-1` | `closed-with-commit-SHA` | **High** | storage | `validateFile` does not honor `'*'` wildcard in folder `allowed_types`; uses literal `.includes(extension)` so `['*'].includes('txt')` is `false`. Every folder configured with `['*']` rejects every file. Cleared 9 cascading batch test failures. | `34365c9` |
| `phase-2d-storage-bug-2` | `closed-with-commit-SHA` | **High** | storage | `batchUpload`/`batchDelete` threw `BatchOperationError` inside their own outer `try`; outer `catch` swallowed the throw and returned a partial-result response. "Throws on total failure" contract was broken on both methods. | `683573d` |
| `phase-2d-storage-bug-3` | `closed-with-commit-SHA` | **High** | storage | `evaluateLifecycle` iterated policies in array order and broke on first match; delete-priority depended on policy insertion order. `[archive, delete]` ordering archived files past both thresholds. | `6268c00` |
| `phase-2d-storage-bug-4` | `closed-with-commit-SHA` | **High** | storage | `isRetryable` lowercased the error message but checked UPPERCASE patterns (`ECONNRESET`, `ETIMEDOUT`, `ENOTFOUND`, `ECONNREFUSED`); these could never match. Common network errors were silently non-retryable. | `b2b751e` |
| `phase-2d-storage-bug-5` | `closed-with-commit-SHA` | **High** | storage | `withTimeout` checked `error.message.includes('timeout')` but the message produced was `"... timed out after Xms"` — 'timeout' substring absent. Every timeout became a generic `Error`, never `StorageTimeoutError`; retry/classification broke downstream. Refactored to throw `StorageTimeoutError` directly from `createTimeoutPromise`. | `4b8ca01` |
| `phase-2d-storage-bug-6` | `closed-with-commit-SHA` | **High** | storage | `StorageValidationError`/`StorageConfigurationError` extend core `ValidationError`, which wraps the 2nd constructor arg as `{ details: ... }`. Result: `error.context.field` was `undefined`; callers had to read `error.context.details.field`. Inconsistent with other storage errors which expose flat `context`. Subclasses now flatten `this.context` after super(). **Note:** wider implications for other modules consuming core's `ValidationError` not yet addressed — follow-up audit reasonable. | `aa5ffb9` |
| `phase-2d-storage-bug-7` | `closed-with-commit-SHA` | **Medium** | storage | `uploadStreamToLocal` listened to `'error'` only on writeStream; source-`Readable` errors became unhandled exceptions; upload promise never settled. Migrated to `node:stream/promises.pipeline()`. Also resolved the 2 unhandled stream exceptions in the test run. | `c284cbb` |
| `phase-2d-storage-bug-8` | `closed-with-commit-SHA` | **Medium** | storage | `downloadFileStream` returned `null` for non-existent files while `batchDelete` threw `STORAGE_FILE_NOT_FOUND` for the same condition. Inconsistent missing-file contract; now throws `StorageFileNotFoundError`. | `baec84e` |
| `phase-2d-storage-bug-9` | `closed-with-commit-SHA` | **Low** | storage | `stopHealthChecks` logged without a context object; `startHealthChecks` logged with `{providers, interval}`. Minor observability inconsistency; now logs with `{providers}`. | `e63b5f3` |

**Severity rollup:** 6 High + 2 Medium + 1 Low = 9 closed. All scoped to `modules/storage/`. None affected manifesto hard-constraints in the audit-severity sense, but most were Trust principle (reliability primitives that silently misbehaved). 7 of 9 fixes touched `cloud-uuid-storage-service.ts` (the W2-T18 god-file), pre-shrinking it slightly.

**Also closed (not bugs — W0-T2 mechanical work):**

- 4 stale-test rewrites in `944c73a`: `circuit-breaker.test.ts` (2 cases), `health-checker.test.ts` (1 case), `orphaned-file-cleaner.test.ts` (1 case). Plus a 5th latent stale test surfaced and fixed inline by `4b8ca01` (`timeout-utils.test.ts` "should throw StorageTimeoutError with correct timeout value" — operation delay was less than timeout, so the timeout never fired and `expect.fail` got caught).
- 1 schema-drift fixture in `7aac837`: `usage-reporter.test.ts` mock now uses `provider_path: 's3://...'` (the storage code derives provider from `provider_path` prefix, not from a `provider` field).

### Phase 2d W1 closures (2026-05-19, all closed)

Module contract + legal-register rename. 5 commits (W1-T1 through W1-T5).

| ID | Status | Closing commit | Notes |
|---|---|---|---|
| `legal-register-002` | `closed-with-commit-SHA` | `4e24f19` | Unhardcoded `moduleName === 'legal-register'` check from `record-schema-builder.ts`. Now manifest-driven via `capabilities.schemaExtensions`. |
| `legal-register-005` | `closed-with-commit-SHA` | `309b907` | Replaced all `process.cwd()`-based module discovery with `ModuleResolver`. |

**Artifacts:** `docs/specs/module-contract.md` (canonical contract, stable v1.0.0); `core/src/modules/module.schema.json` (Ajv-validated); `core/src/modules/{module-manifest.ts, module-resolver.ts}`; `modules/schema-extensions/legal/` (renamed from `modules/legal-register/`); rewritten `docs/module-integration-guide.md`; 13 characterization tests at `tests/core/modules/discovery-characterization.test.ts`. **Phase 3 entry criterion satisfied: "Module contract layer exists."**

### Phase 2d W2 closures (2026-05-19 to 2026-05-20, all closed)

God-file decomposition. 19 commits (W2-T1 through W2-T19). **18 named god-files + 3 surfaced extras decomposed.** Only `core/src/records/record-manager.ts` (933 LoC) remains above the 800 bar; documented in `docs/large-file-exemptions.md` with 3 sunset paths.

| ID | Status | Closing commit | File | Notes |
|---|---|---|---|---|
| `phase-2d-godfile-template-engine` | `closed-with-commit-SHA` | `0c1688a` | template-engine.ts | 1,154 → 92 LoC. 4 collaborators (types, loader, generator, record-validator). 26 characterization tests pin behavior. |
| `phase-2d-godfile-database-checker` | `closed-with-commit-SHA` | `af61dd8` | database-checker.ts | 985 → 505 LoC. 4 collaborators (result-builders, health-checks, schema-checks, auto-fixes). 5 characterization tests. |
| `phase-2d-godfile-sqlite-search` | `closed-with-commit-SHA` | `105a792` | sqlite-search-service.ts | 970 → 227 LoC. 4 collaborators (sql-builder, suggestions, facets, indexer). 8 characterization tests. |
| `phase-2d-godfile-database-adapter` | `closed-with-commit-SHA` | `9af3a7d` | database-adapter.ts | 923 → 326 LoC. 3 schema collaborators (tables, migrations, indexes-and-fts). |
| `phase-2d-godfile-database-service` | `closed-with-commit-SHA` | `ff2fd7d` | database-service.ts | 1,577 → 499 LoC. 4 stores (draft, record, user, storage-file). |
| `core-008` (master plan named) | `closed-with-commit-SHA` | `395eb5a` | record-manager.ts | 1,467 → 933 LoC (exempted with 3 sunset paths). 4 collaborators (helpers, sagas, search, file-ops). |
| `phase-2d-godfile-auth-service` | `closed-with-commit-SHA` | `2a412be` | auth-service.ts | 1,354 → 644 LoC. 6 collaborators (crypto, user-ops, api-key-ops, session-ops, oauth-ops, password-ops). |
| `phase-2d-godfile-records-service` | `closed-with-commit-SHA` | `2cb99b3` | records-service.ts | 1,760 → 229 LoC. 6 collaborators (helpers, crud, listing, drafts, frontmatter-and-publish, locks). 22 retroactive characterization tests added in W2-closure `d6c10c6` (pure helpers, locks collaborator, orchestrator public surface). |
| `api-013` (master plan named) | `closed-with-commit-SHA` | `80597e7` | routes/records.ts | 1,459 → 23 LoC factory. 5 handler files + handlers-common. |
| `phase-2d-godfile-routes-users` | `closed-with-commit-SHA` | `6b55843` | routes/users.ts | 1,443 → 39 LoC factory. 6 handler files. |
| `phase-2d-godfile-routes-diff` | `closed-with-commit-SHA` | `f658c1b` | routes/diff.ts | 965 → 8 LoC factory. 5 helper files. |
| `phase-2d-godfile-routes-uuid-storage` | `closed-with-commit-SHA` | `fcd6f01` | routes/uuid-storage.ts | 960 → 24 LoC entry. 4 handler files. |
| `ui-008` (master plan named) | `closed-with-commit-SHA` | `822ee66` | RecordForm.vue | 1,276 → 746 LoC. 2 composables (recordMarkdown, useRecordEditorActions). |
| `phase-2d-godfile-file-browser` | `closed-with-commit-SHA` | `63bc60b` | FileBrowser.vue | 1,156 → 320 LoC. 3 sub-components + useFileBrowser composable. 24 retroactive characterization tests added in W2-closure `d6c10c6` (icon/color/preview helpers, selection state machine, modal helpers; pins a pre-existing UI quirk where openxml `.xlsx` mime falls into the word-document icon branch). |
| `phase-2d-godfile-geography-form` | `closed-with-commit-SHA` | `62a0bc0` | GeographyForm.vue | 1,104 → 127 LoC. 3 sub-components + useGeographyForm composable. |
| `phase-2d-godfile-record-sidebar` | `closed-with-commit-SHA` | `c1a3acd` | RecordSidebar.vue | 935 → 301 LoC. 6 panel sub-components + useRecordSidebar composable. |
| `phase-2d-godfile-page-record-detail` | `closed-with-commit-SHA` | `b0b62c0` | records/[type]/[id]/index.vue | 935 → 171 LoC. 6 sub-components + useRecordDetail composable. |
| `phase-2d-godfile-cloud-uuid-storage` | `closed-with-commit-SHA` | `258fe80` | cloud-uuid-storage-service.ts | 2,711 → 539 LoC. 8 collaborators (internals, validation, provider-init, upload-ops, download-ops, file-mgmt-ops, batch-ops, streaming-ops). Largest god-file in the codebase. 37 retroactive characterization tests added in W2-closure `d6c10c6` (internals pure helpers, StorageValidation file + batch checks, orchestrator public surface). |
| `phase-2d-godfile-role-manager` | `closed-with-commit-SHA` | `f1c731c` | role-manager.ts | 832 → 586 LoC. Default config extracted. |
| `phase-2d-godfile-email-validation-service` | `closed-with-commit-SHA` | `f1c731c` | email-validation-service.ts | 832 → 751 LoC. registerEmailChannel extracted. |
| `phase-2d-godfile-backup-service` | `closed-with-commit-SHA` | `f1c731c` | backup-service.ts | 823 → 696 LoC. Storage-files export/restore pair extracted. |

**Severity rollup:** these are net-new finding IDs created during Phase 2d (god-file decomposition wasn't in the original 205-finding audit's per-row catalog — it lived under master plan §5's general "structural hardening" scope). Master plan §5 explicitly named only 3: `core-008`, `api-013`, `ui-008`. The other 18 IDs are surfaced by exit-criterion adherence ("no file >800 LoC in core/api/ui").

### Phase 2d W3 closures (2026-05-21 to 2026-05-24, all closed)

Type-safety elimination. 36 commits drove the cast count from **1,621 → 223 (86% cleared)**. All four production surfaces (core/src, modules/api/src, modules/ui/app, modules/storage/src) reached annotated-allowlist levels. Per-commit ledger in `docs/audits/phase-2d-type-cast-inventory.md` Progress log.

| ID | Status | Closing commit(s) | Action |
|---|---|---|---|
| `api-009` | `closed-with-commit-SHA` | `fe31a0b` + `8a12afe` + `ca5ea3a` + `0127e86` + `a709031` + `db5eca7` | 503 `as any` casts in `modules/api/src` driven to 0 in production code. Key landings: typed `Express.Request` global augmentation (`fe31a0b`, -248) which surfaced + fixed 88 latent null-safety bugs the `(req as any)` casts had hidden; new `HttpError` class + `catch (e: unknown)` sweep (`8a12afe`, -190); typed `ApiResponse<T>` envelope (`ca5ea3a`, -74); api-services sweep (`db5eca7`+`a709031`+`0127e86`, -158); records-service per-table Row typing. The 23-line nested type-laundering loop in `routes/records.ts:627-650` was decomposed by `80597e7` (api-013 god-file split into 5 handler files + handlers-common). |
| `ui-011` | `closed-with-commit-SHA` (partial) | `3e8f042` + `3a23731` + `59cd93b` + `8995238` + `382ed65` + `08bc8ad` + `9b381aa` | 208 explicit `: any` annotations driven from 397 starting (W3-T1 inventory found more than the audit estimated) → 68 left. 7-sweep W3-T5 effort spanning utils, composables, components, pages, plugin boundary. Remaining 68 are predominantly **documented `eslint-disable @typescript-eslint/no-explicit-any` blocks for Nuxt UI v-model bridges** (DetailsPanel, TemplatePanel, ConfigurationField) + dynamic-config bindings (configuration/edit's getNestedValue) + Leaflet GeoJSON callbacks. Each remaining case has a rationale comment. Driving to 0 would require upstream Nuxt UI generic improvements or a separate decomposition pass — not in scope for W3. `typescript.strict: true` setting is no longer defeated for the eliminated paths. |
| `storage-015` | `closed-with-commit-SHA` | `fc8d322` + `edd4164` | 80+ `as any` casts across `modules/storage/src/` driven to 0 in production. First W3-T6 commit (`fc8d322`, -71) closed the bulk: typed `StorageDatabaseService` interface (avoids circular import with @civicpress/core); typed lazy-init fields on `CloudUuidStorageService`; provider + credential typing in `provider-init.ts` (14 → 0); credential-manager rewritten with `Record<string, string \| undefined>` intermediate for snake_case↔camelCase translation. Second W3-T6 commit (`edd4164`, -11) cleared the long tail (lifecycle-manager, cloud-uuid-storage/streaming-ops + download-ops + internals, cleanup/orphaned-file-cleaner, retry/retry-manager, reporting/storage-usage-reporter). **Surfaced + fixed 3 latent bugs:** (1) `dbRecordToStorageFile` constructing `new Date(undefined)` → Invalid Date; (2) cache `.set(key, val, ms)` passing a number where `CacheSetOptions = { ttl?, tags? }` is expected (TTL silently dropped at runtime); (3) `GlobalStorageSettings` missing 4 retry knobs `RetryManager` actually reads. The 67 storage casts that remain are all in `__tests__/*` (mock-typing for `StorageDatabaseService`/`StorageProvider`), to be handled by the planned `**/*.test.ts` ESLint warn override. |
| `storage-006` | `closed-with-commit-SHA` | `8012375` | Cloud SDKs (`@aws-sdk/client-s3`, `@azure/storage-blob`, `@google-cloud/storage`) moved from `dependencies` to `optionalDependencies` in `modules/storage/package.json`. Local-only municipalities no longer install ~tens of MB of unused SDK on `pnpm install --no-optional`. New `modules/storage/src/cloud-uuid-storage/sdk-loader.ts` memoises a lazy `import()` per SDK and throws `OptionalDependencyMissing` (added to `core/src/errors/index.ts`) with a clear `pnpm add ...` remediation if absent. All 7 SDK consumer sites converted to lazy loads; type-only imports kept for typing (erased at runtime). 216/216 storage tests + full repo build green. |
| `deps-008` | `closed-with-commit-SHA` | `8012375` | Companion finding to `storage-006`; same fix (W4-T1). Cloud SDKs are now optional, not direct deps. |
| `api-007` | `closed-with-commit-SHA` | `881f95d` | Every workspace's `package.json` now declares every package it imports. Per-workspace additions surfaced by the new `scripts/audit-package-imports.mjs` + a strict-hoist build (`pnpm install --shamefully-hoist=false`): `modules/api/` gained `gray-matter`, `simple-git` (deps) + `@types/express-serve-static-core`, `@types/node` (devDeps). The original audit named `simple-git`, `gray-matter`, `nodemailer`, `@sendgrid/mail` as undeclared; `nodemailer` and `@sendgrid/mail` were already pulled in via `@civicpress/core` (workspace dep) — the audit conflated transitive resolution with undeclared imports. `pnpm run audit:imports` is the recurring local check. |
| `deps-010` | `closed-with-commit-SHA` | `881f95d` | Companion finding to `api-007`; same fix (W4-T2). `.npmrc` flipped from `shamefully-hoist=true` to `shamefully-hoist=false` so undeclared imports fail fast at install time on every contributor's machine. No CI gate added — the project does not adopt deployment CI/CD ([[no-cicd-policy]]); the local default is the enforcement surface. |
| `deps-011` | `closed-with-commit-SHA` | `4c58033` | `docs/licenses.md` generated: 1,460 unique packages across 22 SPDX ids. Built from `pnpm licenses ls --json` via the new `scripts/generate-licenses-md.mjs`, wired up as `pnpm run licenses:gen`. Output: top summary (count per license) + per-license alphabetized tables (name, version(s), homepage). License-mix highlights — MIT 1205, Apache-2.0 103, ISC 66, BSD-3-Clause 26, BSD-2-Clause 22, BlueOak-1.0.0 13. Four "Unknown" packages are upstream metadata gaps. No copyleft surprises in the dep tree. Contributors regenerate on dependency changes (no CI step per [[no-cicd-policy]]). |
| `ui-002` | `closed-with-commit-SHA` | `ec5a9a0` | Migrated `modules/ui` from paid `@nuxt/ui-pro ^3.3.7` (v3) + free `@nuxt/ui ^3.3.7` (v3) to the single MIT-licensed `@nuxt/ui ^4.8.0`. v4 dropped the separate `@nuxt/ui-pro` package — Pro components are now in the free `@nuxt/ui`. Vendor lock-in cleared: `theme.env: NUXT_UI_PRO_LICENSE` hook removed in v4; tarball + repo greps verify zero hits. Migration commits (5 total on `refactor/ui-002-nuxt-ui-v4-migration`, branched off `dev` post-Phase-2d): `3ce9962` T0 inventory, `12db2ee` reconciliation, `231c8b5` T1 atomic package swap, `d40bebf` T1.5 scaffold-fix (vue-tsc 2.2.12 → 3.3.2 + surfaced that v4 is near-drop-in), `cd725d5` T8 dropped useHead workaround at nuxt.config.ts:15-20, `ec5a9a0` T2-T7+T9+T10 verified no-op closure log. Gates at close: `pnpm test:ui:run` 138/138, `pnpm -r build` clean across 6 workspaces, `pnpm run audit:imports` ✓ clean, `make audit-truth-check` PASS, `pnpm -C modules/storage test:run` 216/216. Migration surfaced a Phase 2d W4-T2 audit-coverage gap (root workspace not scanned by `audit-package-imports.mjs`) — fixed on a sibling branch `refactor/w4-t2-followup-root-audit` (`a92b842`) and merged to `dev` (`7f08521`) before T0 could complete. **No remote push per `refactor-push-policy`.** Original concern that this would be a multi-day migration with substantial component rewrites did not materialise — v4 was a near-drop-in for our usage; the only real source change was the useHead workaround removal. Audit log of per-family verification: `docs/notes/ui-002-v4-breaking-change-inventory.md`. |
| `deps-009` | `closed-with-commit-SHA` | `ec5a9a0` | Companion finding to `ui-002`. `@nuxt/ui-pro` (the only paid-commercial-license dep in the monorepo) is gone; v4 unifies Pro into the free MIT `@nuxt/ui`. `theme.env: "NUXT_UI_PRO_LICENSE"` hook also gone. License-mix in `docs/licenses.md` regenerated; no commercial / proprietary rows remain. |

**Severity rollup:** 3 of the original 205 findings (api-009/ui-011/storage-015) closed with elimination + annotated allowlist. `realtime-012` (46 occurrences of `: any` in `realtime-server.ts`) stays `wontfix-pending-phase-3` since the realtime module is out of scope until Phase 3 reintroduction.

**Architectural deliverables landed in W3:** typed `Express.Request` augmentation (eliminates 248 ad-hoc `(req as any)` accesses repo-wide); `HttpError` class replacing the `(error as any).statusCode = N; throw error` mutation idiom across `modules/api/src`; typed `ApiResponse<T>` envelope shared between api + ui; per-table Row types (`RecordRow`, `DraftRow`, `UserRow`, etc.) for SQLite query results; `DatabaseAdapter.getConfig()` method (eliminates 5 `(adapter as any).config` sites in diagnostics); typed `Saga<X, Y>` end-to-end with explicit generics at `executor.execute<>` callsites; `IndexingService | null` propagated through 3 saga constructors with null-safe `QueueIndexingStep` paths; structural `StorageDatabaseService` + cache strategy types in `modules/storage`.

**Latent bugs surfaced + fixed during W3:** 6 total, all hidden by the `any` typing they replaced. Storage: 3 (Invalid Date, dropped TTL, missing retry config). Diagnostics: 1 (FixResult.error contract violation). Records/sagas: 1 (saga null-deref on missing indexingService). Indexing: 1 (AuthUser.id string-vs-number in sync sentinel user).

**Test stability:** 357/357 core tests + 17/17 indexing integration tests + 216/216 storage tests + 270/270 api tests + 138/138 ui tests all green throughout. The only test-suite failure remaining is the pre-existing `tests/core/database-integration.test.ts > Session Management > should create and manage sessions` — confirmed as a date-bomb (hardcoded `new Date('2025-12-31')`; today is past that), not regression.

**Deferred from W3 closure:** lint-rule enforcement (`@typescript-eslint/no-explicit-any: error` per workspace) and CI gate are deferred to a dedicated lint-hygiene session. Reason: core lint has ~314 pre-existing errors (no-unused-vars, no-undef from missing `console` globals, etc.); modules/api has 21; storage's `eslint.config.cjs` is missing entirely. Fixing the baseline is ~4-6 h of unrelated cleanup that doesn't belong in W3. Additionally, no `.github/workflows/` directory exists in this repo — so a CI gate would need to introduce CI from scratch. Both are valuable but should be a separate "lint enforcement + CI" sub-phase before W3 → W4 transition.

**Characterization-test coverage:** plan §W2 method primer step 3 required one characterization test per god-file as a decomposition regression guard. T1/T2/T3 followed the spec in-flight (26 + 5 + 8 tests). T4-T19 relied on existing test coverage at decomposition time (1247 baseline passing throughout). The W2 formal-closure commit `d6c10c6` added retroactive characterization tests for the three zero-coverage gaps (T8 records-service: 22 tests; T14 FileBrowser: 24 tests; T18 cloud-uuid-storage: 37 tests). Deviation for T4-T7, T9-T13, T15-T17 documented in the W2 closure section of the plan; rationale: existing tests gave green signal at each step and retroactive char-tests for already-covered files would be makework. Total characterization-test suite: 6 files / 122 tests, all green.

**Truth meter cumulative (end of Phase 2d W0+W1+W2, post-formal-closure):** 53 original-audit findings closed (51 pre-2d baseline + `legal-register-002` + `legal-register-005`); plus 6 Phase-2b-surfaced + 4 Phase-2c.5-surfaced + 9 Phase-2d-W0-surfaced + 21 Phase-2d-W2-decomp closures = **93 total measurable progress items** (53 from original 205 + 40 surfaced).

**Truth meter cumulative (end of Phase 2d W3, post-type-safety-elimination):** 56 original-audit findings closed (53 prior + `api-009` + `ui-011` + `storage-015`); plus 6 Phase-2b-surfaced + 4 Phase-2c.5-surfaced + 9 Phase-2d-W0-surfaced + 21 Phase-2d-W2-decomp + 6 Phase-2d-W3-surfaced-latent-bugs = **102 total measurable progress items** (56 from original 205 + 46 surfaced). 27% of the original audit closed.

**Truth meter cumulative (end of Phase 2d W4 + closure, 2026-05-24):** 64 original-audit findings closed (56 prior + W4 `storage-006` + `deps-008` + `api-007` + `deps-010` + `deps-011`; pre-2d 51 + 2d-W1 2 + 2d-W2 3 + 2d-W3 3 + 2d-W4 5 = 64); plus 46 surfaced (unchanged this slice) = **110 total measurable progress items** (64 from original 205 + 46 surfaced). **31% of the original audit closed.** Phase 2d closed. See `docs/audits/phase-2d-closure-report.md` for the full workstream readout.

**Truth meter cumulative (end of Phase 2d-followup `ui-002` v3→v4 migration, 2026-05-28):** 66 original-audit findings closed (64 prior + `ui-002` + `deps-009`); plus 46 surfaced (unchanged this slice) + 1 surfaced this slice (Phase-2d-W4-T2 root-audit gap, fix `a92b842`) = **113 total measurable progress items** (66 from original 205 + 47 surfaced). **32% of the original audit closed.** Migration landed on `refactor/ui-002-nuxt-ui-v4-migration` (local-only per `refactor-push-policy`); see ui-002's closed-row above for the per-commit ledger. Notable: T0 inventory predicted a multi-day migration with component-family API breaks; reality was a near-drop-in upgrade — only one real source change (drop useHead workaround in `nuxt.config.ts:15-20`).

### Deferrals (Phase 2a Task 10 — closed 2026-05-17)

These Criticals are explicitly deferred by the refactor sequencing. None are forgotten — each will be reopened in its target phase.

| ID | Status | Target phase | Rationale |
|---|---|---|---|
| broadcast-box-002 | `wontfix-pending-phase-5` | Phase 5 (broadcast-box reintroduction) | Recording pipeline civic-artifact gap. Broadcast-box module is paused (master plan §2.3); the AI-port-driven civic-artifact derivation service that closes this finding will be designed + built when broadcast-box reintroduces through the clean module contract in Phase 5. See `broadcast-box-ai-port` memory for the implementation path. |
| broadcast-box-007 | `wontfix-pending-phase-5` | Phase 5 | Rate limiter env gate. Lives inside the paused broadcast-box module; will be addressed during reintroduction with proper environment gating (positive opt-in like `CIVIC_DEV_DISABLE_RATELIMIT=true` rather than negative `NODE_ENV !== 'production'`). |
| BB-HW-001 | `wontfix-pending-phase-4` | Phase 4 (hardware audit + fix) | Hardware protocol doc lies. Phase 4 owns the canonical shared protocol-spec artifact (JSON Schema or `.proto`) consumed by both repos; this finding closes when that artifact exists and both sides are bound to it. |
| BB-HW-003 | `wontfix-pending-phase-4` | Phase 4 | Hardware civic-artifact gap (0 json sidecars). Partner to broadcast-box-002 from the hardware side. Closes when the AI-port pipeline produces transcripts + audio + Markdown civic artifacts. |
| ~~ui-002~~ | `closed-with-commit-SHA: ec5a9a0` (2026-05-28) | ~~Dedicated Phase-2d-followup session~~ — landed | Promoted to closed; see the closed-row above for the migration ledger. Row preserved (struck-through) to keep deferral history honest. |

### Phase 4 quick-wins pass (2026-06-18)

A small, low-risk pass over the cheap/pilot-unblocking `BB-HW-*` items before
the heavy Phase 4 work (protocol artifact + AI-port pipeline). **Each candidate
was re-verified against the *current* hardware-repo code, not the May audit
snapshot — several had drifted.** Outcome:

- **BB-HW-011** → `closed-with-commit-SHA` (`afda81d`). AP-mode timeout re-enabled. (See closed-row above.)
- **BB-HW-012** → `closed-by-recon-no-commit`. Encryption now implemented; the doc claim is true. (See closed-row above.)
- **BB-HW-002, BB-HW-008** → already `closed-with-commit-SHA` (Phase 2b: `f63edaf`, `6c881db`).
- **BB-HW-010** (token in `?token=` query param) → **assessed, deferred — not a quick win** (at the time). The token is baked into the endpoint URL in two places (`main.py` + the re-enrollment path) and re-extracted into the `Authorization` header at connect time; dropping the URL form cleanly is a multi-site auth-flow refactor and is risky without a runnable test suite (hardware-repo deps not installed in the dev VM). **→ Resolved 2026-06-22 (`7e5978f`)** once W0 made the suite runnable: rather than a two-site refactor, `connect()` (the shared chokepoint) strips the token from the wire URL and keeps it in the headers. See the BB-HW-010 closed-row above.
- **BB-HW-015** (version/status claims disagree across `pyproject.toml` 0.1.0 / CHANGELOG `[0.1.0] - TBD` / `agent/goals.md` "core implementation complete") → `closed-with-commit-SHA` (`6b45fc9`). Maintainer chose the "alpha, not pilot-ready" framing; all four sources (incl. README `## Status`) now agree. (See closed-row above.)
- **BB-HW-016** (drift-prone `agent/manifesto-slim.md`) → **deferred to the Phase 4 doc pass.** It is referenced by `.cursor/rules.md` and there is no in-repo canonical `manifesto.md` to point a removal at (canonical lives in the monorepo), so neither "remove" nor "generate" is a clean one-liner. Low severity.

**Note for future Phase 4 sessions:** the hardware repo received commits after the
2026-05 audit (enrollment flow, credential encryption, …), so `BB-HW-*` findings
must be re-verified against current code before action — BB-HW-012 was already
fixed; others may be too.

### Phase 4 W0 — unblock + green (2026-06-18)

The first real Phase 4 workstream. Goal: make the hardware repo build/run/test
from a clean, non-macOS checkout, and make the appliance visible in the
published base docs — the foundation the heavier workstreams (protocol artifact,
civic-artifact pipeline, installer) sit on. Plan:
`docs/plans/2026-06-18-base-refactor-phase-4-broadcast-box-hw.md`.

Scoping proved the repo **is runnable on the dev VM** (ARM/aarch64, Python 3.12)
— the committed `.venv` was a dead macOS venv that hid this. Four issues blocked
a clean build; all fixed in hardware-repo commit `23b87c9`:

- **N1 `bb-hw-pyproject-dep-drift`** → `pyproject` was missing 4 deps the code
  imports (fastapi/uvicorn/av/aiortc); a clean `pip install -e .` built a broken
  app. (See closed-row above.)
- **N2 `bb-hw-opencv-headless`** → `opencv-python` → `-headless` for the headless
  appliance. (See closed-row above.)
- **N3 `bb-hw-v4l2-encoder-test`** → encoder-detection test rejected the Pi's own
  `V4L2_M2M` encoder; green on a Mac, red on the actual Pi. (See closed-row above.)
- **N4 `bb-hw-gitignore-venvs`** → gitignore hardening + on-disk cruft removal.
  (See closed-row above.)

**Result:** a clean `pip install -e ".[dev]"` (+ the system `ffmpeg` binary —
a documented non-pip dependency) yields **283 passed / 7 skipped / 0 failed**
(~2.5 min). Also closed **BB-HW-007** (appliance now in `roadmap.md` +
`project-status.md`).

**Unblocks BB-HW-010:** its deferral above cited "no runnable test suite
(hardware-repo deps not installed in the dev VM)" as the risk. W0 removed that
blocker — the suite now runs, so the query-param-token auth-flow refactor became
testable. **Done 2026-06-22 (`7e5978f`)** — header-only auth on the wire, with a
test that drives the real `connect()`; see the BB-HW-010 closed-row.

**Reproducible dev-env recipe** captured in the `broadcast-box-hw-dev-env`
memory (and now wired into `make dev-setup`).

**Also surfaced (base repo, N5 `truth-check-makefile-allowlist`):** committing
these W0 docs exposed that the `audit-truth-check` gate was failing whole-repo on
its own `Makefile` help text — latent since the gate was added, unseen because
the refactor never pushed to GitHub CI. Fixed by allow-listing `Makefile`
(same rationale as the already-listed script/allow-list/workflow). The gate now
passes whole-repo. (See closed-row above.)
