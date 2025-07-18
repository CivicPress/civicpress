# 📊 CivicPress Spec: `observability.md`

---
version: 1.0.0
status: stable
created: '2025-07-03'
updated: '2025-07-15'
deprecated: false
sunset_date: null
additions:

- comprehensive observability documentation
- monitoring patterns
- security considerations
compatibility:
  min_civicpress: 1.0.0
  max_civicpress: 'null'
  dependencies:
  - 'api.md: >=1.0.0'
  - 'deployment.md: >=1.0.0'
authors:
- Sophie Germain <sophie@civic-press.org>
reviewers:
- Ada Lovelace
- Irène Joliot-Curie

---

## 📛 Name

Observability & Audit Trail

## 🎯 Purpose

Ensure that all critical actions in CivicPress — from feedback to approvals to
workflow execution — are **visible, traceable, and auditable**.  
This supports civic trust, debugging, transparency, and operational health.

---

## 🧩 Scope & Responsibilities

✅ Responsibilities:

- Log all significant events (CLI, API, UI)
- Track workflow execution and errors
- Enable audit logs of civic record changes
- Collect basic metrics for performance monitoring

❌ Out of Scope:

- Full-stack tracing (handled by external APM tools)
- Usage analytics of end users (unless anonymized)

---

## 🔗 Inputs & Outputs

| Triggered by           | Logged to                      |
| ---------------------- | ------------------------------ |
| CLI or API command     | `.civic/logs/action.log.jsonl` |
| Workflow run           | `.civic/hooks.log.jsonl`       |
| Error/exception        | `.civic/logs/error.log.jsonl`  |
| Audit action (approve) | `.civic/audit.log.jsonl`       |

---

## 📂 File/Folder Location

```
.civic/logs/
  └── action.log.jsonl
  └── error.log.jsonl
.civic/hooks.log.jsonl
.civic/audit.log.jsonl
.civic/observability.yml
```

## 📝 Example Observability Configuration

```yaml
# .civic/observability.yml
logging:
  level: 'info' # debug, info, warn, error
  format: 'jsonl'
  rotation:
    max_size: '10MB'
    max_files: 5
    compress: true

  files:
    action: '.civic/logs/action.log.jsonl'
    error: '.civic/logs/error.log.jsonl'
    audit: '.civic/logs/audit.log.jsonl'
    hooks: '.civic/hooks.log.jsonl'

monitoring:
  metrics:
    enabled: true
    port: 9090
    path: '/metrics'

  health_checks:
    enabled: true
    interval: '30s'
    endpoints:
      - '/health'
      - '/ready'
      - '/live'

audit:
  enabled: true
  redact_sensitive: true
  public_logs: ['audit', 'hooks']
  private_logs: ['action', 'error']

  events:
    - 'user.login'
    - 'record.create'
    - 'record.update'
    - 'record.delete'
    - 'vote.cast'
    - 'signature.add'
    - 'workflow.execute'
    - 'backup.create'

alerts:
  webhooks:
    - url: 'https://hooks.slack.com/...'
      events: ['error', 'backup.failed']

  email:
    enabled: false
    smtp_host: 'smtp.town.ca'
    recipients: ['admin@town.ca']
```

---

## 🔐 Security & Trust Considerations

- Logs should redact sensitive info before commit
- Some logs (audit, workflow) may be public, others private
- CLI or server may use `logLevel` config to filter verbosity
- Tamper detection (sign logs) may be added in the future

---

## 🧪 Testing & Validation

- Trigger known CLI/API actions and confirm logs
- Validate log rotation or cleanup behavior
- Confirm that logs are JSONL and parseable
- Simulate workflow errors and ensure visibility

---

## 🛠️ Future Enhancements

- CivicPress dashboard with status/metrics (live observability)
- Pluggable external sinks (e.g., Loki, Logstash, Sentry)
- Real-time webhook monitor
- Graph of event correlation (feedback → workflow → result)

---

## 📅 History

- Drafted: 2025-07-04
