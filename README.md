# 🌱 CivicPress

> **Public infrastructure platform designed to bring transparency,
> participation, and trust back to local governance.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.11.1-brightgreen.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-workspace-blue.svg)](https://pnpm.io/)

## 🎯 Mission

CivicPress exists to replace opaque, expensive, and fragile government IT
systems with open, modular, Git-native civic software that is accessible,
auditable, and human-centered.

## 🌟 Core Principles

- **Transparency by default** — Government should work in daylight
- **Trust through traceability** — Every record, every change, every action is
  inspectable
- **Open-source and auditable** — No black boxes, no hidden logic
- **Equity and accessibility** — Built for everyone, not just the tech-savvy
- **Local-first resilience** — Works offline, in small towns, or at scale
- **Markdown as civic format** — Legible, versionable, future-proof civic
  records

## 🚀 Quick Start

### Prerequisites

- Node.js 20.11.1+ (see `.nvmrc`)
- pnpm (will be installed automatically)

### Installation

```bash
# Clone the repository
git clone https://github.com/CivicPress/civicpress.git
cd civicpress

# Run the setup script
./setup.sh

# Or manually install dependencies
pnpm install
```

### Development

```bash
# Install dependencies (if not already done)
pnpm install

# Format code
pnpm run format

# Check formatting
pnpm run format:check

# Validate specifications
pnpm run spec:validate

# Check spec dependencies
pnpm run spec:check-deps

# List all specs
pnpm run spec:list

# Run all spec checks
pnpm run spec:check
```

## 📁 Project Structure

```
civicpress/
├── .civic/          # CivicPress platform configuration
├── agent/           # Local AI memory used for dev context only — not deployed with the app
├── core/            # Core platform modules
├── modules/         # Civic modules (legal-register, etc.)
├── .vscode/         # Editor configuration
└── setup.sh         # Development environment setup
```

## 🧩 Architecture

CivicPress is built as a modular monorepo using pnpm workspaces:

- **Core Platform**: Foundational services and utilities
- **Civic Modules**: Specialized modules for different civic functions
- **Agent Context**: AI development memory and context (not deployed)

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md)
for details.

### Development Standards

- Follow the [Code of Conduct](CODE_OF_CONDUCT.md)
- Use conventional commits
- Ensure all code is formatted with Prettier
- Write clear, accessible documentation

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file
for details.

## 📋 Specifications

CivicPress specifications are organized into the following categories:

### 🔐 Core System

- [`manifest.md`](.civic/specs/manifest.md) — CivicPress manifest and
  configuration
- [`auth.md`](.civic/specs/auth.md) — Authentication and identity management
- [`permissions.md`](.civic/specs/permissions.md) — User roles and permissions
- [`git-policy.md`](.civic/specs/git-policy.md) — Git-based governance and
  policies
- [`workflows.md`](.civic/specs/workflows.md) — Civic workflow management
- [`hooks.md`](.civic/specs/hooks.md) — Event hooks and automation

### 📊 Version Management

- [`spec-versioning.md`](.civic/specs/spec-versioning.md) — Specification
  versioning and change management
- [`version-tracker.md`](.civic/specs/version-tracker.md) — Version tracking and
  dependency management

### 🧩 Plugin System

- [`plugins.md`](.civic/specs/plugins.md) — Plugin architecture and capabilities
- [`plugin-api.md`](.civic/specs/plugin-api.md) — Plugin API interfaces and
  lifecycle
- [`plugin-development.md`](.civic/specs/plugin-development.md) — Plugin
  development workflow and best practices

### 🧪 Testing & Quality

- [`testing-framework.md`](.civic/specs/testing-framework.md) — Comprehensive
  testing standards and tools

### 🔒 Security & Compliance

- [`security.md`](.civic/specs/security.md) — Security architecture and best
  practices
- [`backup.md`](.civic/specs/backup.md) — Backup and disaster recovery
- [`storage.md`](.civic/specs/storage.md) — Data storage and management

### 🎨 User Experience

- [`ui.md`](.civic/specs/ui.md) — User interface and interaction design
- [`accessibility.md`](.civic/specs/accessibility.md) — Accessibility standards
  and guidelines
- [`themes.md`](.civic/specs/themes.md) — Theme system and customization
- [`translations.md`](.civic/specs/translations.md) — Internationalization and
  localization

### 📊 Data & Records

- [`public-data-structure.md`](.civic/specs/public-data-structure.md) — Public
  data organization and structure
- [`records-validation.md`](.civic/specs/records-validation.md) — Record
  validation and integrity
- [`indexing.md`](.civic/specs/indexing.md) — Data indexing and search
  optimization
- [`search.md`](.civic/specs/search.md) — Search functionality and algorithms

### ⚙️ System & Infrastructure

- [`api.md`](.civic/specs/api.md) — API design and endpoints
- [`cli.md`](.civic/specs/cli.md) — Command-line interface and tools
- [`deployment.md`](.civic/specs/deployment.md) — Deployment and infrastructure
- [`scheduler.md`](.civic/specs/scheduler.md) — Task scheduling and automation

### 📚 Additional Resources

- [`glossary.md`](.civic/specs/glossary.md) — Key terms and definitions
- [`legal-register.md`](.civic/specs/legal-register.md) — Legal document
  management
- [`archive-policy.md`](.civic/specs/archive-policy.md) — Data archiving and
  retention
- [`status-tags.md`](.civic/specs/status-tags.md) — Status tracking and workflow
  states
- [`notifications.md`](.civic/specs/notifications.md) — Notification system and
  channels
- [`observability.md`](.civic/specs/observability.md) — Monitoring and
  observability
- [`database.md`](.civic/specs/database.md) — Database design and management
- [`users.md`](.civic/specs/users.md) — User management and profiles
- [`moderation.md`](.civic/specs/moderation.md) — Content moderation and
  governance
- [`scheduler.md`](.civic/specs/scheduler.md) — Task scheduling and automation

## 🔗 Resources

- [Full Manifesto](https://github.com/CivicPress/manifesto/blob/master/manifesto.md)
- [Community Guidelines](CODE_OF_CONDUCT.md)

## 🙏 Acknowledgments

CivicPress is built for the public good, by the public, for the public. Thank
you to all contributors and supporters who believe in transparent, accessible
civic technology.

---

**Built with ❤️ for better governance**
