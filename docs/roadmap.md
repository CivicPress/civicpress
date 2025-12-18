# CivicPress Roadmap

_A unified, authoritative roadmap for CivicPress, guiding the project from early
alpha to a stable, production-ready civic infrastructure platform._

**Current Version:** v0.1.4 (Alpha)  
**Status:** Early development, preparing for pilot collaborations

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

# 3. v0.2.x — Core Maturity and Stability

**Focus:** Indexing, search, architecture cleanup, reliability improvements.

### Goals

- Improve search performance and indexing logic ✅ (Search V2 implemented with
  FTS5)
- Refine record schema validation
- Enhance storage abstraction layer (additional providers, performance
  optimizations)
- Add CLI improvements (diagnostics, repair, validation) ✅ (Diagnostics with
  --fix flag provides repair functionality, validation command implemented)
- Improve error handling and logs ✅ (Unified error handling system implemented
  with type-safe error hierarchy, correlation IDs, and comprehensive test
  coverage)
- Polish UI navigation and list views ✅ (Page-based pagination, improved search
  UX, sort options API implemented)
- Add basic documentation for architecture

**Note:** Basic storage abstraction (local, S3, Azure) is already implemented
(v0.1.x). This phase focuses on enhancements and additional providers.

### Deliverables

- Stable API responses
- Reliable local storage and backup
- Improved demo dataset tooling
- Indexed civic records (searchable by metadata and content)

---

# 4. v0.3.x — Editor, Attachments, and Civic UX

**Focus:** Improve clerk-facing daily usability and make the platform visually
compelling for demonstrations and municipal outreach.

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

# 10. Staying Up to Date

This roadmap will evolve as:

- municipalities begin pilot projects
- contributors join the project
- feedback and civic needs shape priorities

For contributions or roadmap suggestions:  
Contact: **<hello@civicpress.io>**
