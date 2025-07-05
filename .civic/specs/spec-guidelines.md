# 📄 CivicPress Spec: `spec-guidelines.md`

---
version: 1.0.0
status: stable
created: '2025-07-04'
updated: '2025-07-04'
deprecated: false
sunset_date: null
breaking_changes: []
additions:

- standardized spec format
- metadata fields
- authorship tracking
fixes: []
migration_guide: null
compatibility:
  min_civicpress: 1.0.0
  max_civicpress: null
  dependencies: []
authors:
- Sophie Germain <sophie@civic-press.org>
reviewers:
- Ada Lovelace
- Tim Berners-Lee

---

## 📛 Name

`spec-guidelines.md`

---

## 🎯 Purpose

This specification defines the **standard format** for all CivicPress `.md`
specs, ensuring consistent documentation, machine-readability, and long-term
traceability.

---

## 🧩 Scope & Responsibilities

- Define the required structure and metadata for all CivicPress spec files
- Ensure all specs are human-readable and machine-parseable
- Provide guidance for authorship, versioning, and changelog practices
- Serve as the canonical reference for spec formatting and compliance

---

## 📦 Format Overview

Each spec begins with a **structured metadata header**, followed by the actual
content. Two supported formats:

```md
# 🧩 CivicPress Spec: `example-spec.md`
---
version: '1.0.0'
status: 'stable'
created: '2025-07-04'
updated: '2025-07-04'
deprecated: false
sunset_date: null
breaking_changes: []
additions: ['standardized spec format', 'metadata fields', 'authorship tracking']
fixes: []
migration_guide: null
compatibility:
  min_civicpress: '1.0.0'
  max_civicpress: null
  dependencies: []
authors:

- 'Sophie Germain <sophie@civic-press.org>'
reviewers:
- 'Ada Lovelace'
- 'Tim Berners-Lee'

---
```

---

## 📅 History

- Drafted: 2025-07-04
- Updated: 2025-07-04
