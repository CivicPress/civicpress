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
# Format code
pnpm run format

# Check formatting
pnpm run format:check
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

## 🔗 Resources

- [Full Manifesto](https://github.com/CivicPress/manifesto/blob/master/manifesto.md)
- [Community Guidelines](CODE_OF_CONDUCT.md)

## 🙏 Acknowledgments

CivicPress is built for the public good, by the public, for the public. Thank
you to all contributors and supporters who believe in transparent, accessible
civic technology.

---

**Built with ❤️ for better governance**
