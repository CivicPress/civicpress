# CivicPress Spec: `archive-policy.md`

---

version: 1.0.0 status: stable created: '2025-07-03' updated: '2025-07-15'
deprecated: false sunset_date: null breaking_changes: [] additions:

- comprehensive archive policy documentation
- data retention
- authenticity preservation fixes: [] migration_guide: null compatibility:
 min_civicpress: 1.0.0 max_civicpress: 'null' dependencies:
 - 'public-data-structure.md: >=1.0.0'
 - 'storage.md: >=1.0.0' authors:
- Sophie Germain <sophie@civicpress.io> reviewers:
- Ada Lovelace
- Irène Joliot-Curie

---

## Name

`archive-policy` — Civic Record Retention, Expiry, and Transparency

## Purpose

Establish principles and default rules for archiving civic records in
CivicPress, ensuring transparency, compliance, and historical continuity.

---

## Scope & Responsibilities

Responsibilities:

- Define how long records are retained
- Specify what gets archived vs deleted
- Outline folder structure and archival metadata
- Guide visibility, purging, and version pinning

Out of scope:

- Encrypted or private data retention (see `auth.md`)
- Personal information policies (see `privacy-policy.md`)

---

## Inputs & Outputs

| Input | Description |
| ------------------ | -------------------------------------------------- |
| Civic records | Records to be archived (bylaws, resolutions, etc.) |
| Retention policies | Rules determining when records expire |
| Archive metadata | Information about the archival process |
| Audit logs | Records of archive operations |

| Output | Description |
| ---------------- | ------------------------------------ |
| Archived records | Records moved to archive structure |
| Archive metadata | Documentation of archival process |
| Audit trail | Logs of archive operations |
| Archive index | Searchable index of archived content |

---

## File/Folder Location

```
.civic/
├── records/
│ ├── bylaws/
│ ├── resolutions/
│ └── feedback/
├── archive/
│ ├── bylaws/
│ │ └── repealed/
│ ├── resolutions/
│ │ └── expired/
│ └── feedback/
│ └── expired/
└── audit/
 └── archive-logs/
```

Archive operations are handled by:

- `core/archive.ts` - Main archive functionality
- `core/retention.ts` - Retention policy enforcement
- `core/audit.ts` - Archive audit logging

---

## ️ Archive Structure (Default)

```
records/
├── bylaws/
│ └── section-02/
│ └── bylaw-curfew.md
├── archive/
│ ├── bylaws/
│ │ └── repealed/
│ │ └── bylaw-lawn-watering-1998.md
│ └── resolutions/
│ └── expired/
│ └── resolution-summer-parking.md
```

Records are never deleted — they're **moved to `/archive/`** and tagged
accordingly.

---

## Retention Rules (Defaults)

| Type | Retention Duration | Archive Action |
| ---------------- | ------------------ | ----------------------------------------- |
| Bylaws | ∞ (indefinite) | Repealed → `/archive/bylaws/repealed/` |
| Resolutions | 10 years | Expired → `/archive/resolutions/expired/` |
| Feedback | 5 years | Expired or compressed |
| Sessions (video) | 3–7 years | Move or link offline |
| Drafts | 1 year | Purged unless adopted |

---

## Security & Trust Considerations

### Archive Integrity & Authenticity

- All archive operations cryptographically signed with GPG keys
- Digital signatures required for all archive actions and metadata changes
- Immutable audit trail for all archive operations and access attempts
- Version control with tamper-evident history for all archived records
- Automated detection of unauthorized access or modification to archived records

### Access Control & Permissions

- Multi-factor authentication required for all archive operations
- Role-based access control with granular permissions per archive type
- Approval workflow for all archive actions and metadata changes
- Emergency archive lockdown capability during security incidents
- Audit logging of all archive-related activities and access attempts

### Compliance & Legal Requirements

- Compliance with municipal record-keeping requirements and regulations
- Legal review process for archive policies and retention schedules
- Support for public records laws and transparency requirements
- Compliance with data retention policies for archive metadata
- Regular legal audits of archive practices and procedures

### Data Protection & Privacy

- Encryption of sensitive archive data in transit and at rest
- GDPR-compliant data retention policies for archive metadata
- Anonymization of personal data in public archive records
- User consent management for archive-related data processing
- Data sovereignty compliance for cross-border archive storage

### Audit & Transparency

- Public transparency logs for all archive operations
- Cryptographic verification of archive action authenticity
- Immutable audit trails for all archive activities
- Support for public records requests and legal discovery
- Regular transparency reports and compliance audits

### Abuse Prevention & Monitoring

- Rate limiting and abuse detection for archive operations
- Machine learning detection of coordinated archive manipulation
- Real-time monitoring of archive access patterns and volume
- Automated alerts for unusual archive activity or potential abuse
- Blacklist/whitelist management for archive content and metadata

---

## Hooks

- `onRecordArchive` → triggers log entry, index update, optional notification
- `onRetentionCheck` → periodic script validates records nearing expiry

---

## Audit Log

CivicPress may implement:

```
.audit/
├── 2025-07-03/
│ └── archive-log.md
```

This includes:

- What was archived
- Why
- Who did it

---

## Testing & Validation

- Test archive workflow with sample records
- Verify retention rules are enforced correctly
- Ensure archived records remain accessible
- Test audit logging functionality
- Validate metadata preservation during archival

---

## Related Specs

- [`public-data-structure.md`](./public-data-structure.md) — Data organization
 and structure
- [`storage.md`](./storage.md) — Storage systems and data persistence
- [`audit.md`](./audit.md) — Audit logging and transparency
- [`security.md`](./security.md) — Security considerations and compliance
- [`backup.md`](./backup.md) — Backup and recovery procedures

---

## ️ Future Enhancements

- Federation-level archive policies
- Cryptographic signing of archive actions
- Civic vault integration (cold storage)
- Integration with government archiving systems

---

## History

- Drafted: 2025-07-03
- Last updated: 2025-07-15
