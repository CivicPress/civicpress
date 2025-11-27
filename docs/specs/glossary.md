# CivicPress Spec: `glossary.md`

---

version: 1.0.0 status: stable created: '2025-07-03' updated: '2025-07-15'
deprecated: false sunset_date: null breaking_changes: [] additions:

- comprehensive glossary documentation
- key terms
- definitions fixes:
- glossary documentation
- term definitions
- validation patterns migration_guide: null compatibility: min_civicpress: 1.0.0
 max_civicpress: null dependencies: [] authors:
- Sophie Germain <sophie@civicpress.io> reviewers:
- Ada Lovelace
- Irène Joliot-Curie

---

## ️ CivicPress Glossary

Welcome to the CivicPress Glossary! This document defines key terms and concepts
used throughout the CivicPress platform and specifications. For new
contributors, administrators, and civic stakeholders, this glossary ensures a
shared understanding and consistent language across the project.

For a full overview, see the [Specs README](./README.md).

---

| Term | Definition |
| --------------- | ------------------------------------------------------------------------------------------------- |
| **Record** | A civic document or data file (e.g. bylaw, minutes, permit) tracked in Git and CivicPress. |
| **Module** | A self-contained feature or domain (e.g. legal-register, feedback) that extends CivicPress. |
| **Workflow** | An automated or semi-automated process (e.g. approval, notification) triggered by events. |
| **Status** | The current state of a record (e.g. draft, proposed, adopted, archived) for lifecycle tracking. |
| **Role** | A set of permissions or responsibilities assigned to a user (e.g. clerk, mayor, citizen). |
| **Permission** | A specific action a user or role is allowed to perform (e.g. approve, sign, comment). |
| **Hook** | An event trigger point in the system (e.g. prePublish, postFeedback) for workflows or plugins. |
| **Manifest** | A YAML or JSON file describing metadata for a record, module, or CivicPress instance. |
| **Spec** | A formal specification document defining architecture, policy, or behavior for a CivicPress part. |
| **Policy** | A rule or set of rules governing actions, approvals, retention, or access in CivicPress. |
| **Plugin** | An optional extension that adds features, integrations, or UI to CivicPress without core changes. |
| **Audit** | The process or result of reviewing records, actions, or logs for compliance and transparency. |
| **Log** | An append-only record of actions, events, or changes (e.g. activity log, moderation log). |
| **Index** | A searchable list or database of records, metadata, or content for fast retrieval. |
| **Frontmatter** | Structured metadata at the top of a Markdown file, usually in YAML. |
| **Template** | A reusable file or configuration for creating new records, modules, or workflows. |
| **CLI** | Command-Line Interface; tools and commands for managing CivicPress from the terminal. |
| **API** | Application Programming Interface; endpoints for programmatic access to CivicPress data/actions. |
| **Public UI** | The user interface for citizens and non-admins to view civic records and participate. |
| **Admin UI** | The user interface for clerks, council, and staff to manage records, workflows, and settings. |
| **YAML** | A human-readable data serialization format used for configuration and metadata in CivicPress. |
| **JSONL** | JSON Lines; a format for storing logs as one JSON object per line. |
| **Sandbox** | A restricted environment for running plugins or workflows safely. |
| **White-label** | The ability to remove CivicPress branding for custom deployments. |
| **Retention** | The policy or duration for keeping records, logs, or backups. |
| **Anomaly** | An unexpected or suspicious event detected during audit or monitoring. |
| **Digest** | A summary report, often periodic (e.g. weekly metrics digest). |
| **Mermaid** | A markdown-based diagramming syntax used for visualizing flows and relationships. |

---

If you encounter unfamiliar terms, suggest additions, or want to clarify a
definition, please open a Pull Request or Discussion!

## Name

`glossary` — CivicPress Glossary of Terms

## Purpose

Define and clarify key terms, acronyms, and concepts used throughout the
CivicPress platform and specifications, ensuring a shared understanding for all
contributors and users.

## Scope & Responsibilities

Responsibilities:

- Maintain a comprehensive glossary of terms
- Update definitions as the platform evolves
- Ensure clarity and accessibility for all audiences

Out of Scope:

- Legal definitions (see legal-register.md)
- Implementation-specific terminology

---

## History

- Drafted: 2025-07-03
- Last updated: 2025-07-15
