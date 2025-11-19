# 🔄 CivicPress Spec: `lifecycle.md`

---

version: 1.0.0 status: stable created: '2025-07-03' updated: '2025-07-15'
deprecated: false sunset_date: null additions:

- comprehensive lifecycle documentation
- state management
- security considerations compatibility: min_civicpress: 1.0.0 max_civicpress:
  'null' dependencies:
  - 'workflows.md: >=1.3.0'
  - 'status-tags.md: >=1.0.0' authors:
- Sophie Germain <sophie@civicpress.io> reviewers:
- Ada Lovelace
- Irène Joliot-Curie

---

## 📛 Name

Civic Record Lifecycle

## 🎯 Purpose

Define how civic records (e.g. bylaws, minutes, proposals) transition through
various lifecycle stages — from draft to adoption, amendment, retirement, and
archival.

This ensures long-term clarity and consistency across all records.

---

## 🧩 Scope & Responsibilities

✅ Responsibilities:

- Define valid lifecycle states (`draft`, `proposed`, `adopted`, `amended`,
  `archived`, `repealed`)
- Allow records to update `status:` and track transitions
- Ensure consistent UI, API, and CLI behavior per stage
- Link related versions (e.g. `amends: bylaw-2018-12`)
- Handle content withdrawal or deprecation

❌ Out of Scope:

- File deletion (files are always retained via Git)
- Legal enforcement or interpretation

---

## 🔗 Inputs & Outputs

| Input              | Description                                     |
| ------------------ | ----------------------------------------------- |
| Civic records      | Markdown files with status metadata             |
| Status transitions | State change requests and approvals             |
| Lifecycle policies | Configuration rules from `.civic/lifecycle.yml` |
| User permissions   | Role-based transition authorization             |
| Related records    | Links to previous versions or amendments        |

| Output              | Description                               |
| ------------------- | ----------------------------------------- |
| Updated records     | Records with new status and metadata      |
| Transition logs     | Audit trail of lifecycle changes          |
| Workflow triggers   | Automated processes for state changes     |
| Archive entries     | Records moved to archive structure        |
| Notification events | Alerts for status changes and transitions |

---

## 🔗 Lifecycle States & Flow

```text
[DRAFT] → [PROPOSED] → [ADOPTED]
                       ↘
                        [REJECTED]
[ADOPTED] → [AMENDED] → [REPEALED] or [ARCHIVED]
```

---

## 📘 Example Frontmatter

```yaml
title: 'Bylaw 2025-18: Noise Restriction'
status: amended
amends: '2022-11-noise-control'
replaced_by: '2028-02-quiet-hours'
```

---

## 📂 File/Folder Location

```
records/bylaws/2025-18-noise.md
records/archive/
.civic/lifecycle.log.jsonl
```

## 📝 Example Lifecycle Policy Configuration

```yaml
# .civic/lifecycle.yml
lifecycle:
  states:
    draft:
      label: 'Draft'
      color: '#6c757d'
      editable: true
      deletable: true
    proposed:
      label: 'Proposed'
      color: '#007bff'
      editable: false
      deletable: false
    adopted:
      label: 'Adopted'
      color: '#28a745'
      editable: false
      deletable: false
    amended:
      label: 'Amended'
      color: '#ffc107'
      editable: false
      deletable: false
    repealed:
      label: 'Repealed'
      color: '#dc3545'
      editable: false
      deletable: false
    archived:
      label: 'Archived'
      color: '#6c757d'
      editable: false
      deletable: false
    rejected:
      label: 'Rejected'
      color: '#e74c3c'
      editable: false
      deletable: false

  transitions:
    draft:
      to: ['proposed', 'archived']
      requires_approval: false
    proposed:
      to: ['adopted', 'rejected', 'archived']
      requires_approval: true
      approval_roles: ['clerk', 'mayor']
    adopted:
      to: ['amended', 'repealed', 'archived']
      requires_approval: true
      approval_roles: ['clerk', 'mayor']
    amended:
      to: ['repealed', 'archived']
      requires_approval: true
      approval_roles: ['clerk', 'mayor']
    repealed:
      to: ['archived']
      requires_approval: false
    archived:
      to: []
      requires_approval: false
    rejected:
      to: ['archived']
      requires_approval: false

  logging:
    enabled: true
    log_file: '.civic/lifecycle.log.jsonl'
    retention_days: 730
```

---

## 🔐 Security & Trust Considerations

- Only authorized users can change lifecycle status
- Transitions should trigger hooks or workflow validation
- Changes must be logged in Git or audit system

---

## 🧪 Testing & Validation

- Validate status tags for invalid states
- Check state transitions via CLI/API
- Ensure proper references to older records
- Test archival automation via `scheduler.md`

---

## 🛠️ Future Enhancements

- Lifecycle visualization UI (graph of changes)
- Cross-record diff for amendments
- Draft collaboration mode
- Policy rules per module type (e.g. permits vs minutes)

## 🔗 Related Specs

- [`status-tags.md`](./status-tags.md) — Status definitions and transitions
- [`workflows.md`](./workflows.md) — Automated lifecycle transitions
- [`scheduler.md`](./scheduler.md) — Automated archival scheduling
- [`permissions.md`](./permissions.md) — Approval role requirements
- [`audit.md`](./audit.md) — Lifecycle audit trail

---

## 📅 History

- Drafted: 2025-07-04
