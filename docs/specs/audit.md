# 📋 CivicPress Spec: `audit.md`

---
version: 1.0.0
status: stable
created: '2025-07-03'
updated: '2025-07-15'
deprecated: false
sunset_date: null
additions:

- comprehensive audit documentation
- audit trails
- security considerations
compatibility:
  min_civicpress: 1.0.0
  max_civicpress: 'null'
  dependencies:
  - 'auth.md: >=1.2.0'
  - 'permissions.md: >=1.1.0'
authors:
- Sophie Germain <sophie@civic-press.org>
reviewers:
- Ada Lovelace
- Irène Joliot-Curie

---

## 📛 Name

Civic Audit Mechanism

## 🎯 Purpose

Enable verifiable inspection of CivicPress records, actions, and logs — to
support legal compliance, third-party oversight, transparency, and historical
reconstruction.

This builds upon the `activity-log.md` and `data-integrity.md` specs.

---

## 🧩 Scope & Responsibilities

✅ Responsibilities:

- Define audit modes (manual, scheduled, external)
- Provide tooling for reviewing logs, changes, signatures
- Detect missing files, inconsistent states, unauthorized edits
- Enable export of audit reports (PDF, JSON, Markdown)
- Distinguish between civic policy audit vs system health

❌ Out of Scope:

- Legal interpretation of audit results
- Continuous monitoring (see `observability.md`)

---

## 🔗 Audit Targets

| Target            | Audit Includes                                   |
| ----------------- | ------------------------------------------------ |
| Records           | Status, version, lifecycle, manifest, signatures |
| Activity log      | Gaps, anomalies, unknown actors                  |
| Workflows         | Signed? Approved? Malicious triggers?            |
| Permissions/Roles | Unauthorized privilege changes                   |
| File system state | Orphaned files, deleted/renamed without record   |

---

## 📂 File/Folder Location

```
core/audit.ts
.civic/audit/
  ├── last-run.json
  ├── reports/2025-07-04-summary.md
  └── anomalies.jsonl
```

## 📝 Example Audit Policy Configuration

```yaml
# .civic/audit/policy.yml
audit:
  schedule: 'weekly' # daily, weekly, monthly
  run_on_push: false
  notify_roles:
    - 'clerk'
    - 'auditor'

  targets:
    records: true
    activity_log: true
    workflows: true
    permissions: true
    file_system: true

  report:
    formats:
      - 'pdf'
      - 'markdown'
      - 'json'
    include_anomalies: true
    redact_sensitive: true
    summary_only: false

  retention:
    keep_reports_days: 365
    keep_anomalies_days: 730

  external_auditors:
    enabled: false
    allowed_domains:
      - 'town.ca'
      - 'auditor.example'
```

---

## 🚨 Example Anomaly Entry

```json
{
  "type": "signature-missing",
  "record": "records/bylaws/curfew.md",
  "detected_at": "2025-07-04T17:00:00Z"
}
```

---

## 🔐 Security & Trust Considerations

- Audit outputs must be immutable (Git-committed or signed)
- Some reports may contain sensitive metadata (e.g., internal roles)
- Only authorized users can generate or review audits

---

## 🧪 Testing & Validation

- Simulate missing or invalid manifests
- Introduce permission mismatch or fake users
- Run audit CLI with known broken data
- Validate PDF/Markdown summary output

---

## 🛠️ Future Enhancements

- Web UI audit viewer
- Schedule audits (see `scheduler.md`)
- Notarize or timestamp audit result hashes
- Plugin interface for external auditors

## 🔗 Related Specs

- [`activity-log.md`](./activity-log.md) — User/system action logging
- [`data-integrity.md`](./data-integrity.md) — Hashing and tamper detection
- [`permissions.md`](./permissions.md) — Audit access control
- [`scheduler.md`](./scheduler.md) — Scheduled audit runs
- [`observability.md`](./observability.md) — System health and monitoring

---

## 📅 History

- Drafted: 2025-07-04
