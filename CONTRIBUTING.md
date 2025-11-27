# Contributing to CivicPress

Welcome! Thank you for your interest in contributing to CivicPress. This project
exists to improve transparency, accessibility, and resilience in local
governance.

**CivicPress is built for two main audiences:**

- **Developers and technologists** — contributing code, architecture, tests, and
  technical documentation
- **Municipal clerks, staff, and civic practitioners** — providing real-world
  workflows, terminology, use cases, and user experience feedback

Both perspectives are essential. If you're new to CivicPress and work in
municipal government, start with the [Municipal Guide](docs/municipal-guide.md)
to understand what CivicPress is and how it serves local governments.

CivicPress is an open-source public infrastructure project, and contributions
help shape tools that may serve towns and cities for years to come.

## How Decisions Are Made

During the v0.1.3 (Alpha) phase, CivicPress is stewarded by a Founding
Maintainer who oversees technical architecture, roadmap direction, and community
coordination. **All decisions are transparent and versioned through GitHub
issues, pull requests, specs, and releases.** As the project grows, governance
will transition to a formal organization (OSBL or cooperative) with broader
community participation. See [docs/governance.md](docs/governance.md) for full
details on current and future governance.

---

# 1. Who Can Contribute

CivicPress encourages contributions from a wide range of backgrounds. You do not
need to be a developer to participate.

## Developers

- Fix bugs
- Implement new features
- Improve modules and architecture
- Write or refine tests
- Review pull requests

## Designers

- Improve user flows and layout
- Conduct accessibility reviews
- Contribute wireframes or design proposals

## Municipal Clerks, Staff, and Civic Practitioners

- Suggest improvements to workflows
- Help refine terminology and record structures
- Provide real-world use cases
- Comment on the clarity and usefulness of UI components

## Everyone

- Improve documentation
- Propose translations
- Report issues or inconsistencies
- Share feedback on the user experience

---

# 2. Before You Start

A few useful resources to consult before contributing:

- Development and installation guide:
  [docs/bootstrap-guide.md](docs/bootstrap-guide.md)
- Roadmap and direction: [docs/roadmap.md](docs/roadmap.md)
- Project status and current implementation:
  [docs/project-status.md](docs/project-status.md)
- Public interest and participation form: https://tally.so/r/wAYBvN

These documents will give you a clear sense of the goals, priorities, and
expectations for CivicPress.

---

# 3. How to Contribute Code

This section covers the technical workflow for developers.

## Prerequisites

Before contributing code, ensure you have:

- **Node.js** 20.11.1 or higher (LTS recommended)
- **pnpm** 8.15.0 or higher (package manager)
- **Git** installed and configured

## Development Setup

Follow the installation instructions in
[docs/bootstrap-guide.md](docs/bootstrap-guide.md) to set up your environment.

## Proposal Before Big PRs

For significant changes (new features, major refactors, architectural changes),
please open a GitHub issue or discussion first to propose your approach. This
helps ensure alignment with the project's direction and avoids duplicate work.
Small bug fixes and documentation improvements can go straight to pull requests.

## Branch Naming

Use a clear branch naming convention:

```
feature/my-feature-name
bugfix/issue-123
chore/update-dependencies
docs/improve-bootstrap-guide
release/v0.1.x
```

## Commit Messages

Use short, descriptive commit messages. CivicPress encourages a lightweight
version of Conventional Commits:

```
feat: add GeoJSON validation
docs: update contributing guide
fix: resolve null error in records-service
refactor: simplify indexing logic
```

## Pull Requests

- Keep pull requests focused and concise.
- Include screenshots when UI changes are involved.
- Make sure the build passes before submitting.
- Reference an issue when available.
- Describe any testing steps.

## Architecture Overview

CivicPress is a Git-native, modular civic platform built on a local-first
philosophy. All civic records (bylaws, minutes, policies) are stored as Markdown
files in Git repositories, providing complete audit trails and version history.
The system uses a modular architecture with a core platform (`core/`), API layer
(`modules/api/`), UI (`modules/ui/`), and optional civic modules. A SQLite
database serves as a performance layer for search and indexing, but the file
system (Git + Markdown) is always the source of truth. See
[docs/architecture.md](docs/architecture.md) for complete architectural details.

---

# 4. Non-Code Contributions

Not all contributions involve writing code. Non-technical contributions are
essential to the success of CivicPress.

## Civic and Municipal Contributors

- Propose improvements to workflows (draft, review, approval, publication)
- Suggest new record types or metadata
- Provide examples of common administrative tasks
- Help refine language, clarity, and terminology

## Documentation

- Improve clarity, structure, and accuracy in documentation
- Write user guides or examples
- Contribute accessibility notes

## Accessibility

CivicPress must be accessible to all users, including those using screen
readers, keyboard navigation, and other assistive technologies. Contributions
that improve accessibility are especially valuable:

- Conduct accessibility audits and report issues
- Fix ARIA labels, semantic HTML, and keyboard navigation
- Improve color contrast and visual design for clarity
- Test with screen readers and assistive technologies
- Review and improve error messages and form validation

## Internationalization (i18n)

CivicPress supports full multilingual UI and record metadata. Contributions to
internationalization include:

- Translate UI labels and documentation
- Review tone and terminology for local correctness
- Add new language support
- Improve i18n infrastructure and tooling
- Test translations in real municipal contexts

---

# 5. Reporting Issues

If you encounter bugs or inconsistencies:

- [Open an issue on GitHub](https://github.com/CivicPress/civicpress/issues)
- Provide steps to reproduce
- Include logs or screenshots when applicable
- Use descriptive titles

Issues help maintain quality and guide future development.

---

# 6. Community and Participation

CivicPress is not only a software project; it is a civic initiative. If you wish
to participate beyond technical contributions:

- Express interest in pilot projects
- Share use cases from your municipality or field
- Provide feedback on the platform’s direction
- Contact the project maintainers directly at
  [hello@civicpress.io](mailto:hello@civicpress.io)

---

# 7. Code of Conduct

Contributors are expected to:

- Communicate respectfully
- Offer constructive feedback
- Act in a way that supports the mission of public good and transparency

Harassment, discrimination, or abusive behavior is not tolerated.

---

# 8. Licensing

By contributing to CivicPress, you agree that your contributions are made
available under the MIT License, the same license that governs the project.

---

# 9. Future Governance

CivicPress is currently in v0.1.3 (Alpha) and is stewarded by a Founding
Maintainer. As the project grows and gains municipal adoption, governance will
transition to a formal independent organization to ensure long-term neutrality
and public trust.

Two organizational models are being evaluated:

- **OSBL (Non-Profit Organization)** — independent from private vendors,
  transparent financial management, eligible for grants and public funding
- **Municipal Cooperative** — town-owned digital infrastructure where
  participating municipalities become members with shared ownership and
  collaborative governance

The final organizational model will be chosen based on the needs of early pilot
municipalities and contributors. All governance decisions are documented
transparently in [docs/governance.md](docs/governance.md).

---

# 10. Thank You

Every contribution — whether code, documentation, testing, design, or feedback —
strengthens the project. CivicPress is built collaboratively, and your
involvement helps ensure that municipalities everywhere can rely on transparent,
open, and trustworthy digital infrastructure.
