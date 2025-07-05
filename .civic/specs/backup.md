# 💾 CivicPress Spec: `backup.md`

---
version: 1.0.0
status: stable
created: '2025-07-03'
updated: '2025-07-15'
deprecated: false
sunset_date: null
additions:

- comprehensive backup documentation
- disaster recovery
- security considerations
compatibility:
  min_civicpress: 1.0.0
  max_civicpress: 'null'
  dependencies:
  - 'storage.md: >=1.0.0'
authors:
- Sophie Germain <sophie@civic-press.org>
reviewers:
- Ada Lovelace
- Irène Joliot-Curie

---

## 📛 Name

Backup & Archival Strategy

## 🎯 Purpose

Ensure that all civic data — including records, votes, schedules, and workflows
— can be securely backed up, exported, and restored in case of failure,
disaster, or long-term archival requirements.

CivicPress must support both **automated backups** and **manual exports** to
help towns meet transparency, accessibility, and data retention laws.

---

## 🧩 Scope & Responsibilities

✅ Responsibilities:

- Provide CLI backup command to export `.tar.gz` or `.zip`
- Support scheduled backups via cron or civic scheduler
- Allow mirroring to remote Git servers (e.g. GitHub, Gitea)
- Support local-only USB or network storage export
- Mark backups with timestamp and civic context

❌ Out of Scope:

- Encrypted storage or key rotation (future)
- Database snapshots (handled by DB later)

---

## 🔗 Inputs & Outputs

| Input               | Output                              |
| ------------------- | ----------------------------------- |
| `civic backup`      | Creates compressed snapshot archive |
| `.civic/backup.yml` | Stores config (frequency, paths)    |
| `civic schedule`    | Can trigger automated backups       |

---

## 📂 File/Folder Location

```
.civic/backup.yml
exports/backups/backup-2025-07-04.tar.gz
core/backup.ts
```

---

## 📝 Example `backup.yml`

```yaml
frequency: daily
format: tar.gz
include:
  - records/
  - .civic/
  - modules/
output: exports/backups/
```

---

## 🔐 Security & Trust Considerations

- Backup logs must be stored and verified
- Ensure permissions are respected in backup scope
- Warn if backups include secrets or private content
- Avoid uploading backups without user consent

**Data Retention:**

- Define retention period for backup archives (e.g. 1 year, 7 years, or per
  local law)
- Regularly review and securely delete outdated backups

**Encryption & Integrity:**

- Backups should be encrypted at rest and in transit (future: GPG, S3
  encryption)
- Use strong passwords or keys for encrypted exports
- Sign backup archives to verify authenticity and prevent tampering

**Access Control:**

- Only authorized roles (e.g. clerk, IT admin) may create, restore, or delete
  backups
- Store backup credentials (S3, GPG keys) securely and rotate regularly
- Log all backup/restore actions for audit

**Compliance:**

- Ensure backup practices comply with local data protection, privacy, and
  retention laws (e.g. GDPR, municipal regulations)
- Exclude or redact sensitive personal data from public backups
- Document backup/restore procedures for auditability

**Best Practices:**

- Test backup and restore regularly (disaster recovery drills)
- Store backups in geographically separate locations (offsite/cloud)
- Monitor backup success/failure and alert on issues

---

## 🧪 Testing & Validation

- Generate manual and scheduled backups
- Restore from backup into a clean repo
- Verify integrity (hash, timestamp, file count)
- Confirm Git history is included (if desired)

---

## 🛠️ Future Enhancements

- GPG-signed backup archives
- Encrypted exports with password prompt
- Auto-upload to S3, GitHub Releases, or municipal vault
- Cross-town backup sharing (co-op of towns)

## 🔗 Related Specs

- [`data-integrity.md`](./data-integrity.md) — Backup integrity verification
- [`archive-policy.md`](./archive-policy.md) — Long-term retention policies
- [`scheduler.md`](./scheduler.md) — Automated backup scheduling
- [`storage.md`](./storage.md) — Storage location and format options

---

## 📅 History

- Drafted: 2025-07-04
