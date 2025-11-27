# ⏰ CivicPress Spec: `scheduler.md`

---

version: 1.0.0 status: stable created: '2025-07-03' updated: '2025-07-15'
deprecated: false sunset_date: null additions:

- comprehensive scheduler documentation
- execution security
- automation patterns compatibility: min_civicpress: 1.0.0 max_civicpress:
 'null' dependencies:
 - 'workflows.md: >=1.3.0'
 - 'hooks.md: >=1.2.0' authors:
- Sophie Germain <sophie@civicpress.io> reviewers:
- Ada Lovelace
- Irène Joliot-Curie

---

## Name

Civic Scheduler & Timed Actions

## Purpose

Allow towns to schedule civic actions — like publishing a record, triggering a
workflow, or posting a notification — to occur **at a future time or on a
recurring basis**.

This enables delayed approvals, daily reports, reminders, and pre-announced
rollouts.

---

## Scope & Responsibilities

Responsibilities:

- Schedule execution of workflows or CLI commands
- Use cron-style or ISO timestamps
- Store timers as civic-readable config files
- Allow dry-run previews of scheduled actions

Out of Scope:

- Distributed job queues (initially)
- Millisecond-level precision

---

## Inputs & Outputs

| Input | Output |
| --------------------------- | ------------------------------- |
| `.civic/schedule.yml` | Defines scheduled civic actions |
| `civic schedule run` | CLI executor for due tasks |
| UI action (e.g. delay post) | Adds entry to schedule file |

---

## File/Folder Location

```
.civic/schedule.yml
core/scheduler.ts
```

Example `schedule.yml`:

```yaml
- id: announce-archive-policy
 run_at: 2025-07-08T08:00:00Z
 command: civic notify --group=council --message="Reminder: Archive policy in effect today"

- id: publish-curfew-bylaw
 run_at: 2025-07-10T00:00:00Z
 command: civic publish records/bylaws/curfew.md
```

---

## Civic Example: Scheduled Law Activation

A town council adopts a fireworks ban bylaw that takes effect at the end of the
year.

### Record

```yaml
title: 'Bylaw 2025-18: Fireworks Ban'
status: adopted
effective_at: 2025-12-31T00:00:00Z
```

### Schedule

```yaml
- id: publish-fireworks-ban
 run_at: 2025-12-31T00:00:00Z
 command: civic publish records/bylaws/2025-18-fireworks-ban.md

- id: fireworks-ban-reminder
 run_at: 2025-12-30T12:00:00Z
 command: civic notify --group=public --message="🚫 Reminder: Fireworks ban takes effect tomorrow."
```

This ensures the record goes live precisely when intended — and citizens are
reminded in advance. All actions are logged for full traceability.

---

## Security & Trust Considerations

### Job Execution Security

- All scheduled jobs require cryptographic signatures for execution
- Multi-factor authentication for critical scheduled operations
- Role-based access control with granular permissions per job type
- Audit trail with tamper-evident logging for all scheduled job executions
- Approval workflow for sensitive scheduled operations (e.g., record publishing)

### Job Validation & Integrity

- Input validation and sanitization for all scheduled job parameters
- Prevention of command injection through job configuration
- Automated detection of malicious or inappropriate scheduled commands
- Version control and rollback capability for job configuration changes
- Regular security audits of job scheduling and execution systems

### Access Control & Permissions

- Granular permissions for job creation, modification, and deletion
- Multi-factor authentication for scheduler administrator access
- Approval workflow for new job types and recurring schedules
- Emergency job cancellation capability during security incidents
- Audit logging of all scheduler-related activities and configuration changes

### Compliance & Governance

- Compliance with municipal record-keeping requirements and regulations
- Legal review process for scheduled operations affecting public records
- Support for public records laws and transparency requirements
- Compliance with data retention policies for job execution history
- Regular legal audits of scheduling practices and procedures

### Abuse Prevention & Monitoring

- Rate limiting and abuse detection for job creation and scheduling
- Machine learning detection of coordinated job manipulation attempts
- Real-time monitoring of job execution patterns and volume
- Automated alerts for unusual job activity or potential abuse
- Blacklist/whitelist management for job commands and parameters

### Data Protection & Privacy

- Encryption of sensitive job data in transit and at rest
- GDPR-compliant data retention policies for job execution logs
- Anonymization of personal data in public job logs
- User consent management for job-related data processing
- Data sovereignty compliance for cross-border job execution

---

## Testing & Validation

- Create sample jobs and confirm execution
- Simulate missed jobs (e.g. clock lag)
- Validate job logs with status
- Ensure dry-run mode shows output without execution

---

## ️ Future Enhancements

- Crontab syntax for recurring jobs
- Webhook or system job integration
- UI-based scheduler manager
- Long-term audit view of job history
- Module-level schedules

## Related Specs

- [`workflows.md`](./workflows.md) — Scheduled workflow execution
- [`notifications.md`](./notifications.md) — Scheduled notification delivery
- [`backup.md`](./backup.md) — Automated backup scheduling
- [`hooks.md`](./hooks.md) — Event-driven scheduling triggers

---

## History

- Drafted: 2025-07-04
