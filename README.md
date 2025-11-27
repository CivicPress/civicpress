# CivicPress

_A modern, open-source platform for transparent, accountable, and resilient
local governance._

**Website:** [civicpress.io](https://civicpress.io) | **Contact:** [hello@civicpress.io](mailto:hello@civicpress.io)

---

# Introduction

**CivicPress is an open, transparent, and future‑proof civic platform built for
municipalities of all sizes.** It turns bylaws, minutes, public meetings,
geography layers, and civic workflows into structured, searchable, durable
public records.

Designed as **public infrastructure**, CivicPress replaces opaque, expensive,
proprietary systems with:

- Markdown‑based records — future‑proof, editable by anyone, and readable
  without proprietary software
- Git‑backed version history — every change is tracked, auditable, and fully
  reversible
- Modern, modular architecture — easy to extend, customize, and deploy in any
  municipal context
- A clean and intuitive user interface — designed for clerks and staff who need
  clarity, speed, and minimal friction
- A transparent API usable by both staff and citizens — ensuring
  interoperability, open data, and trust

CivicPress is built on a simple belief: **democratic institutions deserve tools
that are as open as the values they represent.**

---

# Why CivicPress Exists

Cities rely on digital systems that are often:

- overpriced
- closed-source
- hard to maintain
- incompatible with open data
- inaccessible to smaller municipalities
- dependent on PDFs, which are difficult to index, search, or preserve as
  structured civic records

CivicPress takes the opposite approach:

- **Open formats (Markdown, JSON, GeoJSON)**
- **Traceable edit history (Git)**
- **Local-first, resilient design**
- **Accessible and multilingual**
- **Ethical & transparent architecture**

Municipal clerks, staff, elected officials, journalists, and citizens can
finally work with civic information that is **easy to produce, easy to audit,
easy to share, and built to last.**

---

# Features&#x20;

- **Unified Civic Registry** for bylaws, minutes, policies, geography layers,
  and more
- **Markdown‑based records** with structured metadata
- **Full Git versioning** and commit history for every change
- **Geography Module** with GeoJSON support
- **Public Sessions Module** for council meetings
- **Internationalization (i18n)** — full multilingual UI and record metadata
- **Role‑based permissions** — define who can view, edit, review, approve, or
  publish records
- **Workflow engine (early alpha)** — draft → review → approval processes built
  into the core
- **Local‑first, offline‑ready architecture** for resilient municipal
  deployments
- **Pluggable storage layer** with configurable folders, providers, and backup
  targets
- **Automatic record indexing** for fast search and navigation
- **CLI tools** for initialization, backup, restore, validation, and maintenance
- **Nuxt UI Pro interface** optimized for clerks and heavy daily workflows
- **REST API** for developers and integrations, fully documented and expandable

---

# Demo

A live demonstration instance is available here:

[**https://demo.civicpress.io**](https://demo.civicpress.io)

This instance showcases a complete sample dataset — including public records,
geography layers, meeting minutes, and fully accessible API endpoints — offering
a hands‑on look at how CivicPress structures and publishes civic information.

---

# Quick Start (Developer Overview)

> Full instructions available in:
> [docs/bootstrap-guide.md](docs/bootstrap-guide.md)

**Basic setup:**

```bash
# 1. Clone the repository
git clone https://github.com/CivicPress/civicpress.git
cd civicpress

# 2. Install dependencies
pnpm install

# 3. Build all modules
pnpm run build

# 4. Initialize a new CivicPress instance
# (choose a demo dataset or start empty)
node cli/dist/index.js init --yes
# or
node cli/dist/index.js init --yes --demo-data springfield-usa
# or
node cli/dist/index.js init --yes --demo-data richmond-quebec

# 5. Start the API and UI
pnpm run start:api
pnpm run start:ui
```

---

# Documentation

All technical and architectural documentation is located in the [`docs/`](docs/)
directory:

- **[Bootstrap Guide](docs/bootstrap-guide.md)** — installation & development
- **[Roadmap](docs/roadmap.md)** — upcoming milestones toward v1.0.0
- **[Project Status](docs/project-status.md)** — current implementation status
- **[API Documentation](docs/api.md)** — complete REST API reference
- **[CLI Usage Guide](docs/cli.md)** — command-line interface documentation
- **[Architecture](docs/)** — modules, storage, workflows, and core design

---

# Contributing

We welcome contributions from developers, civic technologists, designers,
clerks, students, and anyone who believes public systems should be transparent
and accessible.

See [CONTRIBUTING.md](CONTRIBUTING.md) for full guidelines.

---

# Project Roadmap

The full roadmap is available at: [`docs/roadmap.md`](docs/roadmap.md)

CivicPress is progressing toward **v1.0.0**, with major milestones including:

- Google Docs–level collaborative editor
- Improved file attachments and indexing
- Municipal-friendly search & public registry
- Offline/local-first deployment options

---

# Technology Stack

CivicPress is built using a modern, open, and well‑supported stack chosen for
resilience, clarity, and long‑term maintainability — all critical for
public‑sector software.

- **TypeScript everywhere** — predictable, safe, and widely adopted
- **Nuxt 4 + Nuxt UI Pro** — fast, accessible, and easy to extend for
  clerk‑friendly interfaces
- **Node.js + pnpm** — lightweight, efficient, and ideal for modular back‑end
  services
- **SQLite (for now)** — zero‑maintenance, file‑based, perfect for local‑first
  deployments
- **Markdown + JSON + YAML + GeoJSON** — open, durable, and future‑proof civic
  data formats
- **Git as the versioning engine** — fully auditable change history by design
- **Nitro (server engine)** — portable, flexible, deployable nearly anywhere
- **Cloudflare + Nginx** — secure, fast, and robust for public access

These technologies were selected because they:

- avoid vendor lock‑in
- are open‑source and widely understood
- work equally well for small towns and large cities
- support the local‑first, offline‑capable philosophy of CivicPress
- ensure data remains transparent, inspectable, and durable for decades

## Why TypeScript/JavaScript?

CivicPress adopts TypeScript/JavaScript not because it is "better" than other
ecosystems, but because it aligns with the project's goals of accessibility,
transparency, and broad participation.

This stack was chosen because:

- **It lowers the barrier to entry** — many contributors, students, and
  municipal IT staff already know JavaScript or can pick it up quickly.
- **Setup is straightforward** — a lightweight toolchain reduces operational
  overhead, which is important for municipalities with limited technical
  capacity.
- **The web ecosystem is mature** — modern UI frameworks, accessibility tooling,
  documentation generators, and API libraries are strongest in the JS/TS world.
- **TypeScript provides predictability and maintainability** — offering strong
  typing and safe refactoring in a language many already use.
- **A large talent pool exists** — making long-term sustainability easier for
  municipalities and open-source contributors.

This approach supports the project's mission: to build civic technology that is
easy to understand, easy to extend, and maintainable by both small-town teams
and larger organizations alike.

---

# License

CivicPress is open‑source and released under the **MIT License**.

---

# Contact

For questions, partnerships, or pilot projects:
[**hello@civicpress.io**](mailto:hello@civicpress.io)
