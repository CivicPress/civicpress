# CivicPress Project Status

> **Current state — 2026-07-30.** CivicPress is a **working alpha**
> civic-records platform (v0.2.0, MIT). This document is the honest answer to
> _"is it ready?"_ and is verified feature-by-feature against the code
> (2026-07-30), not aspirational claims. Authoritative trackers: the `FA-*`
> security registry (`docs/audits/2026-07-02-full-audit.md`), the hardening
> backlog (`docs/backlog/2026-07-post-audit-hardening.md`), the roadmap
> (`docs/roadmap.md`), and `CHANGELOG.md`. Project history lives in the
> per-phase closure reports under `docs/audits/` and the git log — it is no
> longer inlined here.

## Is it ready?

**Functional for early pilots with support; not yet production-grade by
municipal procurement standards; expect breaking changes through v0.3.x.**

The core is real and tested end-to-end: record management, Git-backed
versioning, a genuinely robust saga/transaction layer with crash recovery,
role-based auth, the REST API, the CLI, and the web UI. Several advanced areas
are **partial or stubbed** — the workflow _engine_, non-GeoJSON geography, cloud
storage providers, and multi-channel notifications. Those are named plainly
below; nothing important is hidden behind a green checkmark.

**At a glance**

- **Version:** v0.2.0 (Alpha) · **License:** MIT
- **Stack:** TypeScript / Node, pnpm monorepo, Nuxt 4 + `@nuxt/ui` v4 (MIT),
  SQLite, Git (`simple-git`), Markdown / YAML / JSON / GeoJSON
- **Engines:** node ≥ 22, pnpm ≥ 9 (`packageManager: pnpm@9.15.9`)
- **Tests:** ~265 test files (~2,500 cases) run in parallel in CI; required
  checks `build-test` + `audit-truth-check`; `main` is branch-protected
- **Live demo:** <https://demo.civicpress.io>

## What works today

Legend — **Working**: implemented and tested. **Partial**: the core works with
named gaps. **Stub/Planned**: advertised but not yet functional.

| Area                             | Status      | Honest notes                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Records & Git versioning         | **Working** | Markdown-on-disk is the source of truth, mirrored to SQLite; every op is a real git commit. Full saga pipeline (create/update/publish) with crash recovery.                                                                                                                                                                                                                                                                       |
| Editorial workflow & drafts      | **Working** | `record_drafts` staging table (DB-only); `workflowState` cleared on publish; status/transition validation via `WorkflowConfigManager` (draft→…→archived).                                                                                                                                                                                                                                                                         |
| Workflow _engine_ (programmable) | **Partial** | Only one real built-in workflow (`update-index`, wired via hooks in core-002); the old approval/publication/archival stubs were removed. User `.js` workflows are spec-only (no loader/sandbox exists).                                                                                                                                                                                                                           |
| Search                           | **Working** | Real SQLite **FTS5** + BM25 ranking, snippets, facets, autocomplete. Caveat: "typo tolerance" only re-ranks substring title suggestions, not the main query; no `field:value` syntax.                                                                                                                                                                                                                                             |
| Indexing                         | **Working** | `generateIndexes` (global + per-module `index.yml`, optional DB sync with conflict strategies), single-flight guarded.                                                                                                                                                                                                                                                                                                            |
| Geography                        | **Partial** | **GeoJSON** only — KML / GPX / Shapefile appear in the type enums but throw "not yet implemented". Leaflet map + CRUD + presets work; the DB mirror is write-only.                                                                                                                                                                                                                                                                |
| Storage                          | **Partial** | Local FS provider works and is tested. S3 / GCS / Azure provider ops + init are covered against a **mocked SDK boundary** (no live-cloud integration test). Both the API and CLI apply `storage.yml` (provider selection + `global.*` tuning).                                                                                                                                                                                    |
| Backup / restore                 | **Working** | Real `tar.gz` create + extract round-trip, SHA-256 verified. Backs up local-provider bytes only; the git-bundle path is untested.                                                                                                                                                                                                                                                                                                 |
| Notifications                    | **Partial** | One real email channel wired into the account-verification flow — but **off by default**. Channel failures are reported truthfully (a real SMTP error is recorded as a failed send). SMS/Slack are config-only. Mostly scaffold.                                                                                                                                                                                                  |
| REST API                         | **Working** | 25 routers, standardized response envelope, real supertest coverage; helmet + rate-limit + fail-closed CORS + CSRF wired. Exactly 4 honest `501` stubs: `workflows`, `hooks`, `import`, `export`.                                                                                                                                                                                                                                 |
| CLI                              | **Working** | 31 commands (~74 subcommands), `withCli`/`--json` migration complete, envelope mirrors the API; 28/31 substantive. Shipped stubs: `auto-index` (mostly), `cache:list`, `notify:retry`, `init` PostgreSQL, `export --format pdf`.                                                                                                                                                                                                  |
| Web UI                           | **Working** | ~80–90% on core surfaces: records CRUD + CodeMirror editor, geography + Leaflet, 14/15 admin pages, auth (incl. self-service password reset), genuine EN/FR translation. Stubs: activity feed (config import/export now works — admin-only YAML-bundle round-trip, secrets excluded). Component tests cover the auth flow, the records editor/detail/list/edit pages, and the API-critical composables; no browser-e2e tests yet. |
| Realtime collaborative editing   | **Partial** | Yjs sync, Markdown writeback to draft, and snapshots work (CI-verified). Default-off. `onConnect` now enforces per-record **authorization** — it validates the session, confirms the record exists, and checks view permission, failing closed.                                                                                                                                                                                   |
| BroadcastBox (optional)          | **Working** | The strongest-verified module: ack-gated recording, a fail-closed redaction pipeline tested against **real ffmpeg** (published bytes proven black + silent in hidden windows), Ed25519 manifest verification, revocable enrollment. Transcription is delegated to `services/transcription`; the clerk-installable appliance image is out-of-repo.                                                                                 |
| Auth & security                  | **Working** | Roles (admin/clerk/public) via `userCan`, signed sessions + API keys with mandatory signatures, HKDF-derived scoped secrets, CSRF, login lockout, bcrypt-12 password policy — all tested end-to-end.                                                                                                                                                                                                                              |

## Security & quality posture

- **Audit:** the 2026-07-02 two-repo `FA-*` audit is **fully remediated** —
  every finding is closed or an explicit accepted-deferral (`FA-CLI-006`
  `--no-emoji`; `FA-API-019` CSRF non-session-binding). A follow-up sweep
  audited the five deferred carry-forward surfaces (no live vulnerabilities
  found) and applied Low defense-in-depth hardening.
- **Supply chain:** osv-scanner (PR diff-gate + weekly) and CodeQL SAST
  (report-only) run in CI; dependency advisories were remediated 94 → 2 (the
  residual two are a brace-expansion DoS not reachable from the request
  surface); a `SECURITY.md` disclosure policy is published.
- **Tests & CI:** ~265 test files (~2,500 cases) run green in parallel in CI.
  Honest coverage gaps: the auth-flow pages and editor composables have
  component tests, but there is no full editor-SFC mount and no browser-e2e
  layer; cloud storage providers are exercised only against a mocked SDK
  boundary (no live S3/GCS/Azure integration test).

## In progress / next (Roadmap-tier — need scoping)

- **`ui-003`** — public-read static **prerender (SSG)** for public record pages
  (crawlable, fast, no-JS). Explicitly **not live SSR** (decided against — the
  server never renders per request); the admin UI stays SPA. Coupled to the
  deployment model, so deferred to the "easy deployment" work.
- **Signed appliance image** — a reproducible, clerk-installable deploy image
  (`docker/` is currently empty).
- **Hardware / device-repo work** — capture decomposition + test coverage in the
  sibling BroadcastBox firmware repo.
- **Equity / i18n polish** and **device-repo branch protection** (admin).

## Known limitations & honest caveats

Beyond the **Partial/Stub** areas above, the notable ones a reader should know:

- **Notifications are email-only and off by default.** SMS/Slack are config-only
  scaffold. Channel failures are now reported truthfully — a real SMTP error is
  recorded as a failed send, not a success.
- **Cloud storage lacks a live-integration test.** The API and CLI both honor
  `storage.yml` (provider selection + `global.*` tuning), and S3/GCS/Azure
  provider ops + init are covered by 38 tests that mock the SDK boundary — but
  there is no test against real S3/GCS/Azure (or the real SDKs).
- **Workflow config over-advertises.** `hooks.yml` references `validate-record`
  and `notify-*` workflows that are not registered, so they are silently
  skipped.
- **Geography accepts only GeoJSON** despite KML/GPX/Shapefile appearing in the
  type enums.
- **The web UI has component tests for the auth flow + the API-critical
  composables** (record editor actions, lock, detail, CSRF, auth). Still
  missing: a full editor-SFC mount and a browser-e2e layer.

These are the current honest edges of an alpha, not blockers for a supported
pilot — but they should be closed (or scoped as accepted) before any
unsupervised production use.

## Project history

The v0.1.x foundation milestones, the 2026-05 manifesto-fit base refactor
(Phases 2a–2d plus the realtime, hardware-audit, and broadcast-box reintegration
phases), and the 2026-07 post-audit-hardening arc (PRs #19–#22 on `main`, plus
the develop-pending security-tail + doc reconciliation) are recorded in the
per-phase closure reports under `docs/audits/`, in `CHANGELOG.md`, and in the
git history. This file previously inlined ~800 lines of that phase-tracking; it
now points to those dated records instead.

---

**Website:** [civicpress.io](https://civicpress.io) · **Contact:**
[hello@civicpress.io](mailto:hello@civicpress.io) · **License:** MIT
