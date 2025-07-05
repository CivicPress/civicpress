# 📚 CivicPress Spec: `README.md`

---
version: 1.0.0
status: stable
created: '2025-07-03'
updated: '2025-07-15'
deprecated: false
sunset_date: null
additions:

- comprehensive spec documentation
- organization structure
- cross-references
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

Provide an organized index and overview of all CivicPress specifications,
enabling developers, contributors, and stakeholders to quickly find and
understand the relevant documentation for their needs.

## 🧩 Scope & Responsibilities

✅ Responsibilities:

- Organize specs by category and priority
- Provide clear navigation and cross-references
- Maintain consistent structure and formatting
- Enable quick discovery of relevant documentation

❌ Out of Scope:

- Detailed spec content (handled by individual spec files)
- Implementation details (handled by code documentation)

---

## 📋 Specifications

CivicPress specifications are organized into the following categories:

### 🔐 Core System

- [`manifest.md`](./manifest.md) — CivicPress manifest and configuration
- [`auth.md`](./auth.md) — Authentication and identity management
- [`permissions.md`](./permissions.md) — User roles and permissions
- [`git-policy.md`](./git-policy.md) — Git-based governance and policies
- [`workflows.md`](./workflows.md) — Civic workflow management
- [`hooks.md`](./hooks.md) — Event hooks and automation

### 📊 Version Management

- [`spec-versioning.md`](./spec-versioning.md) — Specification versioning and
  change management
- [`version-tracker.md`](./version-tracker.md) — Version tracking and dependency
  management

### 🧩 Plugin System

- [`plugins.md`](./plugins.md) — Plugin architecture and capabilities
- [`plugin-api.md`](./plugin-api.md) — Plugin API interfaces and lifecycle
- [`plugin-development.md`](./plugin-development.md) — Plugin development
  workflow and best practices

### 🧪 Testing & Quality

- [`testing-framework.md`](./testing-framework.md) — Comprehensive testing
  standards and tools

### 🔒 Security & Compliance

- [`security.md`](./security.md) — Security architecture and best practices
- [`backup.md`](./backup.md) — Backup and disaster recovery
- [`storage.md`](./storage.md) — Data storage and management

### 🎨 User Experience

- [`ui.md`](./ui.md) — User interface and interaction design
- [`accessibility.md`](./accessibility.md) — Accessibility standards and
  guidelines
- [`themes.md`](./themes.md) — Theme system and customization
- [`translations.md`](./translations.md) — Internationalization and localization

### 📊 Data & Records

- [`public-data-structure.md`](./public-data-structure.md) — Public data
  organization and structure
- [`records-validation.md`](./records-validation.md) — Record validation and
  integrity
- [`indexing.md`](./indexing.md) — Data indexing and search optimization
- [`search.md`](./search.md) — Search functionality and algorithms

### ⚙️ System & Infrastructure

- [`api.md`](./api.md) — API design and endpoints
- [`cli.md`](./cli.md) — Command-line interface and tools
- [`deployment.md`](./deployment.md) — Deployment and infrastructure
- [`scheduler.md`](./scheduler.md) — Task scheduling and automation

### 📚 Additional Resources

- [`glossary.md`](./glossary.md) — Key terms and definitions
- [`legal-register.md`](./legal-register.md) — Legal document management
- [`archive-policy.md`](./archive-policy.md) — Data archiving and retention
- [`status-tags.md`](./status-tags.md) — Status tracking and workflow states
- [`notifications.md`](./notifications.md) — Notification system and channels
- [`observability.md`](./observability.md) — Monitoring and observability
- [`database.md`](./database.md) — Database design and management
- [`users.md`](./users.md) — User management and profiles
- [`moderation.md`](./moderation.md) — Content moderation and governance
- [`scheduler.md`](./scheduler.md) — Task scheduling and automation

---

## 🔗 Related Specs

- [`spec-versioning.md`](./spec-versioning.md) — Version management system
- [`version-tracker.md`](./version-tracker.md) — Version tracking and
  dependencies

---

## 📅 History

- Drafted: 2025-07-03
- Last updated: 2025-07-15
