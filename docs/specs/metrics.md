# 📈 CivicPress Spec: `metrics.md`

---
version: 1.0.0
status: stable
created: '2025-07-03'
updated: '2025-07-15'
deprecated: false
sunset_date: null
additions:

- comprehensive metrics documentation
- performance tracking
- security considerations
compatibility:
  min_civicpress: 1.0.0
  max_civicpress: 'null'
  dependencies:
  - 'observability.md: >=1.0.0'
  - 'api.md: >=1.0.0'
authors:
- Sophie Germain <sophie@civic-press.org>
reviewers:
- Ada Lovelace
- Irène Joliot-Curie

---

## 📛 Name

Usage Metrics & Civic Analytics

## 🎯 Purpose

Track non-sensitive usage metrics to help towns understand how their civic
platform is being used — while respecting privacy, transparency, and offline
operation.

Used for engagement dashboards, feedback loops, and strategic planning.

---

## 🧩 Scope & Responsibilities

✅ Responsibilities:

- Log basic event counts (page views, downloads, votes)
- Aggregate stats for dashboards and weekly digests
- Support CLI + API access to metrics
- Work offline with periodic export (e.g. JSON/CSV)
- Respect opt-in policies and privacy-by-design

❌ Out of Scope:

- Individual user behavior tracking
- 3rd-party analytics (Google Analytics, etc.)

---

## 🔗 Inputs & Outputs

| Action                  | Metric Captured                |
| ----------------------- | ------------------------------ |
| Page view (e.g., bylaw) | Increment `bylaw_views` count  |
| Feedback submission     | Count `feedback_submitted`     |
| Vote cast               | Count per vote outcome         |
| `/api/metrics`          | Returns aggregate metrics JSON |
| CLI: `civic metrics`    | Outputs readable summary       |

---

## 📂 File/Folder Location

```
.civic/metrics.json
core/metrics.ts
```

## 📝 Example Metrics Policy Configuration

```yaml
# .civic/metrics.yml
metrics:
  enabled: true
  retention_days: 365
  export_formats:
    - 'json'
    - 'csv'

  tracked_events:
    - 'bylaw_view'
    - 'feedback_submitted'
    - 'vote_cast'
    - 'login'
    - 'record_created'
    - 'record_approved'

  privacy:
    anonymize_ip: true
    exclude_roles:
      - 'admin'
      - 'moderator'
    min_count_public: 5 # Hide metrics with <5 events

  dashboard:
    enabled: true
    public: true
    refresh_interval: '1h'
    show_trends: true
    show_module_usage: true

  notifications:
    weekly_digest: true
    notify_roles:
      - 'clerk'
      - 'mayor'
```

---

## 📝 Example `metrics.json`

```json
{
  "bylaw_views": 2123,
  "feedback_submitted": 84,
  "votes_cast": {
    "for": 56,
    "against": 13
  },
  "module_usage": {
    "legal-register": 43,
    "feedback": 12
  }
}
```

---

## 🔐 Security & Trust Considerations

- No personal identifiers stored
- Public dashboards should avoid low-volume deanonymization
- Metrics should be explainable and exportable

---

## 🧪 Testing & Validation

- Trigger mock events and verify count increment
- Test data persistence across restarts
- Confirm API and CLI match
- Export metrics as CSV or dashboard JSON

---

## 🛠️ Future Enhancements

- Time-series breakdown (daily/weekly)
- Per-module engagement charts
- Export-to-Excel plugin
- Real-time viewer for public metrics

## 🔗 Related Specs

- [`activity-log.md`](./activity-log.md) — Event logging and audit trail
- [`observability.md`](./observability.md) — System health and monitoring
- [`feedback.md`](./feedback.md) — User engagement and feedback metrics
- [`api.md`](./api.md) — Metrics API endpoints

---

## 📅 History

- Drafted: 2025-07-04
