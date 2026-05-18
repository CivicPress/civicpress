# Phase 1 Summary — Per-Module Audit Reports

This file aggregates the ~200-word top-findings paragraph each parallel subagent returned at the end of Phase 1. Use it as an index before reading the full sections. Order matches the per-target order in the audit plan.

The deeper Phase 2 synthesis (architecture review across modules, roadmap reality-check, consolidated fix list, executive summary) is intentionally deferred to a follow-up session whose plan will be drafted with these summaries plus the full sections as input.

---

## 1. core ([full section](core.md))

- **High (core-001):** Two parallel, uncoordinated audit systems (file JSONL `AuditLogger` + DB `audit_logs`). `RecordManager.updateRecord` writes DB audit without `userId`; sagas write neither — audit trail is bolted onto API/CLI, not core, threatening manifesto Transparency/Trust and v0.4.x audit-UI milestone.
- **High (core-002):** `WorkflowEngine.approval/publication/archivalWorkflow` are TODO log-only stubs registered as functional; `HookSystem.logHook` and workflow integration also TODOs — directly contradicts "100% Functional" project-status claim.
- **Medium (core-003):** Hand-rolled DI container (~600 LoC, 7 files, 7 dedicated tests) for an 11-service manually-wired registration; `DependencyResolver.extractDependencies()` is a TODO returning `[]`. Classic AI-shape over-engineering for v0.2 alpha.
- **Medium (core-004):** `SagaRecovery.recoverFailedSagas()` is a placeholder ("Actual compensation would need saga instance"); stuck sagas after crashes are marked failed but no compensation runs — Trust gap if a process crashes mid-civic-operation.
- **Medium (core-005/006):** `SagaMetricsCollector`, `CacheWarmer`, and the `'hybrid'` cache strategy are exported/typed but never instantiated or implemented in production — dead-on-arrival surface area, fake comprehensiveness.

(14 findings total in full section.)

---

## 2. cli ([full section](cli.md))

- **High (cli-001) — Test theatre:** 15 of 27 `tests/cli/*.test.ts` files are placeholders asserting the literal string `"CLI testing disabled in this environment"` because `tests/utils/cli-test-utils.ts:145–156` returns a hardcoded mock instead of spawning the CLI; the "120+ CLI tests at 95% coverage" claim in `project-status.md` is significantly inflated (Trust principle).
- **High (cli-005) — CLI is English-only + emoji-heavy:** while the web UI ships full EN/FR i18n, the CLI has no i18n, no `--no-emoji`, and 16 commands emit emoji output (init.ts alone has 43 emoji log lines), failing a Quebec/Richmond clerk on her own demo town and degrading on older Windows shells (Ease of Use, Equity).
- **High (cli-004) — Two parallel auth UX trees:** `civic login` has `--logout` and `--status` as hidden flags while six `auth:*` commands exist in parallel, with `auth:me` aliased to `me`; no clerk-friendly single auth flow exists (Ease of Use).
- **High (cli-003) — Hardcoded type/status whitelists** in `create.ts:77–86` and `status.ts:52–59` silently override the project's flagship "config-driven record types/statuses" feature.
- **High (cli-006) — `cleanup --force`** wipes `data/`, `.system-data/civic.db`, `modules/api/data` from a `process.cwd()`-derived root with no confirmation; the non-force confirmation is the literal string `"civicpress"` for every install. A single misdirected invocation can erase a town's records, threatening the resilient-archival hard constraint.

---

## 3. api ([full section](api.md))

1. **api-001 (Critical)** — `routes/info.ts:29-45` creates a full new `CivicPress` instance per request (initialize + shutdown) just to validate a token, despite `req.civicPress` already being available. A trivial DoS amplifier on a public endpoint.
2. **api-002 (Critical)** — `routes/validation.ts` mounted with no upstream auth middleware, yet every route inside uses `requirePermission(...)`. Either always 401s in production, or tests provide false coverage.
3. **api-003 (Critical)** — `routes/status.ts` mounted without `civicPress` injection, so every status endpoint throws 500 outside of test fixtures.
4. **api-004 (Critical)** — `workflows.ts`, `hooks.ts`, `export.ts`, `import.ts` are stub routers returning hard-coded fake `200 OK` payloads while looking live to callers, inflating the "25+ endpoints" claim and conflicting with the manifesto's Transparency principle.
5. **api-005 (High)** — `express-rate-limit`, `helmet`, `compression` declared in `package.json` but never imported; the README advertises rate limiting that doesn't exist.

Also notable: 503 `as any` casts, dead duplicate `middleware/jwt-auth.ts` (228 LoC), per-request `TemplateService` allocations with file watchers, undeclared deps (`simple-git`, `gray-matter`, `nodemailer`, `@sendgrid/mail`) that resolve only via pnpm hoisting, stale OpenAPI spec, no API-side i18n. 16 findings total.

---

## 4. ui ([full section](ui.md))

The UI module's two manifesto-hard-constraint failures are **vendor lock-in via `@nuxt/ui-pro` ^3.3.7** (a license-gated commercial dependency whose `theme.env: "NUXT_UI_PRO_LICENSE"` hook is still live in v3 — every page renders through its `UDashboard*` chrome, making removal a UI rewrite), and **broken resilient archival** (SPA-only mode with `ssr: false`, no service worker, no offline cache, no `<noscript>` fallback — records aren't crawlable and the app is unusable when the API is unreachable). A third Critical is **unsanitized markdown → `v-html` XSS** on the public record-detail page (`marked.parse()` with no DOMPurify, output via `v-html`), combined with JWT and CSRF tokens stored in `localStorage` — a malicious record body can steal auth tokens from every citizen who reads it. High-severity: `app.vue` injects arbitrary HTML+scripts from `/api/v1/info` with no allow-list; the "UI 80+ tests, 85% coverage" claim is false (1 test file, 32 cases on one utility, 0 component coverage); i18n claimed "Complete" but Setup/Configuration admin pages are entirely hardcoded English; 1,310-line `RecordForm.vue` and similar god-components are untested and high-regression-risk.

---

## 5. realtime ([full section](realtime.md))

Audited the realtime module (Yjs WebSocket server) via `git show broadcast-box:modules/realtime/**` since the source is absent on the audit branch (only `dist/` remains). 14 findings. Top findings by severity:

- **(realtime-001, High, security/Trust):** `checkConnectionLimits()` is called with `userId=null` before authentication (`realtime-server.ts:472`), so the `connections_per_user` limit is unreachable — and `userConnections` is never cleaned up on disconnect, so even fixing the call site would over-count.
- **(realtime-002, High, security/Trust):** Per-IP `connectionCounts` is decremented only in the new handler-registry path; the legacy user/device disconnect paths carry an explicit `// TODO: Track IP and user for cleanup` (line 2891) — long-running servers will exhaust the IP limit and reject legitimate users.
- **(realtime-003, High, Markdown/Archival):** Collaborative edits never write back to the record's Markdown file — `useAutosave` in collab mode only triggers Yjs binary snapshots, so the canonical Git-tracked Markdown stays pre-edit until someone manually clicks Save.
- **(realtime-004, High, architecture):** `realtime-server.ts` is 3,581 lines, with ~1,500 lines of broadcast-box device legacy code coexisting with the new handler-registry path (which was supposed to replace it in commit `e014f40`).
- **(realtime-005, Medium, archival):** Yjs snapshots stored as opaque, unsigned, unbounded BLOBs with no Markdown reconstruction — a y-protocols major-version bump could orphan civic archives.

Confirmed `generateParticipantColor` (line 95) is dead code as flagged in CLAUDE.md.

---

## 6. broadcast-box (FLAGSHIP, deep) ([full section](broadcast-box.md))

**The implementation approach is roughly right but the seams are wrong — recommend an architectural refactor, not cleanup.** 22 findings in full section.

1. **broadcast-box-002 (Critical, manifesto):** Recording pipeline produces only media blobs — no Markdown civic artifacts (attendees, chapter markers, motion timestamps, transcripts). The session record schema supports these fields; nothing populates them. This is the biggest manifesto-§3.3 gap and the central reason the flagship doesn't yet read as a civic-record module.
2. **broadcast-box-010 (High, arch):** Command/ACK contract has three accepted on-the-wire formats; hardware-side and server-side docs describe different defaults; the canonical translator `protocol-adapter.ts` (172 lines) exists but is imported nowhere — production uses hand-rolled inline normalizers. This concretizes the user's "contract not always clear" complaint.
3. **broadcast-box-007 (Critical, security):** Rate limiter short-circuits when `NODE_ENV !== 'production'`; combined with the WIP `findByCode()` bcrypt-loop over 24h of unused codes, unauthenticated registration is a DoS vector in any dev/staging/demo environment.
4. **broadcast-box-005 (High, manifesto):** Live-event setup demands engineer-grade input (raw RTMP URL + stream key, hand-create the YouTube live event first) — confirms the user's "setting up the live event server was not optimal" pain. No clerk-grade abstraction.
5. **broadcast-box-012 (Medium, arch):** Realtime server has four broadcast-box-specific setter methods PLUS a `registerRoomTypeHandler` — dual-pattern wiring with `@civicpress/realtime` now knowing about device auth/commands/connections. Module boundary collapsed. This is the strongest signal that the complexity is unplanned-scope growth, not bad code.

Also flagged: prior Jan-2025 audit's missing tests (rate-limiter, device-command-service, enrollment-cleanup, enrollment-code-model) still absent ~4 months later; `api.devices.test.ts` is fake (asserts `toBeDefined`/`toBeInstanceOf(Function)` only); console.log debug banners + raw-body and stream-key leaks in production paths; roadmap/project-status/manifesto don't mention broadcast-box.

---

## 7. storage ([full section](storage.md))

16 findings. Top:

1. **CRITICAL (storage-001):** `QuotaManager.checkQuota()` is fully implemented and unit-tested but **never called from any upload path** — grep confirms zero call sites across the entire repo. Storage quotas in config are not enforced; a single account can fill the disk silently. Trust-principle fail.
2. **CRITICAL (storage-002):** `GET /folders/:folder/files` requires `storage:download` permission even for folders configured as `access: 'public'`. Citizens cannot enumerate public files without an account — direct contradiction of the README, default config, and the manifesto's "Public by Default" principle. Two sibling routes implement the public-folder bypass correctly; this one doesn't.
3. **HIGH (storage-003):** `LifecycleManager.archiveFile()` "archives" only by changing the DB `folder` column; the file is never moved. Every archive creates an orphan, which the (separately maintained) `OrphanedFileCleaner` is then needed to clean up — two large components undoing each other's work, classic AI-coded fake-comprehensiveness.
4. **HIGH (storage-007):** If the SQLite metadata DB is lost or corrupted, files on disk under UUID names are unreachable — no filename-to-record mapping exists outside the DB. Violates the manifesto's "Resilient archival" hard constraint for the "town hall with a USB key" scenario. No sidecar / recovery path is documented.
5. **HIGH (storage-005):** Filename `originalname` is stored verbatim and echoed into `Content-Disposition` headers without sanitization; the two parallel filename generators apply different sanitization. Header-injection and display risks; needs the dedicated security session.

---

## 8. legal-register ([full section](legal-register.md))

The legal-register "module" is a single 210-line JSON Schema file plus a stub `package.json` and README — no TypeScript, no tests, no compiled code. 7 findings selected.

- **legal-register-001 (High):** `docs/architecture.md:135` and `docs/specs/legal-register.md` (marked `status: stable, version: 1.0.0`) both describe a sweeping module with components, hooks, workflows, CLI commands, and tests that do not exist — eroding documentation Trust.
- **legal-register-002 (High):** `core/src/records/record-schema-builder.ts:219–236` hardcodes the string `'legal-register'` to scope which record types the module applies to, meaning any new module requires a core-side code change — breaking the manifesto's "WordPress for governance" modularity promise.
- **legal-register-003 (Medium):** Every legal field in the extension (`document_number`, `legal_authority`, `jurisdiction`, `approval_chain`, etc.) is already declared in `core/src/schemas/record-base-schema.json:342–605`; the extension is largely duplicative, with only a `document_number` regex as additive enforcement.
- **legal-register-005 (Medium):** Module schemas are loaded via `process.cwd() + 'modules/'` — coupling discovery to CWD and the monorepo folder layout, blocking real npm-installed modules.
- **legal-register-004 (Medium):** Zero in-module tests; the schema's validation behavior is never directly exercised.

The schema-composition pattern itself is sound and demonstrates ~5% of the modular vision; the remaining 95% (UI, CLI, workflows, hooks) is unimplemented.

---

## 9. notifications ([full section](notifications.md))

The notifications module is in much worse shape than the pre-seeded README finding suggested. Three **Critical** findings undermine the platform's Trust and Transparency principles:

1. The notification audit log at `.system-data/notification-audit.jsonl` is structurally dishonest — 5,156 entries, ZERO marked failed, 4,588 (89%) recording "successful notification" with empty `channels` arrays, because `notification-service.ts:158` hardcodes `success: true` regardless of actual delivery.
2. Security validation and rate-limiting gates are inert — `NotificationService.sendNotification()` awaits both `validateRequest()` and `checkRateLimit()` but never inspects the returned `{valid, errors}` / `{allowed}` objects, so invalid and rate-limited requests proceed silently.
3. PII sanitization is misdesigned — it redacts the *template variable bag* before rendering, so a user's email used as a template variable becomes `[REDACTED]` in the sent message.

The pre-seeded README gap is confirmed and elevated: `modules/notifications/` has no README, no package.json, contains exactly one file, that file has a `nodemailer.createTransporter` (non-existent method) bug, and **production code completely bypasses it** — four separate ad-hoc inline `EmailChannel` reimplementations exist in CLI, API route, auth-service, and the dead module file. Also flagged: SMS/Slack are advertised but unimplemented, `NotificationQueue` is instantiated but never called, the spec is declared "stable v1.0.0" while the implementation is far from it.

---

## 10. civicpress-broadcast-box (hardware) ([full section](civicpress-broadcast-box-hardware.md))

17 findings; 3 Critical, 6 High, 6 Medium, 2 Low. The flagship's hardware side has three Critical manifesto failures:

1. **Contract mismatch [BB-HW-001]:** the hardware's own `docs/civicpress-integration-protocol.md` documents commands with `action` nested in `payload`, but the actual implementation at `services/connector/websocket_client.py:506-515` parses `action` from the message top level — matching what the TypeScript server in WIP commit `47d0ff6:modules/broadcast-box/src/websocket/protocol.ts` actually sends. The doc lies; the code carries three defensive shape-coercion branches to accept whatever malformed forms the server might send. There is no shared protocol-spec artifact between repos.
2. **No license [BB-HW-002]:** README declares "TBD, but will be OSI-approved" — a municipality cannot legally deploy or redistribute the flagship's hardware as-is.
3. **No Markdown civic artifact [BB-HW-003]:** recordings output `.mp4` only; `storage/manual/` empirically contains 69 `.mp4` files and 0 `.json` sidecars, meaning even the partial metadata code path isn't running. The "public meetings → public records" mission has no implemented path from media blob to civic record.

Add: project is **invisible to `docs/roadmap.md`** and a self-graded "95% production-ready / Top 0.1% Senior Engineer" doc undermines Trust.

---

## Cross-section pattern observations (preview for Phase 2)

Several findings show up independently across multiple agents — these are strong signals for the Phase 2 synthesis:

- **Fake comprehensiveness / orphaned code paths.** `QuotaManager.checkQuota` (storage), `protocol-adapter.ts` (broadcast-box), `SagaMetricsCollector`/`CacheWarmer` (core), `NotificationQueue` (notifications), stub routers (api). Same pattern: code exists, is typed, often tested in isolation, but is *never called from any production code path*.
- **Inflated test/coverage claims.** `project-status.md` claims "1291+ tests" / "95% coverage" across modules where multiple sections found tests that assert string placeholders or pure structure (CLI 15-of-27 placeholders, UI 1 file / 0 component coverage, broadcast-box `api.devices.test.ts` is fake, legal-register 0 tests).
- **Markdown-as-civic-format hard-constraint violated in two of the three places it matters most.** Recordings (broadcast-box AND hardware) produce media blobs only — no civic artifacts. Collab editing (realtime) does not write back to the Markdown record file. Only basic record CRUD honors the constraint.
- **Trust violated by structural dishonesty.** Notifications audit log hardcodes `success: true`. API stub routers return fake `200 OK`. Hardware README self-grades "95% / Top 0.1% engineer". `project-status.md` claims "100% Functional" for components with TODO log-only stubs.
- **Module boundaries collapsing into core.** Broadcast-box bleeds into realtime (4 setter methods + `registerRoomTypeHandler`); `record-schema-builder.ts` hardcodes `'legal-register'`; ad-hoc EmailChannel reimplementations exist in 4 places. The "WordPress for governance" modular promise is not yet structurally honored.
- **Contract not always clear (concretized).** Three on-the-wire command formats accepted; hardware-side doc disagrees with server-side; canonical translator is imported nowhere. The user's intuition is correct: the contract IS fuzzy, and the audit can now point at specific files.
- **Roadmap and manifesto are stale.** Broadcast-box is the flagship per the user, but appears in neither the manifesto (still names Ledger §3.5) nor `docs/roadmap.md`. Realtime + broadcast-box work sits on an unmerged `broadcast-box` feature branch while the project claims "v0.2.0 stable."

Phase 2 will turn these patterns into a consolidated cross-module finding list with severity, a roadmap-reality-check chapter, and an architecture-review chapter (especially around the broadcast-box ↔ realtime boundary collapse).
