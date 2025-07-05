# 📊 CivicPress Spec: `public-data-structure.md`

---
version: 1.0.0
status: stable
created: '2025-07-03'
updated: '2025-07-15'
deprecated: false
sunset_date: null
additions:

- comprehensive data structure documentation
- organization patterns
- security considerations
compatibility:
  min_civicpress: 1.0.0
  max_civicpress: 'null'
  dependencies:
  - 'manifest.md: >=1.0.0'
authors:
- Sophie Germain <sophie@civic-press.org>
reviewers:
- Ada Lovelace
- Irène Joliot-Curie

---

## 📛 Name

`public-data-structure` — CivicPress Public Data Structure

## 🎯 Purpose

Define how civic records (e.g., bylaws, minutes, motions) are stored in
CivicPress using a hybrid structure that supports both chronological
traceability and thematic organization.

---

## 🧩 Scope & Responsibilities

✅ Responsibilities:

- Define how to chronologically track civic records (`timeline/`)
- Define how to structure finalized civic documents (`bylaws/`, `minutes/`)
- Provide clear naming conventions and frontmatter schemas

❌ Out of scope:

- Database schemas
- UI rendering formats (handled by each module)

---

## 📂 Hybrid Folder Structure

CivicPress separates civic record **evolution** from **organization**:

### 📘 `timeline/` — The Civic Ledger

```
records/
├── timeline/
│   ├── 2025-07-03/
│   │   ├── bylaw-curfew.md
│   │   └── motion-budget.md
│   ├── 2025-07-12/
│   │   └── bylaw-curfew.md
│   └── 2025-07-23/
│       └── bylaw-curfew.md
```

- Chronological folder = civic activity day
- Files reflect civic evolution (e.g., drafts, amendments, approvals)
- Every change is tracked in Git commits

### 📚 `bylaws/`, `minutes/` — Thematic Archive

```
records/
├── bylaws/
│   ├── section-01/
│   │   └── bylaw-curfew.md
├── minutes/
│   ├── regular/
│   │   └── meeting-2025-07-03.md
│   └── emergency/
```

- Once adopted, finalized records are moved (or referenced) here
- This is what citizens browse
- Mirrors government structure

---

## 🔁 Record Synchronization Policy

If a record exists in the structured folders (e.g.,
`bylaws/section-02/bylaw-curfew.md`) and future edits occur in the `timeline/`,
the structured file **must eventually reflect those changes**.

Valid approaches:

- ✅ Update the structured file in-place (with Git commit + changelog)
- ✅ Replace with a new version (archive the old version clearly)
- ✅ Use `source:` or `latest:` in frontmatter to link to the timeline

This ensures:

- The structured archive always reflects the most recent civic decisions
- The `timeline/` remains the canonical ledger of civic activity
- There is no ambiguity about which version is current

All modules that publish civic records **must respect this lifecycle**.

---

## 🧠 YAML Frontmatter Structure

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

---

## 🔐 Security & Trust Considerations

- All civic records must live in Git for traceability
- Record moves from `timeline/` to structured folders must be done via commits
- No file should be silently overwritten — changes must be transparent
- Sensitive data (e.g., internal notes or drafts not meant for public view)
  should live in a separate `/internal/` folder or module-specific `.meta.yml`
  sidecars

---

## 🧪 Testing & Validation

- ✅ Create draft in `timeline/YYYY-MM-DD/` → visible in dev UI
- ✅ Commit edited record → tracked in Git with correct author
- ✅ Move record to `bylaws/` → `source:` link remains intact
- ✅ Render diff between timeline and structured file
- ✅ Run `civic lint:records` to validate naming, structure, frontmatter

---

## 🛠️ Future Enhancements

- `civic index` command to regenerate a public search index
- `civic trace` tool to follow a record's full evolution across timeline
- Ability to render a civic "ledger" from commits and frontmatter status
- Visual timeline explorer for historical civic decisions

---

## 📅 History

- Drafted: 2025-07-03
- Updated: 2025-07-03
