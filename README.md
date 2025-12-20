# CivicPress

_A modern, open-source platform for transparent, accountable, and resilient
local governance._

**Website:** [civicpress.io](https://civicpress.io) | **Contact:**
[hello@civicpress.io](mailto:hello@civicpress.io)

---

# Introduction

CivicPress is an open-source civic records platform that helps municipalities
manage bylaws, minutes, and public information in open, durable formats.

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

# Who is this for?

CivicPress is designed for:

- **Municipal clerks and staff** — daily workflows for managing bylaws, minutes,
  and civic records
- **Elected officials and CAOs** — transparent governance tools that build
  public trust
- **Civic tech folks and integrators** — open APIs and modular architecture for
  building connected civic systems
- **Researchers and journalists** — accessible, searchable public records with
  full version history

---

# Why CivicPress Exists

Cities rely on digital systems that are often:

- overpriced
- closed-source
- hard to maintain
- incompatible with open data
- inaccessible to smaller municipalities

Many municipal records are currently trapped in PDFs or Word files. These
formats are difficult to search, hard to index, and not future-proof as primary
storage. This limits transparency, access to information, and long-term archival
value.

CivicPress takes the opposite approach:

- **Open formats (Markdown, JSON, GeoJSON)** — human-readable, searchable, and
  future-proof
- **Traceable edit history (Git)** — every change is auditable and reversible
- **Local-first, resilient design** — works offline and in small towns
- **Accessible and multilingual** — built for diverse communities
- **Ethical & transparent architecture** — no hidden automation or vendor
  lock-in

Municipal clerks, staff, elected officials, journalists, and citizens can
finally work with civic information that is **easy to produce, easy to audit,
easy to share, and built to last.**

For deeper context on the vision and values behind CivicPress:

- **[Manifesto & Values](https://github.com/CivicPress/manifesto/blob/master/manifesto.md)**
  — core principles and philosophy
- **[Appendix: Public IT Failures](https://github.com/CivicPress/manifesto/blob/master/appendix-failures.md)**
  — case studies on why transparent civic systems matter

---

# Features

CivicPress provides a comprehensive platform for managing civic records and
public information.

## Records & Content Management

- **Structured records** — bylaws, minutes, policies stored as Markdown with
  structured metadata
- **File attachments** — PDFs, images, and other files with metadata and
  categorization
- **Full Git versioning** — every change is tracked with commit history, author,
  and timestamp
- **Demo datasets** — Springfield, VA and Richmond, QC sample data for
  exploration and testing

## Search & Discovery

- **Automatic record indexing** — fast full-text search across all records and
  metadata
- **Advanced filtering** — search by type, status, date, author, and custom
  metadata fields
- **Public API** — RESTful API for programmatic access and integrations

## Geography & Spatial Data

- **Geography layers** — zones, districts, and boundaries using open GeoJSON
  format
- **Spatial integration** — link records to geographic areas and visualize
  coverage

## Governance & Workflows

- **Role-based permissions** — define who can view, edit, review, approve, or
  publish records
- **Workflow engine** — configurable draft → review → approval processes built
  into the core
- **Public Sessions Module** — manage council meetings and public sessions

## Infrastructure & Operations

- **Local-first architecture** — offline-ready, resilient deployments for small
  towns and large cities
- **Backup and restore** — CLI tools for data backup, restore, and migration
- **Multi-provider storage** — configurable storage backends (local, S3, Azure)
- **CLI tools** — initialization, validation, maintenance, and administrative
  operations
- **Internationalization (i18n)** — full multilingual UI and record metadata
  support

---

# Demo

A live demonstration instance is available here:

[**https://demo.civicpress.io**](https://demo.civicpress.io)

This instance showcases a complete sample dataset — including public records,
geography layers, meeting minutes, and fully accessible API endpoints — offering
a hands‑on look at how CivicPress structures and publishes civic information.

**Current status:** v0.2.0 (Alpha). Core maturity complete, suitable for demos
and pilots with support, not yet for unsupervised production use.

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
node cli/dist/index.js init --yes --demo-data richmond-quebec  # Richmond, QC demo dataset

# 5. Start the API and UI
pnpm run start:api
pnpm run start:ui
```

---

# Documentation

All technical and architectural documentation is located in the [`docs/`](docs/)
directory:

## For Municipal Staff

- **[Municipal Guide](docs/municipal-guide.md)** — what CivicPress is and how it
  works for clerks, councils, and municipal staff

## For Developers & IT Teams

- **[Bootstrap Guide](docs/bootstrap-guide.md)** — installation, setup, and
  development environment
- **[API Documentation](docs/api.md)** — complete REST API reference
- **[CLI Usage Guide](docs/cli.md)** — command-line interface documentation
- **[Architecture](docs/architecture.md)** — modules, storage, workflows, and
  core design

## Project Information

- **[Roadmap](docs/roadmap.md)** — technical roadmap and upcoming milestones
  toward v1.0.0
- **[Project Status](docs/project-status.md)** — current implementation status
  and feature completeness
- **[Governance](docs/governance.md)** — governance model, future OSBL/coop
  plans, and decision-making processes

## Contributing

- **[Contributing Guide](CONTRIBUTING.md)** — how to get involved as a
  contributor

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

## Core Technologies

- **TypeScript / Node.js** — predictable, safe, and widely adopted
- **pnpm workspaces / monorepo** — efficient dependency management and modular
  development
- **Nuxt 4 + Nuxt UI Pro** — fast, accessible, and easy to extend for
  clerk‑friendly interfaces
- **SQLite** — zero‑maintenance, file‑based database, perfect for local‑first
  deployments (with future support for PostgreSQL and other databases)
- **Markdown / YAML / JSON / GeoJSON** — open, durable, and future‑proof civic
  data formats
- **Git** — versioning engine for fully auditable change history
- **Nitro (server engine)** — portable, flexible, deployable nearly anywhere
- **Nginx / simple Node processes** — straightforward deployment options

## Design Rationale

This stack was chosen because it:

- **Broad familiarity** — many web developers can contribute without learning
  specialized languages or frameworks
- **Simple local setup** — no heavy enterprise stack required; works on standard
  development machines
- **Strong ecosystem** — mature tooling for web UIs, accessibility, and civic
  portals
- **Open, versionable formats** — storage in text-based formats (Markdown, YAML,
  JSON) that are human-readable and Git-friendly
- **Avoids vendor lock‑in** — all technologies are open-source and widely
  understood
- **Works at any scale** — equally suitable for small towns and large cities
- **Supports local-first philosophy** — offline-capable and resilient
- **Ensures data longevity** — data remains transparent, inspectable, and
  durable for decades

---

# License

CivicPress is open‑source and released under the **MIT License**.

---

# Contact

For questions, partnerships, or pilot projects:
[**hello@civicpress.io**](mailto:hello@civicpress.io)
