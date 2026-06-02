# CivicPress Roadmap

_A unified, authoritative roadmap for CivicPress, guiding the project from early
alpha toward a stable, production-grade civic infrastructure platform._

**Current Version:** v0.2.0 (Alpha)
**Status:** v0.2.0 shipped; **post-audit base refactor in progress** (2026-05-28 snapshot). Phase 2a merged to local `main`; Phase 2b + 2c + 2c.5 + 2d merged to local `dev`. **Phase 2d-followup `ui-002` v3→v4 migration closed 2026-05-28** on `refactor/ui-002-nuxt-ui-v4-migration` (local-only; v4 was a near-drop-in for our usage, +2 original-205 findings closed: ui-002 + deps-009). **66 of 205 original audit findings closed (32%) + 47 refactor-surfaced closures = 113 total measurable progress items.** After ui-002: Phase 3 (realtime, Yjs-only) is next per the master plan, then Phase 4 (hardware audit) and Phase 5 (broadcast-box reintegration). v0.3.x scope rebalanced to follow the refactor master plan at `docs/plans/2026-05-17-base-refactor-master-plan.md`. See `docs/audits/2026-05-16-manifesto-fit-findings.md` for the full registry and the per-phase closure reports under `docs/audits/`.

---

# 0. Completed Milestones (v0.1.x)

These milestones represent the foundation of CivicPress and validate the early
architecture, core concepts, and overall feasibility of the platform.

### Core Platform

- Core schema for civic records (bylaws, minutes, geography, metadata)
- Unified file + attachment system with UUID storage
- Demo datasets (Springfield, VA and Richmond, QC - demo datasets)
- Markdown-based durable documents with Git-compatible structure
- Geography and zoning layers (GeoJSON) integrated into records

### API & Backend

- Fully functional REST API
- Authentication (email-based), roles groundwork
- Backup/restore engine with compressed snapshots
- Indexing pipeline for metadata + content
- Storage abstraction prepared for local and S3
- CLI initialization commands (`civic init`, demo setups) created

### UI & Frontend

- Complete read/write UI
- Record viewer, editor, lists, uploads
- i18n support (EN/FR)
- Static rendering pipeline for public demos

### DevOps & Demo Environment

- Full deployment of **<https://demo.civicpress.io>**
- EC2-based hosting with Nginx reverse proxy
- Automated build + prerender pipeline for UI
- Structured project documentation created

These achievements conclude the "Shadow Town Demo" milestone and establish the
technical baseline for the next phases.

---

# 1. Vision

CivicPress aims to become a modern, open, transparent operating system for local
governance. It provides municipalities with durable public records, structured
workflows, and accessible tools built on open standards.

This roadmap outlines the path toward v1.0.0, with milestones that balance
technical maturity, clerk usability, municipal trust, and long-term
sustainability.

---

# 2. Roadmap Overview

The development path is organized into the following major phases:

- **v0.2.x — Core Maturity and Stability**
- **v0.3.x — Editor, Attachments, and Civic UX**
- **v0.4.x — Workflow Engine + Permissions**
- **v0.5–0.8 — Municipal Pilot Readiness**
- **v0.9 — Production Candidate**
- **v1.0 — Stable Release**

Each phase includes objectives and expected deliverables.

---

# 3. v0.2.x — Core Maturity and Stability 🟡 SHIPPED — refactor in progress

**Focus:** Indexing, search, architecture cleanup, reliability improvements.

**Status:** v0.2.0 shipped 2025-01-30. The 2026-05 manifesto-fit audit identified gaps (20 Critical findings) that were aspirational in earlier marks of "complete." Phase 2a of the post-audit refactor (2026-05-17) closed 18 findings; Phase 2b — Truth Restoration — is in progress. **Some items previously marked ✅ here were aspirational** — see the audit findings registry for the gap.

### Goals (audited 2026-05)

- Improve search performance and indexing logic ✅ (Search V2 implemented with
  FTS5)
- Refine record schema validation ✅ (Comprehensive JSON Schema validation with
  AJV, business rule validation, comprehensive documentation)
- Enhance storage abstraction layer (additional providers, performance
  optimizations) ✅ (Google Cloud Storage provider added; failover, retry,
  circuit breaker, and metrics integrated). 🟡 Quota enforcement was specified
  but not wired in v0.2.0 — closed in Phase 2a (storage-001).
- Add CLI improvements (diagnostics, repair, validation) ✅ (Diagnostics with
  --fix flag provides repair functionality, validation command implemented).
  🟡 CLI test coverage claim ("120+ / 95%") was unsubstantiated — `cli-001`
  in the registry; honest counts in `docs/project-status.md`. Phase 2b
  Tasks 10+11 add real Tier 1/2 CLI tests.
- Improve error handling and logs ✅ (Unified error handling system implemented
  with type-safe error hierarchy, correlation IDs, and comprehensive test
  coverage)
- Polish UI navigation and list views ✅ (Page-based pagination, improved search
  UX, sort options API implemented). 🟡 UI **component test coverage** (~0% in
  v0.2.0) was overclaimed at "80+ tests / 85%" — `ui-005` in the registry;
  Phase 2b Tasks 8+9 add Tier 1/2 component tests.
- Add basic documentation for architecture ✅ (Comprehensive architecture.md
  with 1,600+ lines, ADRs, visual diagrams, and related documentation)

**Note:** Basic storage abstraction (local, S3, Azure) was already implemented
(v0.1.x). This phase focused on enhancements and additional providers.

### Deliverables (audited 2026-05)

- ✅ API responses (Phase 2a Task 3 demoted 4 stub routers to 501 to match
  reality; `api-004`)
- ✅ Reliable local storage and backup
- ✅ Improved demo dataset tooling
- ✅ Indexed civic records (searchable by metadata and content)
- 🟡 Security system (SecretsManager, CSRF Protection landed; 2026-05 audit
  identified 20 Critical issues — 15 closed in Phase 2a including
  XSS-via-record sanitization (`ui-001`), auth-gate enforcement
  (`api-001/2/3`), truthful notification audit log (`notifications-001`),
  storage quotas (`storage-001`), public-folder bypass (`storage-002`)).
  Trust-restored; not yet enterprise-grade.
- ✅ Comprehensive architecture documentation with visual diagrams

---

# 4. v0.3.x — Editor, Attachments, Civic UX, and Refactor Completion

**Focus:** Improve clerk-facing daily usability and make the platform visually
compelling for demonstrations and municipal outreach. **Couples with the
post-audit base refactor** (Phases 2b → 2c → 2d → 3 of the master plan):
truth-restored docs, foundation cleanup, structural hardening, and a clean
reintroduction of realtime collaboration. By the time v0.3.x ships, every
spec under `docs/specs/` should match implementation reality (per
`docs/audits/spec-stability-triage.md`).

### Goals

- Introduce a richer Markdown editor
- Enhance attachments system (drag-and-drop uploads, bulk operations, file
  previews)
- Improve geography UI tools
- Improve record linking UX (bylaws referencing amendments, amendments linking
  to parent bylaws, etc.)
- Expand i18n (UI + metadata)

### Deliverables

- Editor suitable for daily clerk operations
- Enhanced attachments with drag-and-drop and improved file viewer
- More intuitive geography tools
- Polished multilingual UI suitable for municipal demos

**Note:** Basic attachments system is already implemented (v0.1.x). This phase
focuses on UX enhancements.

---

# 5. v0.4.x — Workflow Engine + Permissions

**Focus:** Enhance workflows and permissions with advanced features and UI
integration.

### Goals

- Enhance workflow UI integration (visual workflow states, transition buttons)
- Improve role-based permissions UI and management
- Add comprehensive audit logs for actions
- Enhance hooks/events system for advanced module extensibility
- Improve workflow status visibility in API responses
- Advanced workflow features (conditional transitions, multi-step approvals)

### Deliverables

- Enhanced workflow system with improved UI
- Advanced permissions management interface
- Comprehensive audit trail UI
- Foundation for future collaborative editing

**Note:** Basic workflow engine and permissions are already implemented
(v0.1.x). This phase focuses on UI integration and advanced features.

---

# 6. v0.5–0.8 — Municipal Pilot Readiness

**Focus:** Make CivicPress usable by real municipalities.

### Goals

- Build a migration/import tool for bylaws and minutes
- Add configurable templates for record types
- Add municipal profiles (branding, contact info, languages)
- Improve public search interface
- Add printable versions of records (PDF export)
- Add dashboard for clerks
- Write municipal documentation and onboarding guide
- Provide backup/restore reliability

### Deliverables

- Pilot-ready CivicPress instance
- Training materials for clerks
- Import pipelines for legacy documents
- Reliable uptime and backup strategy

---

# 7. v0.9 — Production Candidate

**Focus:** Final stabilization, performance, and security hardening.

### Goals

- Performance tuning (API and UI)
- Security review (authentication, access control, file handling)
- Documentation freeze for v1.0
- Accessibility audit (WCAG compliance)
- Public API stability guarantees
- Integrations with external systems (where applicable)

### Deliverables

- Stable production candidate
- Hardened deployment templates
- Verified accessibility compliance

---

# 8. v1.0 — Stable Release

**Focus:** Deliver a dependable, modern, open-source civic platform.

### Goals

- Fully stable API and UI
- Cross-module stability
- Documentation for municipalities, developers, and contributors
- Proven deployments
- Governance and long-term support model in place

### Deliverables

- CivicPress v1.0
- Reference deployments
- Established governance process
- Long-term roadmap for v2.0 and beyond

---

# 9. Long-Term Vision (Beyond v1.0)

These features represent strategic, high-impact capabilities that extend
CivicPress toward full digital governance infrastructure.

### Advanced Governance & Decision-Making

- Voting module with digital signatures
- Decision workflows (e.g., resolutions, motions)
- Multi-step inter-town and MRC-level approvals

### Transparency & Public Access

- Public API key registry
- Web archiving tools (WARC export)
- Automatic public change history for records
- Public dashboards for civic KPIs

### Documents & Publishing

- High-quality PDF/print generation
- Redaction tools for sensitive information
- Auto-generated agendas and packets
- Automated cross-linking of related records

### Intelligence & Automation

- AI-assisted search, summarization, and classification (fully logged and
  explainable)
- Smart visualizations for data-rich records (budgets, zoning, statistics)
- Predictive compliance checks (e.g., zoning conflicts)

### Architecture & Scale

- Hosted multi-tenant version (if community governance approves)
- Git federation for inter-municipal collaboration
- Full offline-first deployments for remote communities
- Distributed backup & archival nodes

---

# 10. Refactor truth meter

Per the master plan's "make truth true again" spine, every refactor sub-phase
ships its truth meter:

| Phase | Findings closed | Findings deferred (with target phase) |
|---|---|---|
| 2a Bleed-Stop | 18 (15 Critical + 3 High) | 4 Critical pending (broadcast-box-002/007 → Phase 5; BB-HW-001/3 → Phase 4) — ~~ui-002~~ closed 2026-05-28 on 2d-followup |
| 2b Truth Restoration | 9 (legal-register-001/006, notifications-007, site-001/003, BB-HW-008, ui-005, cli-001, site-002 → wontfix-by-phase) + 6 surfaced closures | spec-frontmatter sweep demoted 39 of 61 stable-claiming specs to honest `partial`/`planned` |
| 2c Foundation Cleanup | 17 (core-001/4/5/6/10/13, api-008, storage-003/4/9, notifications-005/6/8/13, plus realtime-007/8 → Phase 3, BB-003 → Phase 4/5, BB-013 → Phase 5) + 4 Phase-2c.5-surfaced | _closed 2026-05-19; report at `docs/audits/phase-2c-closure-report.md`_ |
| 2d Structural Hardening | **13** (W1: legal-register-002/005; W2: core-008/api-013/ui-008; W3: api-009/ui-011/storage-015; W4: storage-006/deps-008/api-007/deps-010/deps-011) + 9 W0-surfaced + 21 W2-decomp + 6 W3-latent-bugs | _closed 2026-05-25; report at `docs/audits/phase-2d-closure-report.md`._ Carry-forwards still pending: realtime-012 → Phase 3. ~~Lint-rule rollout (dedicated session)~~ closed 2026-06-02 (merge `656adb5`). |
| 2d-followup ui-002 | 2 (ui-002 + deps-009) + 1 Phase-2d-W4-T2-root-audit-gap surfaced (closed by `a92b842`) | _closed 2026-05-28; commit `ec5a9a0` on `refactor/ui-002-nuxt-ui-v4-migration`._ Migrated paid `@nuxt/ui-pro` v3 + free `@nuxt/ui` v3 → MIT `@nuxt/ui` v4.8.0 (single package). Near-drop-in upgrade; only real source change was the `ui.theme.colors` useHead workaround removal (`cd725d5`). |
| 2d-followup lint-rule-rollout | Phase 2d W3-T6 — `@typescript-eslint/no-explicit-any: error` enforced across 5 workspaces; baseline 1,488 errors → 0 | _closed 2026-06-02; merge `656adb5` on local `dev`._ Followups deferred (see `lint-rollout-2026-06-02-followups` memory): unused-vars cleanup (~600), vue-template explicit-any blind spot, modules/ui cruft deps, ~30 vue/nuxt style rules. |
| 3 Reintroduce realtime | _next phase_ | _pending_ |
| 4 Audit + fix broadcast-box hardware | _pending_ | _pending_ |
| 5 Reintroduce broadcast-box to monorepo | _pending_ | _pending_ |

**Cumulative (end of Phase 2d):** 64 of 205 original-audit findings closed (31%). Plus 46 refactor-surfaced closures (separately tracked) for 110 total measurable progress items.

See `docs/audits/2026-05-16-manifesto-fit-findings.md` for the per-finding
tracker (Status column on every finding row); each closure includes a commit
SHA per the finding-tracking convention (`docs/plans/finding-tracking-convention.md`).

---

# 11. Staying Up to Date

This roadmap will evolve as:

- municipalities begin pilot projects
- contributors join the project
- feedback and civic needs shape priorities
- the post-2026-05 refactor lands its phases

For contributions or roadmap suggestions:
Contact: **<hello@civicpress.io>**
