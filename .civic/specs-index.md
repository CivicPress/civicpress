# 📚 CivicPress Spec: `specs-index.md`

---

version: 1.0.0 status: stable created: '2025-07-03' updated: '2025-07-15'
deprecated: false sunset_date: null breaking_changes: [] additions:

- comprehensive spec index
- categorized organization
- navigation structure fixes: [] migration_guide: null compatibility:
  min_civicpress: 1.0.0 max_civicpress: 'null' dependencies: [] authors:
- Sophie Germain <sophie@civic-press.org> reviewers:
- Ada Lovelace
- Irène Joliot-Curie

---

## 📛 Name

CivicPress Specifications Index

## 🎯 Purpose

This index provides a comprehensive overview of all CivicPress specification
documents, organized by category for easy navigation and discovery.

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

| Spec                                       | Version | Status   | Description                                      |
| ------------------------------------------ | ------- | -------- | ------------------------------------------------ |
| [`manifest.md`](./specs/manifest.md)       | `1.0.0` | `stable` | CivicPress repository manifest and configuration |
| [`auth.md`](./specs/auth.md)               | `1.0.0` | `stable` | Authentication and authorization system          |
| [`permissions.md`](./specs/permissions.md) | `1.0.0` | `stable` | Role-based access control and permissions        |
| [`users.md`](./specs/users.md)             | `1.0.0` | `stable` | User accounts and role management                |
| [`git-policy.md`](./specs/git-policy.md)   | `1.0.0` | `stable` | Git-based workflow and version control           |

## 🏗️ Architecture & API Specs

| Spec                                     | Version | Status   | Description                                |
| ---------------------------------------- | ------- | -------- | ------------------------------------------ |
| [`api.md`](./specs/api.md)               | `1.0.0` | `stable` | REST API design and endpoints              |
| [`cli.md`](./specs/cli.md)               | `1.0.0` | `stable` | Command-line interface and tools           |
| [`frontend.md`](./specs/frontend.md)     | `1.0.0` | `stable` | Frontend architecture and patterns         |
| [`ui.md`](./specs/ui.md)                 | `1.0.0` | `stable` | User interface architecture and components |
| [`module-api.md`](./specs/module-api.md) | `1.0.0` | `stable` | Module system API and interfaces           |

## 🔌 Plugin System Specs

| Spec                                                     | Version | Status   | Description                                 |
| -------------------------------------------------------- | ------- | -------- | ------------------------------------------- |
| [`plugins.md`](./specs/plugins.md)                       | `1.0.0` | `stable` | Plugin system architecture and capabilities |
| [`plugin-api.md`](./specs/plugin-api.md)                 | `1.0.0` | `stable` | Plugin API interfaces and development       |
| [`plugin-development.md`](./specs/plugin-development.md) | `1.0.0` | `stable` | Plugin development guidelines and tools     |

## 🔄 Workflow & Process Specs

| Spec                                   | Version | Status   | Description                           |
| -------------------------------------- | ------- | -------- | ------------------------------------- |
| [`workflows.md`](./specs/workflows.md) | `1.0.0` | `stable` | Workflow engine and event processing  |
| [`hooks.md`](./specs/hooks.md)         | `1.0.0` | `stable` | Event hooks and system integration    |
| [`lifecycle.md`](./specs/lifecycle.md) | `1.0.0` | `stable` | Record lifecycle and state management |
| [`scheduler.md`](./specs/scheduler.md) | `1.0.0` | `stable` | Task scheduling and automation        |

## 📊 Data & Records Specs

| Spec                                                           | Version | Status   | Description                            |
| -------------------------------------------------------------- | ------- | -------- | -------------------------------------- |
| [`public-data-structure.md`](./specs/public-data-structure.md) | `1.0.0` | `stable` | Public data organization and structure |
| [`records-validation.md`](./specs/records-validation.md)       | `1.0.0` | `stable` | Record validation and integrity        |
| [`indexing.md`](./specs/indexing.md)                           | `1.0.0` | `stable` | Search indexing and metadata           |
| [`search.md`](./specs/search.md)                               | `1.0.0` | `stable` | Search functionality and algorithms    |
| [`database.md`](./specs/database.md)                           | `1.0.0` | `stable` | Database schema and operations         |

## 🔐 Security & Compliance Specs

| Spec                                     | Version | Status   | Description                         |
| ---------------------------------------- | ------- | -------- | ----------------------------------- |
| [`security.md`](./specs/security.md)     | `1.0.0` | `stable` | Security policies and practices     |
| [`audit.md`](./specs/audit.md)           | `1.0.0` | `stable` | Audit logging and compliance        |
| [`signatures.md`](./specs/signatures.md) | `1.0.0` | `stable` | Digital signatures and verification |
| [`backup.md`](./specs/backup.md)         | `1.0.0` | `stable` | Backup and disaster recovery        |
| [`storage.md`](./specs/storage.md)       | `1.0.0` | `stable` | Data storage and persistence        |

## 🎨 User Experience Specs

| Spec                                           | Version | Status   | Description                            |
| ---------------------------------------------- | ------- | -------- | -------------------------------------- |
| [`accessibility.md`](./specs/accessibility.md) | `1.0.0` | `stable` | Accessibility standards and compliance |
| [`branding.md`](./specs/branding.md)           | `1.0.0` | `stable` | Visual identity and branding           |
| [`themes.md`](./specs/themes.md)               | `1.0.0` | `stable` | Theme system and customization         |
| [`translations.md`](./specs/translations.md)   | `1.0.0` | `stable` | Internationalization and localization  |
| [`printable.md`](./specs/printable.md)         | `1.0.0` | `stable` | Print-friendly layouts and formats     |

## 🚀 Deployment & Operations Specs

| Spec                                           | Version | Status   | Description                            |
| ---------------------------------------------- | ------- | -------- | -------------------------------------- |
| [`deployment.md`](./specs/deployment.md)       | `1.0.0` | `stable` | Deployment strategies and environments |
| [`serve.md`](./specs/serve.md)                 | `1.0.0` | `stable` | Static file serving and hosting        |
| [`static-export.md`](./specs/static-export.md) | `1.0.0` | `stable` | Static site generation and export      |
| [`maintenance.md`](./specs/maintenance.md)     | `1.0.0` | `stable` | System maintenance and updates         |

## 📋 Documentation & Standards Specs

| Spec                                               | Version | Status   | Description                                    |
| -------------------------------------------------- | ------- | -------- | ---------------------------------------------- |
| [`spec-guidelines.md`](./specs/spec-guidelines.md) | `1.0.0` | `stable` | Specification format and standards             |
| [`spec-versioning.md`](./specs/spec-versioning.md) | `1.0.0` | `stable` | Specification versioning and change management |
| [`version-tracker.md`](./specs/version-tracker.md) | `1.0.0` | `stable` | Version tracking and dependency management     |
| [`glossary.md`](./specs/glossary.md)               | `1.0.0` | `stable` | Terminology and definitions                    |

## 🧪 Testing & Quality Specs

| Spec                                                   | Version | Status   | Description                      |
| ------------------------------------------------------ | ------- | -------- | -------------------------------- |
| [`testing-framework.md`](./specs/testing-framework.md) | `1.0.0` | `stable` | Testing standards and frameworks |
| [`data-integrity.md`](./specs/data-integrity.md)       | `1.0.0` | `stable` | Data integrity and validation    |

## 📈 Monitoring & Analytics Specs

| Spec                                           | Version | Status   | Description                         |
| ---------------------------------------------- | ------- | -------- | ----------------------------------- |
| [`metrics.md`](./specs/metrics.md)             | `1.0.0` | `stable` | Metrics collection and analytics    |
| [`observability.md`](./specs/observability.md) | `1.0.0` | `stable` | System observability and monitoring |
| [`activity-log.md`](./specs/activity-log.md)   | `1.0.0` | `stable` | Activity logging and tracking       |

## 🏛️ Civic Functionality Specs

| Spec                                             | Version | Status   | Description                    |
| ------------------------------------------------ | ------- | -------- | ------------------------------ |
| [`legal-register.md`](./specs/legal-register.md) | `1.0.0` | `stable` | Legal document management      |
| [`feedback.md`](./specs/feedback.md)             | `1.0.0` | `stable` | Public feedback and comments   |
| [`votes.md`](./specs/votes.md)                   | `1.0.0` | `stable` | Voting systems and processes   |
| [`notifications.md`](./specs/notifications.md)   | `1.0.0` | `stable` | Notification systems           |
| [`moderation.md`](./specs/moderation.md)         | `1.0.0` | `stable` | Content moderation             |
| [`review-policy.md`](./specs/review-policy.md)   | `1.0.0` | `stable` | Review and approval processes  |
| [`archive-policy.md`](./specs/archive-policy.md) | `1.0.0` | `stable` | Record archiving and retention |
| [`status-tags.md`](./specs/status-tags.md)       | `1.0.0` | `stable` | Status tracking and tags       |
| [`timeline.md`](./specs/timeline.md)             | `1.0.0` | `stable` | Timeline and history tracking  |

## 🔧 Development & Tools Specs

| Spec                                         | Version | Status   | Description                        |
| -------------------------------------------- | ------- | -------- | ---------------------------------- |
| [`editor-layer.md`](./specs/editor-layer.md) | `1.0.0` | `stable` | Content editing interface          |
| [`onboarding.md`](./specs/onboarding.md)     | `1.0.0` | `stable` | User onboarding and training       |
| [`roles.yml.md`](./specs/roles.yml.md)       | `1.0.0` | `stable` | Role definitions and configuration |
| [`versioning.md`](./specs/versioning.md)     | `1.0.0` | `stable` | Content versioning system          |

---

## 📊 Summary Statistics

- **Total Specs**: 50+
- **Stable Specs**: 50+
- **Draft Specs**: 0
- **Deprecated Specs**: 0

## 🔗 Quick Navigation

- **Getting Started**: [`manifest.md`](./specs/manifest.md),
  [`auth.md`](./specs/auth.md), [`permissions.md`](./specs/permissions.md)
- **Development**: [`plugins.md`](./specs/plugins.md),
  [`workflows.md`](./specs/workflows.md),
  [`testing-framework.md`](./specs/testing-framework.md)
- **Deployment**: [`deployment.md`](./specs/deployment.md),
  [`serve.md`](./specs/serve.md), [`security.md`](./specs/security.md)
- **Standards**: [`spec-guidelines.md`](./specs/spec-guidelines.md),
  [`spec-versioning.md`](./specs/spec-versioning.md)

---

## 📅 Last Updated

2025-07-15

## 📅 History

- Drafted: 2025-07-03
- Updated: 2025-07-15 - Added comprehensive categorization and navigation
  structure
