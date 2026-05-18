# Spec stability triage — Phase 2b Task 1

Generated 2026-05-17/18 as part of CivicPress base refactor Phase 2b (Truth Restoration). Input: 61 specs in `docs/specs/` marked `status: stable, version: 1.0.0` (a few at v2.x). Decision matrix below buckets each into STABLE-KEEP / DEMOTE-TO-PARTIAL / DEMOTE-TO-PLANNED based on implementation reality.

**Method:**
- Cross-referenced each spec against the 2026-05 manifesto-fit audit (`docs/audits/2026-05-16-manifesto-fit-audit.md`) and its per-module sections under `docs/audits/sections/`.
- Verified implementation existence via `core/src/<X>/`, `modules/<X>/`, `cli/src/commands/<X>.ts`.
- Conservative bias: when in doubt, demote to PARTIAL rather than KEEP.

**Master plan reference:** §5 Phase 2b — Truth restoration: "Every claim in the docs, the code, the spec, the site, and the public narrative is true."

---

## STABLE-KEEP (22 specs)

These specs describe features that genuinely work in v0.2.0.

| Spec | Evidence | Rationale |
|---|---|---|
| `add-version-headers.md` | Meta-spec describing a documentation convention. No code required. | Convention spec. |
| `auth.md` | `core/src/auth/` exists; auth integration tests pass; Phase 2a Task 2 closed api-001/2/3 (auth gates now real). | Real working auth; 2a made it more honest. |
| `cli.md` | 28 commands in `cli/src/commands/` (auth, init, create, list, publish, validate, …). CLI entry wired. The cli-001 finding is about TEST coverage, not the CLI itself. | Real CLI. |
| `database.md` | `core/src/database/` with SQLite + Postgres support. Integration tests pass. | Real. |
| `git-engine.md` | `core/src/git/` exists, integrated, used by records/lifecycle. | Real. |
| `git-policy.md` | Companion to git-engine — describes commit/branch conventions used by the real git engine. | Convention spec. |
| `glossary.md` | Documentation reference. | Reference doc. |
| `indexing.md` | `core/src/indexing/` exists; `index.yml` files are produced; search uses them. | Real. |
| `manifest.md` | `.civic/manifest.yml` is read at init and throughout. | Real. |
| `permissions.md` | Permission system real; permission checks (`userCan`, `requirePermission`) used across api/cli/ui. | Real. |
| `public-data-structure.md` | `data/records/<type>/<id>.md` convention is the system's spine. | Real convention. |
| `records-validation.md` | `cli/src/commands/validate.ts` exists; `civic validate` works. | Real. |
| `records.md` | `core/src/records/` is the heart of the system. Real, tested, integrated. | Real. |
| `roles.yml.md` | `.civic/roles.yml` is the auth source of truth. | Real. |
| `serve.md` | `modules/serve/` exists with dev/preview/start scripts wired into root `package.json`. | Real. |
| `spec-guidelines.md` | Meta-spec about spec format. | Reference doc. |
| `spec-versioning.md` | Meta-spec about how specs are versioned. | Reference doc. |
| `status-tags.md` | Record status transitions (draft/published/archived) work in records lifecycle. | Real. |
| `storage.md` (v2.1.0) | `modules/storage/` exists; Phase 2a closed storage-001 (quotas enforced) + storage-002 (public folder bypass). Real cloud + local backends. | Real, more honest post-2a. |
| `templates.md` (v2.0.0) | `core/src/templates/` exists. Spec already has `implementation_status: completed` marker. | Real. |
| `users.md` | User CRUD real; paired with auth; `cli/src/commands/users.ts` exists. | Real. |
| `versioning.md` | Records are versioned via Git; spec describes this. | Convention spec. |

---

## DEMOTE-TO-PARTIAL (19 specs)

These specs describe modules that exist but are incomplete, broken in documented ways, or claim more than the code delivers.

| Spec | Evidence | Rationale |
|---|---|---|
| `accessibility.md` | Spec claims comprehensive WCAG/a11y framework. UI module has 0 dedicated a11y tests; Phase 2a added 8 XSS pins (not a11y). | A11y is aspirational beyond basic semantic HTML. |
| `activity-log.md` | `core/src/audit/` exists. The notification audit log was found dishonest pre-Phase-2a (5,156 hardcoded success rows). Honest baseline post-2a; spec still overstates. | Implementation exists; honest only post-2a. |
| `api.md` | `modules/api/` exists with real integration tests. But Phase 2a Task 3 demoted 4 stub routers (workflows/hooks/export/import) to 501. Spec describes them as functional. | Real API; surface partial. |
| `audit.md` | `core/src/audit/` exists. `SagaMetricsCollector` orphaned (per audit core findings). Audit log integrity restored in Phase 2a. | Partial. |
| `backup.md` | `core/src/backup/` exists; `cli/src/commands/backup.ts` exists. "Disaster recovery" claims unverified by tests. | Partial. |
| `data-integrity.md` | Records validation exists. `core/src/records/` works. "Integrity patterns" beyond CRUD are aspirational. | Partial. |
| `frontend.md` | `modules/ui/` exists (Nuxt 3 + Vue 3). Overlaps with ui.md. Audit found "0 component coverage" (ui-005). | Partial. |
| `health.md` | Health endpoints exist in api. `/api/v1/status` works post-Phase-2a Task 2 (api-003). Coverage claims modest. | Partial / borderline KEEP — kept in PARTIAL because the spec implies more comprehensive monitoring than exists. |
| `hooks.md` | `core/src/hooks/` exists as concept. `modules/api/.../hooks.ts` stub returns 501 (api-004 closed in 2a). | Concept exists; surface 501. |
| `lifecycle.md` | Status transitions work in records lifecycle. Spec implies a richer state machine than the impl has. | Partial. |
| `notifications.md` | Email channel works honestly post-Phase-2a Tasks 6-8. SMS/Slack/webhooks/queue absent. **Closes notifications-007.** | Confirmed partial. |
| `observability.md` | Some logging in place. No comprehensive observability stack (metrics, traces, dashboards). | Partial. |
| `onboarding.md` | `cli init` works. UI onboarding flow exists but is alpha-quality. | Partial. |
| `review-policy.md` | Some workflow primitives. "Review & approval" multi-stage flow is partial. | Partial. |
| `security.md` | Security primitives exist (auth, permissions, rate limiting). 2026-05 audit found 20 Criticals (15 closed in 2a, 5 deferred). Threat modeling beyond CRUD unverified. | Partial. |
| `testing-framework.md` | Vitest configured + integration tests run. Spec claims unit/integration/E2E/security/perf/a11y — only unit+integration real. | Partial. |
| `translations.md` | Site has EN/FR i18n. Monorepo UI has minimal i18n. | Partial. |
| `ui.md` | `modules/ui/` exists. Audit found 0 component coverage (ui-005); Phase 2b Tasks 8+9 add Tier 1/2 tests. | Partial. |
| `workflows.md` (v2.0.0) | `core/src/workflows/` exists. Workflow execution partial; the v2.0.0 spec mentions "Session recorder integration workflow triggers" → broadcast-box adjacency. api stub for workflows returns 501. | Partial. |

---

## DEMOTE-TO-PLANNED (20 specs)

These specs describe modules that are absent, schema-only, or so partial that calling them "stable" is misleading.

| Spec | Evidence | Rationale |
|---|---|---|
| `archive-policy.md` | No `core/src/archive/` directory. No CLI archive command. Records get an `archived` status but the policy spec describes retention/expiry/transparency that don't exist. | Policy spec without implementation. |
| `branding.md` | No `core/src/branding/`. UI uses default Nuxt UI. Towns can't customize branding via the system. | Aspirational. |
| `deployment.md` | No deployment infrastructure code in repo. Docs-only spec. | Aspirational. |
| `feedback.md` | No `core/src/feedback/`. No CLI feedback command. No UI feedback widget. | Aspirational. |
| `legal-register.md` | **210-line JSON schema at `core/src/records/record-schema-builder.ts:219-236` is the entire implementation.** No CLI, no API, no UI. **Closes legal-register-001 + legal-register-006.** | Confirmed planned. |
| `maintenance.md` | No maintenance/downtime handling code. | Aspirational. |
| `metrics.md` | No metrics module. `SagaMetricsCollector` exists but orphaned (never called from prod). | Aspirational. |
| `moderation.md` | No moderation module. No reports/flags/review queue. | Aspirational. |
| `module-api.md` | The "WordPress for governance" plugin/module API doesn't exist as structural code (manifesto §3.1 promise; audit found absent). | Aspirational. |
| `plugin-api.md` | No plugin loader. Paired with plugins.md. | Aspirational. |
| `plugin-development.md` | Paired with plugin-api. No plugin development infrastructure. | Aspirational. |
| `plugins.md` | Paired with plugin-api. No plugin loader. | Aspirational. |
| `printable.md` | No PDF export / print pipeline. | Aspirational. |
| `scheduler.md` | No scheduler module. | Aspirational. |
| `signatures.md` | No signature implementation. | Aspirational. |
| `static-export.md` | No comprehensive static export pipeline for the monorepo UI. (Site repo is separately static.) | Aspirational at the monorepo level. |
| `themes.md` | No theme system. UI uses default Nuxt UI. | Aspirational. |
| `timeline.md` | No timeline UI/component. | Aspirational. |
| `version-tracker.md` | No spec-version tracking tool. | Aspirational. |
| `votes.md` | No voting module. | Aspirational. |

---

## Summary

- **STABLE-KEEP:** 22 specs
- **DEMOTE-TO-PARTIAL:** 19 specs
- **DEMOTE-TO-PLANNED:** 20 specs
- **Total:** 61 ✓

**Top priority action sequence:**
1. legal-register.md → planned (closes legal-register-001 + legal-register-006, two named audit findings).
2. notifications.md → partial (closes notifications-007, named finding).
3. The other 18 DEMOTE-TO-PLANNED (mostly aspirational modules) — quick mechanical sweep.
4. The other 17 DEMOTE-TO-PARTIAL (real-but-incomplete modules) — also mechanical.

**What this triage does NOT do:**
- It does not delete any spec. Master plan §3 anti-deletion rule applies.
- It does not edit spec BODIES. Only frontmatter (`status` + `version`) + a top-of-file note.
- It does not promise that PLANNED specs ever become STABLE; that's a future-phase decision.

**Phase 2b Task 1 commit will:** edit 39 specs (19 partial + 20 planned), add this triage matrix, and update the findings registry to close legal-register-001 + legal-register-006 with the commit SHA.

🏛️ — _Make truth true again._
