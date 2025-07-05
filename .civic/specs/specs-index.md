# 📚 CivicPress Spec: `specs-index.md`

---
version: 1.0.0
status: stable
created: '2025-07-03'
updated: '2025-07-15'
deprecated: false
sunset_date: null
breaking_changes: []
additions:

- comprehensive spec index
- categorized organization
- navigation structure
fixes: []
migration_guide: null
compatibility:
  min_civicpress: 1.0.0
  max_civicpress: 'null'
  dependencies: []
authors:
- Sophie Germain <sophie@civic-press.org>
reviewers:
- Ada Lovelace
- Irène Joliot-Curie

---

## 📛 Name

CivicPress Specifications Index

## 🎯 Purpose

This index provides a comprehensive overview of all CivicPress specification documents, organized by category for easy navigation and discovery.

## 🧩 Scope & Responsibilities

✅ Responsibilities:

- Provide comprehensive index of all CivicPress specifications
- Organize specs by functional categories
- Enable easy navigation and discovery
- Maintain version and status information
- Support quick reference and cross-linking

❌ Out of Scope:

- Detailed spec content (see individual spec files)
- Implementation details
- Change management (see spec-versioning.md)

## 🔧 Core System Specs

| Spec | Version | Status | Description |
|------|---------|--------|-------------|
| [`manifest.md`](./manifest.md) | `1.0.0` | `stable` | CivicPress repository manifest and configuration |
| [`auth.md`](./auth.md) | `1.0.0` | `stable` | Authentication and authorization system |
| [`permissions.md`](./permissions.md) | `1.0.0` | `stable` | Role-based access control and permissions |
| [`users.md`](./users.md) | `1.0.0` | `stable` | User accounts and role management |
| [`git-policy.md`](./git-policy.md) | `1.0.0` | `stable` | Git-based workflow and version control |

## 🏗️ Architecture & API Specs

| Spec | Version | Status | Description |
|------|---------|--------|-------------|
| [`api.md`](./api.md) | `1.0.0` | `stable` | REST API design and endpoints |
| [`cli.md`](./cli.md) | `1.0.0` | `stable` | Command-line interface and tools |
| [`frontend.md`](./frontend.md) | `1.0.0` | `stable` | Frontend architecture and patterns |
| [`ui.md`](./ui.md) | `1.0.0` | `stable` | User interface architecture and components |
| [`module-api.md`](./module-api.md) | `1.0.0` | `stable` | Module system API and interfaces |

## 🔌 Plugin System Specs

| Spec | Version | Status | Description |
|------|---------|--------|-------------|
| [`plugins.md`](./plugins.md) | `1.0.0` | `stable` | Plugin system architecture and capabilities |
| [`plugin-api.md`](./plugin-api.md) | `1.0.0` | `stable` | Plugin API interfaces and development |
| [`plugin-development.md`](./plugin-development.md) | `1.0.0` | `stable` | Plugin development guidelines and tools |

## 🔄 Workflow & Process Specs

| Spec | Version | Status | Description |
|------|---------|--------|-------------|
| [`workflows.md`](./workflows.md) | `1.0.0` | `stable` | Workflow engine and event processing |
| [`hooks.md`](./hooks.md) | `1.0.0` | `stable` | Event hooks and system integration |
| [`lifecycle.md`](./lifecycle.md) | `1.0.0` | `stable` | Record lifecycle and state management |
| [`scheduler.md`](./scheduler.md) | `1.0.0` | `stable` | Task scheduling and automation |

## 📊 Data & Records Specs

| Spec | Version | Status | Description |
|------|---------|--------|-------------|
| [`public-data-structure.md`](./public-data-structure.md) | `1.0.0` | `stable` | Public data organization and structure |
| [`records-validation.md`](./records-validation.md) | `1.0.0` | `stable` | Record validation and integrity |
| [`indexing.md`](./indexing.md) | `1.0.0` | `stable` | Search indexing and metadata |
| [`search.md`](./search.md) | `1.0.0` | `stable` | Search functionality and algorithms |
| [`database.md`](./database.md) | `1.0.0` | `stable` | Database schema and operations |

## 🔐 Security & Compliance Specs

| Spec | Version | Status | Description |
|------|---------|--------|-------------|
| [`security.md`](./security.md) | `1.0.0` | `stable` | Security policies and practices |
| [`audit.md`](./audit.md) | `1.0.0` | `stable` | Audit logging and compliance |
| [`signatures.md`](./signatures.md) | `1.0.0` | `stable` | Digital signatures and verification |
| [`backup.md`](./backup.md) | `1.0.0` | `stable` | Backup and disaster recovery |
| [`storage.md`](./storage.md) | `1.0.0` | `stable` | Data storage and persistence |

## 🎨 User Experience Specs

| Spec | Version | Status | Description |
|------|---------|--------|-------------|
| [`accessibility.md`](./accessibility.md) | `1.0.0` | `stable` | Accessibility standards and compliance |
| [`branding.md`](./branding.md) | `1.0.0` | `stable` | Visual identity and branding |
| [`themes.md`](./themes.md) | `1.0.0` | `stable` | Theme system and customization |
| [`translations.md`](./translations.md) | `1.0.0` | `stable` | Internationalization and localization |
| [`printable.md`](./printable.md) | `1.0.0` | `stable` | Print-friendly layouts and formats |

## 🚀 Deployment & Operations Specs

| Spec | Version | Status | Description |
|------|---------|--------|-------------|
| [`deployment.md`](./deployment.md) | `1.0.0` | `stable` | Deployment strategies and environments |
| [`serve.md`](./serve.md) | `1.0.0` | `stable` | Static file serving and hosting |
| [`static-export.md`](./static-export.md) | `1.0.0` | `stable` | Static site generation and export |
| [`maintenance.md`](./maintenance.md) | `1.0.0` | `stable` | System maintenance and updates |

## 📋 Documentation & Standards Specs

| Spec | Version | Status | Description |
|------|---------|--------|-------------|
| [`spec-guidelines.md`](./spec-guidelines.md) | `1.0.0` | `stable` | Specification format and standards |
| [`spec-versioning.md`](./spec-versioning.md) | `1.0.0` | `stable` | Specification versioning and change management |
| [`version-tracker.md`](./version-tracker.md) | `1.0.0` | `stable` | Version tracking and dependency management |
| [`glossary.md`](./glossary.md) | `1.0.0` | `stable` | Terminology and definitions |

## 🧪 Testing & Quality Specs

| Spec | Version | Status | Description |
|------|---------|--------|-------------|
| [`testing-framework.md`](./testing-framework.md) | `1.0.0` | `stable` | Testing standards and frameworks |
| [`data-integrity.md`](./data-integrity.md) | `1.0.0` | `stable` | Data integrity and validation |

## 📈 Monitoring & Analytics Specs

| Spec | Version | Status | Description |
|------|---------|--------|-------------|
| [`metrics.md`](./metrics.md) | `1.0.0` | `stable` | Metrics collection and analytics |
| [`observability.md`](./observability.md) | `1.0.0` | `stable` | System observability and monitoring |
| [`activity-log.md`](./activity-log.md) | `1.0.0` | `stable` | Activity logging and tracking |

## 🏛️ Civic Functionality Specs

| Spec | Version | Status | Description |
|------|---------|--------|-------------|
| [`legal-register.md`](./legal-register.md) | `1.0.0` | `stable` | Legal document management |
| [`feedback.md`](./feedback.md) | `1.0.0` | `stable` | Public feedback and comments |
| [`votes.md`](./votes.md) | `1.0.0` | `stable` | Voting systems and processes |
| [`notifications.md`](./notifications.md) | `1.0.0` | `stable` | Notification systems |
| [`moderation.md`](./moderation.md) | `1.0.0` | `stable` | Content moderation |
| [`review-policy.md`](./review-policy.md) | `1.0.0` | `stable` | Review and approval processes |
| [`archive-policy.md`](./archive-policy.md) | `1.0.0` | `stable` | Record archiving and retention |
| [`status-tags.md`](./status-tags.md) | `1.0.0` | `stable` | Status tracking and tags |
| [`timeline.md`](./timeline.md) | `1.0.0` | `stable` | Timeline and history tracking |

## 🔧 Development & Tools Specs

| Spec | Version | Status | Description |
|------|---------|--------|-------------|
| [`editor-layer.md`](./editor-layer.md) | `1.0.0` | `stable` | Content editing interface |
| [`onboarding.md`](./onboarding.md) | `1.0.0` | `stable` | User onboarding and training |
| [`roles.yml.md`](./roles.yml.md) | `1.0.0` | `stable` | Role definitions and configuration |
| [`versioning.md`](./versioning.md) | `1.0.0` | `stable` | Content versioning system |

---

## 📊 Summary Statistics

- **Total Specs**: 50+
- **Stable Specs**: 50+
- **Draft Specs**: 0
- **Deprecated Specs**: 0

## 🔗 Quick Navigation

- **Getting Started**: [`manifest.md`](./manifest.md), [`auth.md`](./auth.md), [`permissions.md`](./permissions.md)
- **Development**: [`plugins.md`](./plugins.md), [`workflows.md`](./workflows.md), [`testing-framework.md`](./testing-framework.md)
- **Deployment**: [`deployment.md`](./deployment.md), [`serve.md`](./serve.md), [`security.md`](./security.md)
- **Standards**: [`spec-guidelines.md`](./spec-guidelines.md), [`spec-versioning.md`](./spec-versioning.md)

---

## 📅 Last Updated

2025-07-15

## 📅 History

- Drafted: 2025-07-03
- Updated: 2025-07-15 - Added comprehensive categorization and navigation structure
