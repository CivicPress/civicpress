# CivicPress Manifesto-Fit Audit Report

**Date:** 2026-05-16 to 2026-05-17
**Branch:** `audit/2026-05-16-manifesto-fit` (LOCAL ONLY — do not push)
**Status:** Audit **COMPLETE** (Phase 1 sweeps + Phase 2 synthesis + Phase 3 extension).
**Audit plan:** `docs/plans/2026-05-16-civicpress-audit-plan.md`
**Synthesis plan:** `docs/plans/2026-05-17-civicpress-audit-synthesis-plan.md`
**Phase 1 summary:** [`sections/phase-1-summary.md`](sections/phase-1-summary.md) — top findings per module
**Consolidated findings:** [`2026-05-16-manifesto-fit-findings.md`](2026-05-16-manifesto-fit-findings.md) — sortable registry of all **205 findings** (Phase 1+2: 154; Phase 3 extension: 51)

---

## Executive Summary

### Verdict

The CivicPress platform is **more architecturally ambitious than its v0.2 alpha status warrants**, with sophisticated-looking scaffolding (DI container, saga pattern, multi-provider storage, multi-channel notifications, collaborative editing) that frequently sits beside the missing or orphaned core flow it was meant to support. The flagship — broadcast-box, for civic meeting livestream and archive — **points the right direction but its seams are wrong**: the contract between software and hardware is fuzzy across three repos, the recording pipeline produces media blobs instead of civic records, and the module boundary with realtime has collapsed. Test coverage and "100% Functional" claims in `docs/project-status.md` are materially overstated across multiple modules. The manifesto's six principles and three hard constraints are violated in **specific, fixable ways** — none of them require abandoning the project's shape, but several block honest pilot deployment to a municipality.

**205 findings total: 20 Critical, 65 High, 79 Medium, 41 Low.** (Phase 1+2: 154 findings across 10 audit targets. Phase 3 extension: 51 findings across 4 additional surfaces — civicpress-ingest sibling repo, site sibling repo, dependency/CVE+license audit, parent-directory workspace cleanup.)

### Top 10 findings (by manifesto + civic impact)

1. **(Critical, ui)** Unsanitized markdown → `v-html` on the public record-detail page (`pages/records/[type]/[id]/index.vue:675`, `RecordPreview.vue:33`) — `marked.parse()` with no DOMPurify — combined with JWT/CSRF in `localStorage`. A malicious record body can steal auth tokens from every citizen who reads it. *(ui-001)*
2. **(Critical, broadcast-box)** Recording pipeline produces only media blobs — no Markdown civic artifacts (attendees, motion markers, transcripts). The session record schema supports these fields; nothing populates them. The flagship doesn't yet read as a civic-record module. *(broadcast-box-002)* — mirrored on the hardware side: 69 mp4 files, 0 json sidecars. *(BB-HW-003)*
3. **(Critical, api)** Four route files (`workflows.ts`, `hooks.ts`, `export.ts`, `import.ts`) are stub routers returning fake `200 OK` while looking live to callers. Inflates the "25+ endpoints" claim. *(api-004)*
4. **(Critical, notifications)** Notification audit log structurally hardcodes `success: true` regardless of delivery. 5,156 entries, 0 failed, 89% with empty channels. *(notifications-001)*. Security validation + rate limiting gates are inert: `validateRequest()` and `checkRateLimit()` awaited but return values never inspected. *(notifications-002)*
5. **(Critical, storage)** `QuotaManager.checkQuota()` implemented and unit-tested but never called from any upload path — quotas not enforced. *(storage-001)*. Public folders require auth on one of three routes — citizens cannot enumerate public files. *(storage-002)*
6. **(Critical, broadcast-box)** Rate limiter short-circuits when `NODE_ENV !== 'production'`; combined with WIP `findByCode()` bcrypt loop over 24h of unused codes, unauthenticated registration is a DoS vector in any dev/staging/demo. *(broadcast-box-007)*
7. **(Critical, broadcast-box hw)** Hardware protocol doc disagrees with implementation. Code parses `action` at top level; doc shows nested under `payload`. Three defensive shape-coercion branches accept malformed forms. **No shared protocol-spec artifact between repos.** Canonical translator `protocol-adapter.ts` exists, imported nowhere. *(BB-HW-001, broadcast-box-010, broadcast-box-003)* — this is the user's "contract not always clear" complaint made concrete.
8. **(Critical, broadcast-box hw)** Flagship hardware has NO license — README says "TBD, but will be OSI-approved." A municipality cannot legally deploy or redistribute it. *(BB-HW-002)*
9. **(Critical, ui + hard constraint)** Vendor lock-in via paid `@nuxt/ui-pro ^3.3.7`; every page renders through `UDashboard*` chrome. SPA-only mode (`ssr: false`) breaks resilient archival — records not crawlable, app unusable when API offline. *(ui-002, ui-003)*
10. **The Pattern — fake comprehensiveness across modules.** `QuotaManager.checkQuota` (storage), `protocol-adapter.ts` (broadcast-box), `SagaMetricsCollector`/`CacheWarmer`/hybrid-cache-strategy (core), `NotificationQueue`/4 ad-hoc EmailChannel reimplementations (notifications), 15-of-27 placeholder CLI tests, 1-test-file-32-cases UI claim, stub API routers, `generateParticipantColor` dead code (realtime). The textbook Cursor/AI-coded shape where superficial completeness was prioritized over end-to-end flow. **This is the single biggest cleanup signal across the codebase.**

### Manifesto-fit verdict per module

Cell verdicts: **FAIL** = critical or high-severity violation, **CONCERN** = medium-severity issue or partial-pass, **PASS** = no notable finding, **n/a** = lens does not apply.

| Module | Transp. | Trust | Open-src | Pub.Good | Ease | Equity | No-lock-in | Markdown | Resil.arch |
|---|---|---|---|---|---|---|---|---|---|
| core | FAIL | FAIL | PASS | CONCERN | CONCERN | CONCERN | PASS | PASS | CONCERN |
| cli | PASS | **FAIL** | PASS | PASS | **FAIL** | **FAIL** | PASS | PASS | CONCERN |
| api | CONCERN | **FAIL** | PASS | CONCERN | CONCERN | CONCERN | PASS | PASS | CONCERN |
| ui | CONCERN | **FAIL** | CONCERN | CONCERN | CONCERN | CONCERN | **FAIL** | PASS | **FAIL** |
| realtime | CONCERN | CONCERN | PASS | PASS | CONCERN | CONCERN | PASS | **FAIL** | CONCERN |
| broadcast-box | CONCERN | CONCERN | PASS | PASS | **FAIL** | CONCERN | PASS | **FAIL** | CONCERN |
| storage | CONCERN | **FAIL** | PASS | CONCERN | CONCERN | PASS | CONCERN | n/a | **FAIL** |
| legal-register | CONCERN | CONCERN | PASS | PASS | CONCERN | n/a | PASS | PASS | PASS |
| notifications | **FAIL** | **FAIL** | PASS | CONCERN | **FAIL** | CONCERN | CONCERN | n/a | CONCERN |
| broadcast-box hw | CONCERN | CONCERN | **FAIL** | PASS | **FAIL** | CONCERN | PASS | **FAIL** | CONCERN |
| civicpress-ingest (ext) | PASS | CONCERN | PASS | PASS | CONCERN | PASS | PASS | **PASS** | PASS |
| site (ext) | CONCERN | CONCERN | PASS | PASS | PASS | CONCERN | PASS | n/a | PASS |
| deps-licenses (ext) | CONCERN | **FAIL** | PASS | PASS | CONCERN | n/a | CONCERN | n/a | CONCERN |
| workspace (ext) | CONCERN | **FAIL** | PASS | PASS | CONCERN | n/a | CONCERN | n/a | CONCERN |

### What this means in plain terms

The platform is **not broken — it is overclaimed and underwired**. The work required to honor the manifesto is concrete and bounded:

- Close the **20 Criticals** across the whole audit (mostly security + a few hard-constraint violations). Most are S-effort fixes; a few are M-effort. The 3 added by Phase 3 (`simple-git`, `fast-xml-parser`, `handlebars` CVEs) are all minor-version-bump fixes — fast wins.
- Apply one cleanup pattern systematically: **collapse the orphaned subsystems**. Either wire them or delete them. This single pass touches ~10 finding clusters across modules.
- Refactor the **broadcast-box seams** (one architectural change spanning monorepo + hardware repo + contract). This is L-effort but transformative — and is exactly what the user already suspected when they paused the device-page redesign.
- Update the **roadmap and manifesto** to reflect that broadcast-box is the flagship and to acknowledge the scope shift. This is a small documentation change that closes a Transparency gap. Phase 3 confirmed the gap propagates to the public `site` repo too — fixing the upstream docs cascades.
- **Workspace hygiene from Phase 3:** move personal billing data out of `_work_bk/`; recover ~8.1 GB of redundant backups; push the 3 local-only sibling repos (broadcast-box, broadcast-box-backup, ingest) to remotes; add a top-level `README.md`. ~1 evening of work, big quality-of-life return.

None of these are existential. All are addressable in a small handful of focused sessions. See *Recommended Next Sessions* below.

---

## Methodology

This audit applied six lenses to every module:

1. **Manifesto fit** (primary) — Transparency, Trust, Open-source, Public Good, Ease of Use, Equity; plus hard constraints (no vendor lock-in, Markdown as civic format, resilient archival).
2. **Technical quality** — code clarity, types, errors, tests, docs.
3. **Security (light)** — auth/authz, input validation, civic threat surfaces. Dedicated security session recommended for full coverage.
4. **AI-generation smells** — over-abstraction, fake comprehensiveness, framework misuse, dead code (project was built largely with Cursor).
5. **Architecture** — integration with core, DI usage, boundaries.
6. **Roadmap alignment** — reality check vs `project-status.md` claims; milestones threatened/unblocked.

Severity scale: **Critical** (manifesto hard-constraint or security risk), **High** (manifesto principle degraded or roadmap milestone threatened), **Medium** (quality/future risk), **Low** (cosmetic/polish).

Phase 1 used 10 parallel `general-purpose` subagents, one per audit target. Phase 2 synthesized cross-cutting patterns single-threaded. The audit branch was committed with `--no-verify` (user-authorized) because pre-existing flaky tests on `main` were blocking the docs-only hook — those tests are themselves a Phase 1 finding.

Full methodology and per-module subagent brief: `docs/plans/2026-05-16-civicpress-audit-plan.md`.

---

## Per-Module Sections

Each section was produced by a fresh subagent reading its module independently against the shared lens template.

1. [core](sections/core.md) — 14 findings (2 High, 9 Medium, 3 Low)
2. [cli](sections/cli.md) — 16 findings (6 High, 6 Medium, 4 Low)
3. [api](sections/api.md) — 16 findings (4 Critical, 4 High, 6 Medium, 2 Low)
4. [ui](sections/ui.md) — 17 findings (3 Critical, 5 High, 6 Medium, 3 Low)
5. [realtime](sections/realtime.md) — 14 findings (4 High, 7 Medium, 3 Low)
6. **[broadcast-box (FLAGSHIP, deep)](sections/broadcast-box.md) — 22 findings (2 Critical, 8 High, 10 Medium, 2 Low). Verdict: approach right, seams wrong, refactor not cleanup.**
7. [storage](sections/storage.md) — 16 findings (2 Critical, 6 High, 6 Medium, 2 Low)
8. [legal-register](sections/legal-register.md) — 7 findings (2 High, 3 Medium, 2 Low)
9. [notifications](sections/notifications.md) — 15 findings (3 Critical, 4 High, 6 Medium, 2 Low)
10. [civicpress-broadcast-box (hardware)](sections/civicpress-broadcast-box-hardware.md) — 17 findings (3 Critical, 6 High, 6 Medium, 2 Low)

**Phase 3 extension targets** (added 2026-05-17 at user request, after Phase 1+2 was committed):

11. [civicpress-ingest](sections/civicpress-ingest.md) — 10 findings (4 High, 3 Medium, 3 Low). Sibling repo: OCR + cleanup pipeline for municipal records → Markdown civic records. **Manifesto-cleanest repo in the ecosystem**; main concerns are 6-month staleness, no git remote, single 3,927-line `cli.py`.
12. [site](sections/site.md) — 14 findings (4 High, 7 Medium, 3 Low). Sibling repo: project marketing site. **Manifesto-cleaner than the monorepo UI** (free `@nuxt/ui` instead of paid Pro, statically generated, EN/FR parity); main failure is faithfully mirroring the stale upstream docs (overclaims v0.2.0 readiness; never names broadcast-box).
13. [dependencies-licenses](sections/dependencies-licenses.md) — 12 findings (3 Critical, 5 High, 3 Medium, 1 Low). `pnpm audit` returned **140 advisories (4 Critical, 69 High)** including `simple-git` `blockUnsafeOperationsPlugin` bypass (civic-history integrity risk), `fast-xml-parser` entity bypass via S3/GCS, `handlebars` JS injection.
14. [workspace-cleanup](sections/workspace-cleanup.md) — 15 findings (5 High, 6 Medium, 4 Low). Parent-directory hygiene: ~**8.1 GB recoverable** from `_work_bk/` (3.8 GB) + `civicpress-broadcast-box-backup/` (4.3 GB); **personal billing data sitting next to public repos** (high sensitivity, mode-600 today but one accidental `git add -A` away); **3 of 6 sibling repos have no git remote** (broadcast-box, broadcast-box-backup, ingest); no top-level `README.md` for a 6-repo workspace.

---

## Architecture Review

### 1. Module boundaries — the "WordPress for governance" promise is not yet structural

The manifesto §3.1 says CivicPress is "modular — like WordPress for local governance, or Odoo for public institutions." That promise is not structurally honored yet. Three concrete examples:

- **broadcast-box bleeds into realtime.** `RealtimeServer` has four broadcast-box-specific setter methods (`setDeviceAuthDependencies`, `setDeviceCommandService`, `setDeviceConnectionTracker`) PLUS a `registerRoomTypeHandler`. The new handler-registry pattern was added in commit `e014f40` specifically "to decouple broadcast-box device handlers from realtime module" — but only the new path landed; the old setters still ship and are still wired up. `realtime-server.ts` is 3,581 lines, roughly **1,500 of them broadcast-box-specific** (legacy device-message handler at line 1533, status/source/ack processing at lines 1782-2330). The module boundary collapsed. *(broadcast-box-012, realtime-004, realtime-009)*
- **`core/src/records/record-schema-builder.ts:219-236` hardcodes the string `'legal-register'`** to scope which record types the module applies to. Any new module requires a core-side code change. The runtime `pluginSchemas` registry (`record-schema-builder.ts:274-283`) already supports `appliesTo` declared by the module itself — but file-based modules can't use it. *(legal-register-002)*
- **Four parallel ad-hoc inline `EmailChannel` implementations** exist (CLI, API route, auth-service, and the dead notifications module file). A municipality wanting to switch from SendGrid to self-hosted SMTP must edit all four. The `NotificationChannel` abstraction is technically swappable but not actually used by callers. *(notifications-005)*

Recommendation: define a stable inter-module contract layer (manifest + capabilities + appliesTo declarations + plugin lifecycle), retire the setter-injection patterns, and let `legal-register` become a real module-by-example.

### 2. The two-repo broadcast-box seam — concrete answer to "is the approach right?"

The user explicitly raised that "the contract with broadcastbox is not always clear" and "controlling the box / live event server setup was not optimal." The audit can now point at specific files:

- **Three on-the-wire command formats accepted:** `type=command` with top-level action, `type=control` legacy with `event`, `type=undefined` server-format with `commandId`. The hardware side has them (`websocket_client.py:486-565`); the server side has them (`realtime-server.ts:1571-1665`); both ends accumulate compatibility code rather than fixing one side. *(broadcast-box-010, realtime-010, BB-HW-004)*
- **Documented contract disagrees with the implementation.** Hardware's own `docs/civicpress-integration-protocol.md` shows `action` nested in `payload`. The actual code parses `action` from top level. The server sends top-level. So the doc lies about what the code does. *(BB-HW-001)*
- **`protocol-adapter.ts` (172 lines) is the canonical translator that should exist on one side or the other — and it exists in `modules/broadcast-box/src/websocket/`, but is imported nowhere.** Production uses hand-rolled inline normalizers in `device-room-handler.ts:422-475`. *(broadcast-box-003)*

The verdict from the deep broadcast-box audit was: **the approach is roughly right, the seams are wrong — recommend an architectural refactor, not cleanup.** Concretely: extract a single Device Contract package that owns `ProtocolHandler` + `ProtocolAdapter` + `DeviceRoom` + `DeviceCommandService`, expose it to realtime via a single `RoomTypeHandler` entry-point, retire the four setter-injection methods on realtime, retire the unused command-handler registry, and add a civic-artifact-derivation service that produces session-record updates from recording metadata. A shared JSON-schema or protobuf protocol-spec file consumed by both sides would prevent the documentation/code drift from recurring.

### 3. Fake comprehensiveness / orphaned code paths — the strongest cross-cutting AI-generation signal

Code that exists, is typed, often tested in isolation, but is never called from production:

| Subsystem | Lines | Status | Source |
|---|---|---|---|
| `QuotaManager` (storage) | 218 | tested, never called | storage-001 |
| `protocol-adapter.ts` (broadcast-box) | 172 | exported, never imported | broadcast-box-003 |
| `SagaMetricsCollector`, `SagaRecovery` (core) | ~400 | exported, never instantiated | core-005, core-004 |
| `CacheWarmer` (core) | 203 | wired but no config enables it | core-005 |
| Hybrid cache strategy (core) | typed option | throws "not yet implemented" | core-006 |
| `NotificationQueue` (notifications) | full class | constructed, never `enqueue`'d | notifications-008 |
| API stub routers (workflows/hooks/export/import) | 4 files | return fake `200 OK` | api-004 |
| `middleware/jwt-auth.ts` (api) | 228 | duplicate of auth.ts, unused | api-008 |
| `UuidStorageService` (storage legacy) | 458 | unused; only `CloudUuidStorageService` is wired | storage-009 |
| Server-side `command-handlers.ts` registry (broadcast-box) | 1,124 | tested, runtime path bypasses it | broadcast-box-013 |
| `generateParticipantColor` (realtime) | 16-entry palette | dead per CLAUDE.md | realtime-007 |
| Webhook security primitives (notifications) | HMAC-SHA256 well-implemented | no webhook endpoint exists | notifications-013 |
| SMS/Slack channels (notifications) | config + rate limits + UI | no implementation class | notifications-009 |
| `simulateEmailSending` (notifications) | private method | dev-helper never called | notifications-015 |

This is the single biggest AI-generation signal in the codebase. A follow-up "delete or wire" pass would tighten the surface significantly and improve every other metric (test honesty, type safety, contributor onboarding).

### 4. Over-engineered scaffolding for v0.2 alpha — collapse where reasonable

Core ships a **hand-rolled DI container** (~600 LoC, 7 files, 7 dedicated test files) for an application whose registration list is 11 services manually wired in `civic-core-services.ts:43-199`. `DependencyResolver.extractDependencies()` returns `[]` with a TODO. A `Map<string, factory>` would deliver the same functionality. The DI tests test the DI container itself rather than civic features — if those tests were removed alongside the container, would the rest of the suite still pass? Probably yes; the DI container is delivering test surface without test value. *(core-003)*

The **saga pattern** is structurally correct for the civic problem (Git commits are authoritative, file→DB→Git ordering enforces "no public decision without a Git artifact"). The design is good. But `SagaRecovery.recoverFailedSagas()` is a placeholder, `SagaMetricsCollector` is never instantiated, `CacheWarmer` is wired but no config enables it. Build recovery + metrics + idempotency + locking + state persistence ahead of a single municipality pilot is a meaningful bet on operational scale that the project hasn't reached. Worth a decision: keep as forward investment, or trim to executor + state store + idempotency only and defer the rest. *(core-003, core-004, core-005)*

**Two parallel audit systems** (file JSONL `AuditLogger` + DB `audit_logs`) coexist; neither owns the full surface. `RecordManager.updateRecord` writes DB audit without `userId`; sagas write neither. The audit trail is bolted onto API/CLI, not core. For a civic platform whose Trust principle depends on "who changed what, when," this is a structural gap. *(core-001, core-013)*

Recommendation: define the audit-event contract once (where written, what fields required, who can read), pick ONE backend, and have core's record-manager itself emit coherent audit entries.

### 5. Test theatre across modules — the "1291+ tests / 95% coverage" claim does not survive scrutiny

`project-status.md` says "1291+ tests passing… 90% test coverage" with per-module breakdowns. The audit finds:

| Module | Claim | Reality |
|---|---|---|
| CLI | 120+ tests, 95% coverage | 15 of 27 test files are placeholders asserting the literal string `"CLI testing disabled in this environment"` (cli-001) |
| UI | 80+ tests, 85% coverage | 1 test file, 32 cases on one utility, 0 component/page/composable/store tests (ui-005) |
| broadcast-box | 78 tests | `api.devices.test.ts` is fake — every test asserts `toBeDefined()` / `toBeInstanceOf(Function)` (broadcast-box-004); prior Jan-2025 audit flagged this, not addressed |
| legal-register | (no claim) | 0 in-module tests; behavior exercised only indirectly (legal-register-004) |
| notifications | (spec calls "stable") | 1 test file (email-only), against fake SMTP host; SMS/Slack/webhook never tested |
| storage | (no specific claim) | 17 mock-only files; no end-to-end integration test against any real provider including local FS (storage-014) |

A fresh count of "tests that actually exercise behavior" and per-module truthful coverage statements would close this gap. Until then, **the test count is false confidence**.

### 6. Pre-existing test reliability issues — flaky tests on main blocking the audit hook

During this audit, three commits attempted to land docs-only changes; two distinct tests failed across runs:

- `tests/api/lock-endpoints.test.ts` — `Lock Lifecycle > should support complete lock lifecycle` timed out at 5000ms
- `tests/core/database-integration.test.ts` — `Session Management > should create and manage sessions` — `Cannot read properties of null (reading 'username')` from `getSessionByToken`

Both fail under the pre-commit hook's concurrent test execution on `main` independent of any branch work. This is why the audit was committed with `--no-verify` (user-authorized for docs-only commits). It's also a Trust-principle issue worth surfacing as its own follow-up: a test suite that's unreliable on `main` undermines the "1291+ passing" claim before any of the test-theatre patterns above are even considered.

---

## Roadmap Alignment

### Reality check — project-status.md claims vs code reality

| Claim from `project-status.md` | Verdict | Evidence |
|---|---|---|
| "1291+ tests passing" | **PARTIALLY TRUE** | Tests run, but ~30% of CLI tests are placeholder strings (cli-001); UI has 1 test file / 32 cases for 13 components (ui-005); broadcast-box `api.devices.test.ts` is fake (broadcast-box-004); legal-register has 0 in-module tests (legal-register-004). |
| "0 critical security vulnerabilities" | **FALSE** | At least 8 Criticals identified in this audit: XSS via v-html on public records (ui-001); per-request CivicPress init as DoS amplifier (api-001); public folder requires auth on one of three routes (storage-002); notification audit log structurally dishonest (notifications-001); inert security validation + rate limiting (notifications-002); broadcast-box rate limiter short-circuits in non-production (broadcast-box-007); plus contract/no-license issues on broadcast-box hardware. |
| "Core platform 100% Functional" | **DISPUTED** | `WorkflowEngine.approvalWorkflow/publicationWorkflow/archivalWorkflow` are TODO log-only stubs registered as functional (core-002); `HookSystem.logHook` is a TODO; `SagaRecovery.recoverFailedSagas()` is a placeholder (core-004); `SagaMetricsCollector`/`CacheWarmer` exported but never instantiated (core-005). |
| "Multi-Layer Authentication & Authorization" | **PARTIALLY TRUE** | Tokens issued, but `/api/v1/validation/*` routes lack upstream auth middleware (api-002); public storage folder bypass missing on one of three routes (storage-002); CLI has two parallel auth UX trees (cli-004); broadcast-box has 38 `// TODO: Add permission check` comments still in place with no per-endpoint RBAC (broadcast-box-006). |
| "Complete Internationalization (EN/FR)" | **PARTIALLY TRUE** | i18n locale files well-built, but several admin pages (Setup, Configuration) hardcode English entirely; CLI is English-only with no i18n; notification templates hardcoded English; API errors hardcoded English (ui-006, cli-005, notifications-010, api-011). |
| "Phase 8 Complete" (broadcast-box) | **DISPUTED** | Implementation runs but: no Markdown civic artifacts produced (broadcast-box-002); contract with hardware fuzzy and undocumented (broadcast-box-010); prior Jan-2025 audit recommendations partially unaddressed (broadcast-box-021); rate limiter broken outside production (broadcast-box-007). |
| "Storage v1.0.0 production-ready" (module README) | **FALSE** | Quota not enforced (storage-001); failover recovery is a no-op (storage-004); lifecycle archive creates orphans (storage-003); SQLite-loss = file-unreachable scenario undocumented (storage-007); README claims GCS planned but it's done, claims API/CLI planned but they exist (storage-008). |
| "Notifications stable v1.0.0" (spec) | **FALSE** | Audit log hardcodes success (notifications-001); validation/rate-limit gates inert (notifications-002); PII sanitizer broken (notifications-003); module file abandoned (notifications-004); 4 ad-hoc reimplementations (notifications-005); `createTransporter` typo in module (notifications-006); SMS/Slack/webhooks/queue/hooks all unimplemented despite being declared. |
| "Realtime: Fully Implemented" (project-status) | **DISPUTED** | Implementation works, but: per-user connection limit unreachable due to userId=null bug (realtime-001); per-IP connection-count leak (realtime-002); collab edits don't write back to Markdown (realtime-003); 3,581-line god-file with 2 parallel device-handling paths (realtime-004). Also: not on roadmap, not in project-status's "What's Working" (realtime-011). |

### Forward-fit — findings mapped to roadmap milestones

| Finding / cluster | Threatens milestone | Unblocks milestone (if fixed) |
|---|---|---|
| broadcast-box flagship invisible in roadmap + manifesto (BB-001, BB-HW-007) | v0.3.x onwards (silent dependency on undeclared feature) | Updates unblock honest planning |
| Markdown-civic-artifact gap in recordings + collab (BB-002, BB-HW-003, RT-003) | v0.5–0.8 Pilot Readiness (clerks won't accept media-only records) | v0.5–0.8 pilot if civic artifacts implemented |
| 17 Criticals (security + hard constraints) | v0.9 Production Candidate (cannot be production-candidate with this many criticals) | v0.9 if all closed |
| Vendor lock-in: Nuxt UI Pro + cloud SDK direct-deps + 4 EmailChannel reimplementations (UI-002, ST-006, NOT-005) | Manifesto open-source/no-lock-in hard constraint | v1.0 Stable Release |
| SPA-only mode, no service worker, no SSR (UI-003) | v0.9 Accessibility Audit (WCAG); manifesto Equity + Resilient archival | v0.9 if addressed |
| Test theatre / inflated coverage (CLI-001, UI-005, BB-004, LR-004) | v0.9 (cannot honestly claim production readiness) | v0.9 with honest coverage + real tests |
| Module boundary collapse (BB-012, RT-004, LR-002) | v0.3.x Editor / v0.4.x Workflow (each new feature touches multiple modules) | Plugin system (v0.3.x+) needs stable contracts |
| Two-repo broadcast-box contract fuzz (BB-010, BB-HW-001, BB-HW-004) | v0.5–0.8 Hardware deployment readiness | Pilot Readiness |
| Fake-comprehensive subsystems (storage QM, BB protocol-adapter, core sagas, notifications queue, API stubs) | v0.5+ as each "looks done" feature is found to not work | One "delete or wire" pass closes most |
| Audit-trail fragmentation + lying (CORE-001, NOT-001, API-004, BB-HW-008) | v0.4.x Comprehensive Audit Logs / Audit Trail UI | v0.4.x if collapsed to one truthful audit channel |
| Notifications structurally broken (NOT-001 through NOT-007) | v0.4.x (workflows need notification targets); v0.5–0.8 (clerk + citizen email reliability) | Both, with a small bounded fix-set |
| Storage resilient-archival gap (ST-007) | Manifesto Resilient archival hard constraint | v0.5–0.8 pilot reliability |
| CLI English-only / emoji-heavy / `cleanup --force` (CLI-005, CLI-006) | v0.5–0.8 Municipal Pilot Readiness (Quebec/Richmond demo town) | v0.5–0.8 if i18n+safety pass done |

### Meta-finding — the roadmap and manifesto themselves are stale

Broadcast-box is the flagship per the user, but appears in neither `docs/roadmap.md` nor the manifesto (still names "Ledger" §3.5). Realtime + broadcast-box work sits on an unmerged `broadcast-box` feature branch while `docs/project-status.md` claims "v0.2.0 Alpha — Stable & Production-Ready." The hardware repo is not mentioned in `docs/roadmap.md` or `docs/project-status.md`. The `docs/specs/legal-register.md` is `status: stable, version: 1.0.0` describing a module that doesn't exist. The hardware repo's `docs/engineering-analysis.md` self-grades "Top 0.1% Senior Engineer / 95% production-ready."

**Documentation that doesn't reflect intent erodes trust** — and that itself is a Transparency-principle violation. Recommendation: a dedicated session to update the roadmap, refresh the manifesto (or release v1.2 acknowledging the strategic shift), and bring `docs/project-status.md` into truthful alignment. This should happen *before* the audit branch is ever pushed publicly.

---

## Consolidated Findings

See [`docs/audits/2026-05-16-manifesto-fit-findings.md`](2026-05-16-manifesto-fit-findings.md) — sortable registry of all 154 findings, with three views:

- **Sorted by severity** (Critical → Low, then by module)
- **Grouped by manifesto principle** (hard-constraint violations first; Trust dishonesty; Transparency gaps; Ease of Use + Equity)
- **Cross-reference index by module** (with per-module severity counts)

---

## Recommended Next Sessions

In priority order. Each is a focused, scoped follow-up — none open-ended.

### 1. Critical-only fix pass (RECOMMENDED FIRST)

**Goal:** Close the 17 Critical findings before any external sharing of the audit. Most are S-effort.

**Scope:**
- ui-001: Sanitize markdown via DOMPurify in `useMarkdown.ts`; consider moving JWT/CSRF out of `localStorage` to `httpOnly` cookies.
- ui-002: Audit `@nuxt/ui-pro` licensing posture for v3 production builds; pin a decision (replace OR confirm free).
- ui-003: Add `<noscript>` fallback at minimum; plan SSR/prerender for the public record-reading paths.
- api-001/002/003: Fix the per-request `CivicPress` instantiation in `info.ts`; add auth middleware to `validation.ts`; inject `civicPress` into `status.ts`.
- api-004: Replace stub routers with `501 Not Implemented` returning a `Retry-After` and a roadmap link, OR remove them entirely.
- storage-001: Wire `QuotaManager.checkQuota()` into the upload paths.
- storage-002: Apply the public-folder bypass to `GET /folders/:folder/files` to match the other two routes.
- notifications-001: Inspect actual delivery and write truthful audit entries.
- notifications-002: Inspect `{valid, errors}` and `{allowed}` return values and short-circuit.
- notifications-003: Move PII sanitization to the audit log path, not the template-variable bag.
- broadcast-box-002: Stub a civic-artifact derivation service that emits a Markdown minutes scaffold per recording end.
- broadcast-box-007: Gate the rate limiter on a positive opt-out (e.g., `CIVIC_DEV_DISABLE_RATELIMIT=true`) not on `NODE_ENV != production`.
- BB-HW-001/BB-HW-004: Pick one canonical format; remove the other two from both sides; document in a shared protocol-spec file consumed by both repos.
- BB-HW-002: Choose a license (Apache-2.0, AGPL-3.0, or MPL-2.0); add the LICENSE file.
- BB-HW-003: Ship the JSON sidecar; ensure the metadata pipeline runs on every recording end (paired with broadcast-box-002).

**Output:** PR-per-fix or one branch; tests added for each fix; audit findings updated with status.
**Effort:** ~1-2 sessions.

### 2. Broadcast-box deep refactor follow-up

**Goal:** Address the "approach right, seams wrong" verdict with a concrete architectural refactor.

**Scope:**
- Define a single Device Contract package: `ProtocolHandler` + `ProtocolAdapter` (use the existing `protocol-adapter.ts` as the canonical) + `DeviceRoom` + `DeviceCommandService`.
- Sunset two of the three on-the-wire formats; canonicalise one; emit clear deprecation warnings on the other two with a removal date.
- Retire the four setter-injection methods on `RealtimeServer`; the `registerRoomTypeHandler` pattern becomes the sole entry point.
- Retire the unused command-handler registry (`websocket/command-handlers.ts`).
- Civic-artifact derivation: a small service that turns the recording's metadata (timestamps, source switches, active source per moment) into a Markdown minutes scaffold attached to the session record. Closes broadcast-box-002 and BB-HW-003.
- Clerk-grade live-event setup: a YouTube/Facebook/Vimeo abstraction with a per-municipality channel registration (closes broadcast-box-005).
- Shared protocol-spec artifact (JSON Schema or `.proto`) consumed by both repos; generated types on both sides.

**Inputs:** `docs/audits/sections/broadcast-box.md`, `docs/audits/sections/civicpress-broadcast-box-hardware.md`, `docs/audits/sections/realtime.md`.
**Output:** Architecture proposal + migration plan + small PoC.
**Effort:** 1-2 sessions.

### 3. Dedicated security review (use `/security-review` skill)

**Goal:** Take the security findings beyond "light pass" — formal threat model, authn/authz tracing across all 25+ endpoints, dependency vulnerability scan, civic-specific threat surface (enrollment code theft, recording tampering, motion integrity, citizen PII), pentest-style review.

**Inputs:** The audit sections' Security subsections + the consolidated findings registry filtered by `security` lens.

**Specific surfaces flagged for this session:**
- ui: record-rendering pipeline (markdown → HTML → v-html), `/api/v1/info` analytics injection, auth-token storage model
- api: full authn/authz endpoint matrix, JWT vs session-token split in `auth-service.ts`, OAuth state parameter handling, secrets-manager fallback to auto-generated dev secrets, `BYPASS_AUTH` env var
- storage: filename sanitization audit, end-to-end auth trace for public folders, credential storage hygiene, multer DoS surface (100MB default)
- broadcast-box: token-in-URL-query, enrollment code re-registration recovery path, admin endpoint's no-auth branch, debug logging that leaks stream keys
- broadcast-box hw: enrollment code at-rest encryption (claim vs reality), AP-mode auto-deactivation timeout, certificate pinning, firmware update path
- notifications: webhook security primitives without webhook surface, per-recipient rate limiting

**Output:** Full threat model doc + prioritized remediation list.
**Effort:** 1 dedicated session.

### 4. Manifesto + roadmap refresh

**Goal:** Bring `docs/roadmap.md` and `manifesto/manifesto.md` up to date with reality.

**Scope:**
- Add broadcast-box (software + hardware) as a named milestone in `docs/roadmap.md`; ideally a v0.3.x "Civic capture and accountability" phase.
- Refresh manifesto §3.5 — either deprecate "Ledger" cleanly, or name a broader "civic capture and accountability" principle and list both Ledger and broadcast-box as flagships under it.
- Bring `docs/project-status.md` into honest alignment with the audit findings; remove "100% Functional" claims for subsystems with TODO stubs; revise test/coverage numbers; remove "0 critical security vulnerabilities" line.
- Decide on `legal-register`: real module (build the workflow, tests, CLI, UI) or schema-only convention (rewrite the spec + architecture entry to say so).
- Update the hardware repo's README license + delete or honestly rewrite `docs/engineering-analysis.md`.

**Effort:** ~1 short session.

### 5. Documentation consolidation

**Goal:** Consolidate overlapping/contradictory docs to a single source of truth per topic.

**Scope:**
- `modules/broadcast-box/README.md` (stale, Phase 8) + `docs/broadcast-box-integration.md` (new, excellent) + `docs/broadcast-box/civicpress-module-spec.md` + the 25+ broadcast-box plan/analysis docs → ONE canonical integration doc + an archive folder.
- The hardware repo's 33 doc files → keep the core 5-8, archive the rest.
- `modules/realtime/TESTING.md` and `test-websocket.mjs` describe the removed JSON protocol — update or remove.
- `modules/storage/README.md` materially out of date (claims GCS planned, API/CLI planned) → update.
- `modules/api/README.md` documents X-API-Key auth that doesn't work; OpenAPI spec is `v0.1.3` — update both.
- Settle the `modules/README.md` file (currently mistitled "CivicPress UI Module" — it's not a modules index).

**Effort:** ~1 session.

### 6. Test reliability + honest coverage

**Goal:** Make the test suite trustworthy.

**Scope:**
- Fix the two flaky tests (`lock-endpoints.test.ts`, `database-integration.test.ts`).
- Delete or replace the 15 placeholder CLI test files; if real CLI tests can't be wired easily, rename them `*.notes.md` and drop the fake assertions.
- Replace the fake `api.devices.test.ts` with real supertest-driven coverage.
- Produce honest per-module coverage numbers; reconcile `project-status.md`.
- Add at least one end-to-end storage integration test (real local FS).
- Add an offline-edit test for realtime (manifesto resilience).

**Effort:** 1-2 sessions; pairs with the Critical fix pass.

### 7. Plugin/module contract solidification

**Goal:** Make the "WordPress for governance" promise structural.

**Scope:**
- Define the module integration contract (manifest + capabilities + `appliesTo` declarations + lifecycle).
- Remove hardcoded module names from core (`record-schema-builder.ts:219-236`).
- Migrate file-based module discovery to use the runtime `pluginSchemas` API.
- Let `legal-register` become a real module-by-example.
- Document the contract in `docs/module-integration-guide.md`.

**Effort:** 1 session; depends on outcomes of #2 (broadcast-box refactor may inform the contract shape).

### 8. "Delete or wire" cleanup pass

**Goal:** Address the fake-comprehensiveness pattern systematically.

**Scope:** For each orphaned subsystem in the Architecture Review § 3 table:
- Decide: keep+wire (commit a wiring PR), or delete (commit a removal PR).
- For "keep+wire": add a smoke test that fails if the call site disappears.
- Remove or rewrite the comments/docs that claimed it was working.

**Effort:** 1 session, possibly split across modules.

---

## Audit hygiene notes

- This audit branch is **local-only** and should not be pushed until findings have been triaged, the Critical-only fix pass is at least partially done, and the manifesto+roadmap refresh has reconciled the public documentation.
- Two `--no-verify` commits exist on this branch (Phase 0 scaffold and Phase 1 sweeps were originally going to require it; only Phase 1 + Phase 2 used it). The flaky-test issue itself is a Phase 1 finding and should be fixed before the audit branch is merged anywhere.
- The merge of `broadcast-box` into the audit branch (commit `7b51b0a`) was done locally to enable Phase 2 to read realtime + broadcast-box source directly. This merge should not propagate — it's an audit-convenience artifact, not a release decision.
- The prior broadcast-box audit (`docs/broadcast-box/CLEANUP-AND-TEST-AUDIT-REPORT.md`, Jan 2025) was created and then **deleted in commit `1181c17`** ("docs: remove obsolete analysis docs and fix stale counts"). Many of its findings were not addressed before deletion. This pattern — *erasing audit findings rather than enacting them* — is exactly what an unpushed local audit branch is designed to avoid. Recommendation: track each finding's status (open / accepted / wontfix / closed-with-commit) explicitly.
