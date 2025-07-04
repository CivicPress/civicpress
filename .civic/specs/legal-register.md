# 🧾 CivicPress Spec: `legal-register.md`

## 📛 Name

`legal-register` — CivicPress Legal Register Module (Bylaws, Motions, and Legal
Records)

## 🎯 Purpose

Manage and organize official civic legal records such as bylaws, motions,
ordinances, and resolutions in a structured, Markdown-native format.

---

## 🧩 Scope & Responsibilities

✅ Responsibilities:

- Accept Markdown records for bylaws, motions, and resolutions
- Enable indexing, status tracking, versioning, and approval flow
- Define file structure, naming, and YAML frontmatter fields
- Attach to feedback, sessions, and history timeline

❌ Out of scope:

- PDF management or media hosting
- Legal advice or interpretation

---

## 📁 File Structure

```
records/
├── bylaws/
│   ├── section-01/
│   │   └── bylaw-tree-cutting.md
│   ├── section-02/
│   │   └── bylaw-noise-restrictions.md
├── motions/
│   └── 2025-07-01/
│       └── motion-curfew-extension.md
└── resolutions/
    └── 2025-06-10/
        └── resolution-road-repair.md
```

---

## 🧠 Record Format

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

## 🔁 Lifecycle States

| Status     | Description          |
| ---------- | -------------------- |
| `draft`    | Initial proposal     |
| `proposed` | Under council review |
| `adopted`  | Approved and binding |
| `archived` | Repealed or replaced |

---

## 🛠️ CLI Commands

```bash
civic propose bylaw --title "..." --section 02
civic approve bylaw-noise-restrictions.md
civic archive bylaw-noise-restrictions.md
```

---

## 🔗 Hooks & Workflows

- `onBylawProposed` → notify roles or open review thread
- `onBylawAdopted` → trigger indexing or update dashboard
- `onBylawArchived` → move or tag file accordingly

---

## 🔐 Trust & Compliance

- All authors and approvers must exist in `roles.yml`
- Adoption requires quorum (see `git-policy.md`)
- Every bylaw must have a `number` and `title`

---

## 📊 Indexing Example

```yaml
- file: bylaws/section-02/bylaw-noise-restrictions.md
  title: 'Noise Restrictions'
  number: 'BL-2025-003'
  status: 'adopted'
  section: '02'
  adopted: '2025-07-01'
```

---

## 🧪 Testing & Validation

- Test bylaw creation and approval workflow
- Verify status transitions work correctly
- Ensure proper role-based permissions
- Test indexing and search functionality
- Validate file structure and naming conventions

---

## 🛠️ Future Enhancements

- Tracking repealed/replaced laws
- Cross-town bylaw comparison tools
- Diff visualizer between bylaw versions
- YAML signature hash for proof of publication

---

## 📅 History

- Drafted: 2025-07-03
