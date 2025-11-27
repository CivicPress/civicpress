# CivicPress Spec: `public-data-structure.md`

---

version: 1.0.0 status: stable created: '2025-07-03' updated: '2025-07-15'
deprecated: false sunset_date: null additions:

- comprehensive data structure documentation
- organization patterns
- security considerations compatibility: min_civicpress: 1.0.0 max_civicpress:
 'null' dependencies:
 - 'manifest.md: >=1.0.0' authors:
- Sophie Germain <sophie@civicpress.io> reviewers:
- Ada Lovelace
- Irène Joliot-Curie

---

## Name

`public-data-structure` — CivicPress Public Data Structure

## Purpose

Define how civic records (e.g., bylaws, minutes, motions) are stored in
CivicPress using a hybrid structure that supports both chronological
traceability and thematic organization.

---

## Scope & Responsibilities

Responsibilities:

- Define how to chronologically track civic records (`timeline/`)
- Define how to structure finalized civic documents (`bylaws/`, `minutes/`)
- Provide clear naming conventions and frontmatter schemas

Out of scope:

- Database schemas
- UI rendering formats (handled by each module)

---

## Inputs & Outputs

| Input | Description |
| --------------------- | ------------------------------------ |
| Civic records | Markdown files with YAML frontmatter |
| Record metadata | Title, status, authors, dates, tags |
| File system structure | Directory organization and naming |
| Git commits | Version history and change tracking |
| Record relationships | Links between related records |

| Output | Description |
| ------------------ | ------------------------------------ |
| Structured records | Organized civic documents in folders |
| Timeline entries | Chronological civic activity records |
| Record indexes | Searchable indexes of civic records |
| Archive entries | Finalized records moved to archive |
| Relationship maps | Links and references between records |

---

## File/Folder Location

```
records/
├── timeline/ # Chronological civic activity
│ ├── 2025-07-03/
│ │ ├── bylaw-curfew.md
│ │ └── motion-budget.md
│ └── 2025-07-12/
│ └── bylaw-curfew.md
├── bylaws/ # Finalized bylaws by section
│ ├── section-01/
│ │ └── bylaw-curfew.md
│ └── section-02/
│ └── bylaw-noise-restrictions.md
├── minutes/ # Meeting minutes
│ ├── regular/
│ │ └── meeting-2025-07-03.md
│ └── emergency/
│ └── meeting-2025-07-15.md
├── resolutions/ # Council resolutions
│ └── 2025-06-10/
│ └── resolution-road-repair.md
└── feedback/ # Public feedback
 └── 2025-07-03/
 └── noise-complaint.md

.civic/
├── data-structure.yml # Data structure configuration
├── naming-conventions.yml # File naming rules
└── frontmatter-schemas/ # Frontmatter templates
 ├── bylaw.yml
 ├── motion.yml
 └── resolution.yml

core/
├── data-structure.ts # Data structure logic
├── record-organizer.ts # Record organization utilities
├── timeline-manager.ts # Timeline management
└── archive-manager.ts # Archive management

modules/
├── data-structure/
│ ├── components/
│ │ ├── RecordViewer.tsx # Record display component
│ │ ├── TimelineViewer.tsx # Timeline display
│ │ └── ArchiveViewer.tsx # Archive display
│ ├── hooks/
│ │ └── useDataStructure.ts # Data structure hook
│ └── utils/
│ ├── record-parser.ts # Record parsing utilities
│ └── structure-validator.ts # Structure validation
└── ui/
 └── components/
 └── DataStructureProvider.tsx # Data structure context

tests/
├── data-structure/
│ ├── record-organization.test.ts
│ ├── timeline-management.test.ts
│ └── archive-management.test.ts
└── integration/
 └── data-structure-integration.test.ts
```

---

## Security & Trust Considerations

### Data Integrity & Authenticity

- All civic records cryptographically signed with GPG keys
- Digital signatures required for all record publications and amendments
- Immutable audit trail for all record changes and movements
- Version control with tamper-evident history for all civic records
- Automated detection of unauthorized modifications to civic records

### Access Control & Permissions

- Role-based access control for record creation and modification
- Granular permissions per record type and status
- Approval workflow for record publication and archival
- Emergency record lockdown capability during security incidents
- Audit logging of all record-related activities and access attempts

### Compliance & Legal Requirements

- Compliance with municipal record-keeping requirements
- Legal review process for record structure and organization
- Support for public records laws and transparency requirements
- Compliance with data retention policies for civic records
- Regular legal audits of record organization practices

### Data Protection & Privacy

- Encryption of sensitive record data in transit and at rest
- GDPR-compliant data handling for record metadata
- Anonymization of personal data in public records
- User consent management for record-related data processing
- Data sovereignty compliance for cross-border record storage

### Audit & Transparency

- Public transparency logs for all record operations
- Cryptographic verification of record authenticity
- Immutable audit trails for all data structure activities
- Support for public records requests and legal discovery
- Regular transparency reports and compliance audits

### Abuse Prevention & Monitoring

- Rate limiting and abuse detection for record operations
- Machine learning detection of coordinated record manipulation
- Real-time monitoring of record access patterns and volume
- Automated alerts for unusual record activity or potential abuse
- Blacklist/whitelist management for record content and metadata

---

## Hybrid Folder Structure

CivicPress separates civic record **evolution** from **organization**:

### `timeline/` — The Civic Ledger

```
records/
├── timeline/
│ ├── 2025-07-03/
│ │ ├── bylaw-curfew.md
│ │ └── motion-budget.md
│ ├── 2025-07-12/
│ │ └── bylaw-curfew.md
│ └── 2025-07-23/
│ └── bylaw-curfew.md
```

- Chronological folder = civic activity day
- Files reflect civic evolution (e.g., drafts, amendments, approvals)
- Every change is tracked in Git commits

### `bylaws/`, `minutes/` — Thematic Archive

```
records/
├── bylaws/
│ ├── section-01/
│ │ └── bylaw-curfew.md
├── minutes/
│ ├── regular/
│ │ └── meeting-2025-07-03.md
│ └── emergency/
```

- Once adopted, finalized records are moved (or referenced) here
- This is what citizens browse
- Mirrors government structure

---

## Record Synchronization Policy

If a record exists in the structured folders (e.g.,
`bylaws/section-02/bylaw-curfew.md`) and future edits occur in the `timeline/`,
the structured file **must eventually reflect those changes**.

Valid approaches:

- Update the structured file in-place (with Git commit + changelog)
- Replace with a new version (archive the old version clearly)
- Use `source:` or `latest:` in frontmatter to link to the timeline

This ensures:

- The structured archive always reflects the most recent civic decisions
- The `timeline/` remains the canonical ledger of civic activity
- There is no ambiguity about which version is current

All modules that publish civic records **must respect this lifecycle**.

---

## YAML Frontmatter Structure

```yaml
---
title: 'Bylaw on Park Regulation'
type: bylaw
status: draft
authors:
 - name: 'Ada Lovelace'
 role: 'clerk'
created: '2025-07-03'
updated: '2025-07-12'
tags: ['parks', 'safety']
reviewers: []
approved_by: []
module: 'legal-register'
source: 'timeline/2025-07-03/bylaw-park.md'
---
```

## Testing & Validation

- Create draft in `timeline/YYYY-MM-DD/` → visible in dev UI
- Commit edited record → tracked in Git with correct author
- Move record to `bylaws/` → `source:` link remains intact
- Render diff between timeline and structured file
- Run `civic lint:records` to validate naming, structure, frontmatter

---

## ️ Future Enhancements

- `civic index` command to regenerate a public search index
- `civic trace` tool to follow a record's full evolution across timeline
- Ability to render a civic "ledger" from commits and frontmatter status
- Visual timeline explorer for historical civic decisions

---

## History

- Drafted: 2025-07-03
- Updated: 2025-07-03
