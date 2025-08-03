# 🛡️ CivicPress Spec: `moderation.md`

---

version: 1.0.0 status: stable created: '2025-07-03' updated: '2025-07-15'
deprecated: false sunset_date: null additions:

- comprehensive moderation documentation
- content integrity
- security considerations compatibility: min_civicpress: 1.0.0 max_civicpress:
  'null' dependencies:
  - 'auth.md: >=1.2.0'
  - 'permissions.md: >=1.1.0'
  - 'users.md: >=1.0.0' authors:
- Sophie Germain <sophie@civic-press.org> reviewers:
- Ada Lovelace
- Irène Joliot-Curie

---

## 📛 Name

Moderation System

## 🎯 Purpose

Enable CivicPress instances to review, flag, and moderate user-submitted content
such as public feedback, proposals, and comments.  
Protects civic workflows from spam, abuse, or bad actors — while preserving
transparency and accountability.

---

## 🧩 Scope & Responsibilities

✅ Responsibilities:

- Allow content to be flagged (spam, off-topic, offensive, etc.)
- Log moderation actions (who, what, when, why)
- Provide UI and CLI tools to review flagged items
- Enforce soft actions (hide, redact, anonymize)
- Notify moderators or maintainers when action is required

❌ Out of Scope:

- Fully automated moderation (e.g. AI content filters)
- Real-time chat moderation (no live forums in MVP)

---

## 🔗 Inputs & Outputs

| Input                            | Result                            |
| -------------------------------- | --------------------------------- |
| `/api/feedback/:id/flag`         | Flags item as problematic         |
| CLI: `civic review flagged`      | Shows queue of flagged content    |
| GitHub comment: `flag:offensive` | Interpreted as moderation trigger |
| Maintainer removes/edits record  | Logged as moderation action       |

---

## 📝 Example Moderation Log

Stored in: `.civic/moderation.log.jsonl`

```json
{
  "timestamp": "2025-07-04T14:23:00Z",
  "action": "flagged",
  "record": "records/feedback/noise-curfew-ada.md",
  "flag": "off-topic",
  "by": "u-anon-4391"
}
```

```json
{
  "timestamp": "2025-07-04T14:30:00Z",
  "action": "redacted",
  "record": "records/feedback/noise-curfew-ada.md",
  "by": "u-irene-curie",
  "reason": "Personal attack removed"
}
```

---

## 📂 File/Folder Location

```
.civic/moderation.log.jsonl
records/feedback/
core/moderation.ts
```

## 📝 Example Moderation Policy Configuration

```yaml
# .civic/moderation.yml
moderators:
  - id: 'u-irene-curie'
    name: 'Irène Joliot-Curie'
    email: 'irene@richmond.ca'
    roles: ['mayor', 'moderator']
  - id: 'u-ada-lovelace'
    name: 'Ada Lovelace'
    email: 'ada@richmond.ca'
    roles: ['clerk', 'moderator']

flag_types:
  - spam
  - off-topic
  - offensive
  - duplicate
  - resolved

thresholds:
  auto_hide: 3 # Hide content after 3 flags
  auto_review: 2 # Send to moderator after 2 flags

rate_limits:
  flag_per_user_per_day: 10
  review_per_moderator_per_day: 50

notifications:
  on_flagged: true
  on_resolved: true
  notify_roles:
    - 'moderator'
    - 'clerk'

logging:
  redact_personal_info: true
  log_retention_days: 365
```

---

## 🔐 Security & Trust Considerations

### Moderator Authentication & Authorization

- Multi-factor authentication required for all moderator accounts
- Role-based access control with granular permissions per action type
- Session management with automatic timeout and re-authentication
- Audit trail of all moderator login attempts and session activities

### Content Integrity & Transparency

- All moderation actions cryptographically signed by moderator
- Original content preserved in Git history (hidden, never deleted)
- Immutable moderation logs with tamper-evident audit trails
- Public transparency logs for non-sensitive moderation actions

### Rate Limiting & Abuse Prevention

- Sophisticated rate limiting to prevent flagging abuse
- IP-based and user-based limits with progressive penalties
- Machine learning detection of coordinated flagging campaigns
- Appeal process for users affected by false flagging

### Data Protection & Privacy

- Personal information redaction in public moderation logs
- GDPR-compliant data retention policies for moderation records
- Encrypted storage of sensitive moderator communications
- Anonymization of user data in public transparency reports

### Compliance & Legal Requirements

- Moderation policies aligned with local government regulations
- Freedom of Information Act (FOIA) compliance for public records
- Regular legal review of moderation practices and policies
- Clear appeals process for content creators and affected parties

### Security Monitoring & Incident Response

- Real-time monitoring of moderation system for suspicious activity
- Automated alerts for unusual moderation patterns or volume
- Incident response procedures for moderation system compromises
- Regular security audits and penetration testing of moderation tools

---

## 🧪 Testing & Validation

- Simulate spam or flagged content in feedback
- Review and resolve via CLI or API
- Ensure logs match action taken
- Validate access control and auditability

---

## 🛠️ Future Enhancements

- Reputation-based trust system for users
- Machine learning content filters (optional plugin)
- Community flag review queue
- Moderator dashboards and notification digests

## 🔗 Related Specs

- [`feedback.md`](./feedback.md) — User feedback and comment moderation
- [`permissions.md`](./permissions.md) — Moderator roles and permissions
- [`notifications.md`](./notifications.md) — Moderation action notifications
- [`users.md`](./users.md) — User reputation and trust systems

---

## 📅 History

- Drafted: 2025-07-04
