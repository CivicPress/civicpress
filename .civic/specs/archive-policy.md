# 🗃️ CivicPress Spec: `archive-policy.md`

## 📛 Name

`archive-policy` — Civic Record Retention, Expiry, and Transparency

## 🎯 Purpose

Establish principles and default rules for archiving civic records in
CivicPress, ensuring transparency, compliance, and historical continuity.

---

## 🧩 Scope & Responsibilities

✅ Responsibilities:

- Define how long records are retained
- Specify what gets archived vs deleted
- Outline folder structure and archival metadata
- Guide visibility, purging, and version pinning

❌ Out of scope:

- Encrypted or private data retention (see `auth.md`)
- Personal information policies (see `privacy-policy.md`)

---

## 🗂️ Archive Structure (Default)

```
records/
├── bylaws/
│   └── section-02/
│       └── bylaw-curfew.md
├── archive/
│   ├── bylaws/
│   │   └── repealed/
│   │       └── bylaw-lawn-watering-1998.md
│   └── resolutions/
│       └── expired/
│           └── resolution-summer-parking.md
```

Records are never deleted — they're **moved to `/archive/`** and tagged
accordingly.

---

## 🧠 Retention Rules (Defaults)

| Type             | Retention Duration | Archive Action                            |
| ---------------- | ------------------ | ----------------------------------------- |
| Bylaws           | ∞ (indefinite)     | Repealed → `/archive/bylaws/repealed/`    |
| Resolutions      | 10 years           | Expired → `/archive/resolutions/expired/` |
| Feedback         | 5 years            | Expired or compressed                     |
| Sessions (video) | 3–7 years          | Move or link offline                      |
| Drafts           | 1 year             | Purged unless adopted                     |

---

## 🔐 Trust & Transparency Rules

- Archive folder **must remain public**
- YAML frontmatter must include:

```yaml
archived: true
archived_at: '2025-07-03'
archived_by: 'Albert Michelson'
reason: 'Repealed by BL-2025-018'
```

- Repealed or expired items may be linked in timeline or index, but are clearly
  marked.

---

## 🧩 Hooks

- `onRecordArchive` → triggers log entry, index update, optional notification
- `onRetentionCheck` → periodic script validates records nearing expiry

---

## 📊 Audit Log

CivicPress may implement:

```
.audit/
├── 2025-07-03/
│   └── archive-log.md
```

This includes:

- What was archived
- Why
- Who did it

---

## 🧪 Testing & Validation

- Test archive workflow with sample records
- Verify retention rules are enforced correctly
- Ensure archived records remain accessible
- Test audit logging functionality
- Validate metadata preservation during archival

---

## 🛠️ Future Enhancements

- Federation-level archive policies
- Cryptographic signing of archive actions
- Civic vault integration (cold storage)
- Integration with government archiving systems

---

## 📅 History

- Drafted: 2025-07-03
