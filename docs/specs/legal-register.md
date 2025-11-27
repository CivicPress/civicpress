# ️ CivicPress Spec: `legal-register.md`

---

version: 1.0.0 status: stable created: '2025-07-03' updated: '2025-07-15'
deprecated: false sunset_date: null breaking_changes: [] additions:

- comprehensive legal register documentation
- document integrity
- security considerations fixes: [] migration_guide: null compatibility:
 min_civicpress: 1.0.0 max_civicpress: 'null' dependencies:
 - 'public-data-structure.md: >=1.0.0'
 - 'records-validation.md: >=1.0.0' authors:
- Sophie Germain <sophie@civicpress.io> reviewers:
- Ada Lovelace
- Irène Joliot-Curie

---

## Name

`legal-register` — CivicPress Legal Register Module (Bylaws, Motions, and Legal
Records)

## Purpose

Manage and organize official civic legal records such as bylaws, motions,
ordinances, and resolutions in a structured, Markdown-native format.

---

## Scope & Responsibilities

Responsibilities:

- Accept Markdown records for bylaws, motions, and resolutions
- Enable indexing, status tracking, versioning, and approval flow
- Define file structure, naming, and YAML frontmatter fields
- Attach to feedback, sessions, and history timeline

Out of scope:

- PDF management or media hosting
- Legal advice or interpretation

---

## Inputs & Outputs

| Input | Description |
| ------------------ | -------------------------------------------------- |
| Legal documents | Markdown files for bylaws, motions, resolutions |
| Document metadata | Title, number, status, authors, approval info |
| Approval workflows | Multi-role approval processes and signatures |
| Legal templates | Pre-defined templates for different document types |
| Version history | Document versioning and change tracking |

| Output | Description |
| ------------------- | ---------------------------------------- |
| Legal records | Structured legal documents in `records/` |
| Legal indexes | Searchable indexes of legal documents |
| Approval logs | Audit trails of document approvals |
| Version snapshots | Immutable versions of legal documents |
| Publication notices | Notifications of legal document changes |

---

## File/Folder Location

```
records/
├── bylaws/
│ ├── section-01/
│ │ ├── bylaw-tree-cutting.md
│ │ └── index.yml
│ ├── section-02/
│ │ ├── bylaw-noise-restrictions.md
│ │ └── index.yml
│ └── repealed/
│ └── bylaw-old-curfew-1998.md
├── motions/
│ ├── 2025-07-01/
│ │ ├── motion-curfew-extension.md
│ │ └── index.yml
│ └── pending/
│ └── motion-budget-increase.md
└── resolutions/
 ├── 2025-06-10/
 │ ├── resolution-road-repair.md
 │ └── index.yml
 └── adopted/
 └── resolution-emergency-funding.md

.civic/
├── legal-register.yml # Legal register configuration
├── legal-templates/
│ ├── bylaw-template.md
│ ├── motion-template.md
│ └── resolution-template.md
└── legal-schemas/
 ├── bylaw-schema.yml
 ├── motion-schema.yml
 └── resolution-schema.yml

core/
├── legal-register.ts # Legal register logic
├── legal-validation.ts # Legal document validation
├── legal-workflow.ts # Legal approval workflows
└── legal-indexing.ts # Legal document indexing

modules/
├── legal-register/
│ ├── components/
│ │ ├── LegalDocumentViewer.tsx
│ │ ├── LegalDocumentEditor.tsx
│ │ └── LegalApprovalWorkflow.tsx
│ ├── hooks/
│ │ └── useLegalRegister.ts
│ └── utils/
│ ├── legal-parser.ts
│ ├── legal-validator.ts
│ └── legal-indexer.ts
└── ui/
 └── components/
 └── LegalProvider.tsx

tests/
├── legal-register/
│ ├── legal-creation.test.ts
│ ├── legal-approval.test.ts
│ └── legal-indexing.test.ts
└── integration/
 └── legal-register-integration.test.ts
```

---

## File Structure

```
records/
├── bylaws/
│ ├── section-01/
│ │ └── bylaw-tree-cutting.md
│ ├── section-02/
│ │ └── bylaw-noise-restrictions.md
├── motions/
│ └── 2025-07-01/
│ └── motion-curfew-extension.md
└── resolutions/
 └── 2025-06-10/
 └── resolution-road-repair.md
```

---

## Record Format

Example for a bylaw:

```yaml
---
title: 'Noise Restrictions'
number: 'BL-2025-003'
status: 'adopted'
section: '02'
tags: ['noise', 'nighttime', 'curfew']
created: '2025-06-12'
adopted: '2025-07-01'
module: 'legal-register'
authors:
 - name: 'Irène Joliot-Curie'
 role: 'clerk'
approved_by:
 - 'Ada Lovelace'
related_to:
 - records/feedback/2025-06-20/noise-complaint.md
 - records/public-sessions/2025-06-28/index.md
---
To ensure a peaceful night environment...
```

---

## Lifecycle States

| Status | Description |
| ---------- | -------------------- |
| `draft` | Initial proposal |
| `proposed` | Under council review |
| `adopted` | Approved and binding |
| `archived` | Repealed or replaced |

---

## ️ CLI Commands

```bash
civic propose bylaw --title "..." --section 02
civic approve bylaw-noise-restrictions.md
civic archive bylaw-noise-restrictions.md
```

---

## Hooks & Workflows

- `onBylawProposed` → notify roles or open review thread
- `onBylawAdopted` → trigger indexing or update dashboard
- `onBylawArchived` → move or tag file accordingly

---

## Security & Trust Considerations

### Legal Document Integrity

- All legal documents cryptographically signed with GPG keys
- Digital signatures required for all bylaw adoptions and amendments
- Immutable audit trail for all legal document changes and approvals
- Version control with tamper-evident history for all legal records
- Automated detection of unauthorized modifications to legal documents

### Authentication & Authorization

- Multi-factor authentication required for all legal document operations
- Role-based access control with granular permissions per document type
- Quorum verification for legal document adoptions and amendments
- Approval workflow for all legal document changes and publications
- Emergency lockdown capability for legal document system during incidents

### Compliance & Legal Requirements

- Compliance with municipal legal requirements and regulations
- Legal review process for all bylaw proposals and amendments
- Support for public records laws and transparency requirements
- Compliance with data retention policies for legal document history
- Regular legal audits of legal register practices and procedures

### Data Protection & Privacy

- Encryption of sensitive legal data in transit and at rest
- GDPR-compliant data retention policies for legal document metadata
- Anonymization of personal data in public legal records
- User consent management for legal document-related data processing
- Data sovereignty compliance for cross-border legal document storage

### Audit & Transparency

- Public transparency logs for all legal document changes
- Cryptographic verification of legal document authenticity
- Immutable audit trails for all legal register activities
- Support for public records requests and legal discovery
- Regular transparency reports and compliance audits

### Abuse Prevention & Monitoring

- Rate limiting and abuse detection for legal document creation
- Machine learning detection of coordinated legal document manipulation
- Real-time monitoring of legal document change patterns
- Automated alerts for unusual legal activity or potential abuse
- Blacklist/whitelist management for legal document content

---

## Indexing Example

```yaml
- file: bylaws/section-02/bylaw-noise-restrictions.md
 title: 'Noise Restrictions'
 number: 'BL-2025-003'
 status: 'adopted'
 section: '02'
 adopted: '2025-07-01'
```

---

## Testing & Validation

- Test bylaw creation and approval workflow
- Verify status transitions work correctly
- Ensure proper role-based permissions
- Test indexing and search functionality
- Validate file structure and naming conventions

---

## ️ Future Enhancements

- Tracking repealed/replaced laws
- Cross-town bylaw comparison tools
- Diff visualizer between bylaw versions
- YAML signature hash for proof of publication

---

## History

- Drafted: 2025-07-03
