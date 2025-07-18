# 📝 CivicPress Spec: `activity-log.md`

---
version: 1.0.0
status: stable
created: '2025-07-03'
updated: '2025-07-15'
deprecated: false
sunset_date: null
additions:

- comprehensive activity log documentation
- event tracking
- security considerations
compatibility:
  min_civicpress: 1.0.0
  max_civicpress: 'null'
  dependencies:
  - 'auth.md: >=1.2.0'
  - 'audit.md: >=1.0.0'
authors:
- Sophie Germain <sophie@civic-press.org>
reviewers:
- Ada Lovelace
- Irène Joliot-Curie

---

## 📛 Name

Activity Log & Civic Audit Trail

## 🎯 Purpose

Track all significant user and system actions — providing a **transparent audit
trail** of edits, approvals, feedback, logins, and system events.  
Supports traceability, trust, and debugging across all CivicPress modules.

---

## 🧩 Scope & Responsibilities

✅ Responsibilities:

- Log meaningful actions (create, edit, delete, approve, flag)
- Store user ID, timestamp, action type, record path, and payload summary
- Support CLI and API queries for activity history
- Enable filters by user, type, or module
- Append-only JSONL log with optional signing

❌ Out of Scope:

- Fine-grained real-time telemetry (see `observability.md`)
- Tamper-proofing (see `data-integrity.md`)

---

## 🔗 Inputs & Outputs

| Action                    | Logged                          |
| ------------------------- | ------------------------------- |
| Approve a bylaw           | `record-approved` with metadata |
| Submit feedback           | `feedback-submitted` log entry  |
| Edit a module config      | `module-edited` event           |
| CLI: `civic log`          | Query activity trail            |
| API: `/api/logs?user=...` | Filter logs by user or action   |

---

## 📂 File/Folder Location

```
.civic/logs/activity.jsonl
core/logger.ts
```

## 📝 Example Activity Log Policy Configuration

```yaml
# .civic/activity-log.yml
activity_log:
  enabled: true
  retention_days: 730
  redact_sensitive: true
  sign_entries: true
  log_level: 'info' # debug, info, warn, error

  include_actions:
    - 'record-created'
    - 'record-edited'
    - 'record-approved'
    - 'feedback-submitted'
    - 'login'
    - 'role-changed'
    - 'module-edited'

  exclude_actions:
    - 'heartbeat'
    - 'system-ping'

  export:
    formats:
      - 'jsonl'
      - 'csv'
      - 'pdf'
    schedule: 'monthly'

  notifications:
    on_critical_action: true
    notify_roles:
      - 'clerk'
      - 'auditor'
```

---

## 📝 Example Log Entry

```json
{
  "timestamp": "2025-07-04T14:44:00Z",
  "user": "u-irene-curie",
  "action": "record-approved",
  "record": "records/bylaws/curfew.md",
  "module": "legal-register"
}
```

---

## 🔐 Security & Trust Considerations

- Logs must be append-only
- Sensitive actions (deletion, approval) should include actor info
- Optionally sign each log entry with instance key
- May redact or anonymize some actions if needed

---

## 🧪 Testing & Validation

- Simulate common actions (edit, submit, approve)
- Confirm logs written correctly and sequentially
- Validate log queries by type/user/date
- Ensure error handling for malformed entries

---

## 🛠️ Future Enhancements

- Export to CSV or PDF audit report
- GraphQL interface for dashboards
- Log tamper detection
- Signed digest of logs per day/week (e.g. Merkle root)

## 🔗 Related Specs

- [`audit.md`](./audit.md) — Audit trail and anomaly detection
- [`metrics.md`](./metrics.md) — Usage and engagement metrics
- [`data-integrity.md`](./data-integrity.md) — Log tamper detection
- [`observability.md`](./observability.md) — System health and log monitoring

---

## 📅 History

- Drafted: 2025-07-04
