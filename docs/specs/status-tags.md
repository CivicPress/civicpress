# ️ CivicPress Spec: `status-tags.md`

---

version: 1.0.0 status: stable created: '2025-07-03' updated: '2025-07-15'
deprecated: false sunset_date: null additions:

- comprehensive status tag documentation
- transition security
- abuse prevention compatibility: min_civicpress: 1.0.0 max_civicpress: 'null'
 dependencies:
 - 'workflows.md: >=1.3.0'
 - 'permissions.md: >=1.1.0' authors:
- Sophie Germain <sophie@civicpress.io> reviewers:
- Ada Lovelace
- Irène Joliot-Curie

---

## Name

Civic Record Status Tags

## Purpose

Establish a shared vocabulary for tracking the **lifecycle status** of civic
records — whether proposed, under review, approved, archived, or retracted. 
This ensures clarity, consistency, and automation across modules and interfaces.

---

## Scope & Responsibilities

Responsibilities:

- Define allowed `status:` values for civic records
- Enable UI filters, workflows, and color badges based on status
- Track lifecycle transitions (e.g. `proposed → adopted`)
- Provide default badge labels for public display

Out of Scope:

- Authorizing status changes (handled by workflows/permissions)
- Legal implications of a tag (defined by each town)

---

## Inputs & Outputs

| `status:` Value | Meaning |
| --------------- | --------------------------------------- |
| `draft` | In progress, not yet proposed |
| `proposed` | Submitted for review |
| `rejected` | Voted down or returned |
| `adopted` | Officially approved and enacted |
| `archived` | No longer active, preserved for history |
| `superseded` | Replaced by a newer record |
| `retracted` | Removed due to error or legal issue |

---

## File/Folder Location

Used in:

```
records/bylaws/*.md
records/minutes/*.md
records/timeline/*.md
.civic/status.yml
```

Displayed by:

- UI badges (`status: proposed → yellow`)
- CLI filters (`civic list --status=archived`)
- API queries (`/v1/search?q=status:adopted`)

## Example Status and Tag Configuration

```yaml
# .civic/status.yml
statuses:
# Record lifecycle statuses
 draft:
 name: 'Draft'
 description: 'Work in progress, not yet published'
 color: '#6c757d'
 icon: '📝'
 public: false
 editable: true
 deletable: true

 proposed:
 name: 'Proposed'
 description: 'Submitted for review and approval'
 color: '#007bff'
 icon: '📋'
 public: true
 editable: false
 deletable: false

 adopted:
 name: 'Adopted'
 description: 'Approved and in effect'
 color: '#28a745'
 icon: '✅'
 public: true
 editable: false
 deletable: false

 expired:
 name: 'Expired'
 description: 'No longer in effect'
 color: '#dc3545'
 icon: '⏰'
 public: true
 editable: false
 deletable: false

 archived:
 name: 'Archived'
 description: 'Moved to long-term storage'
 color: '#6c757d'
 icon: '📦'
 public: true
 editable: false
 deletable: false

tags:
# Content categories
 budget:
 name: 'Budget'
 description: 'Financial matters and budget items'
 color: '#28a745'
 icon: '💰'
 public: true

 safety:
 name: 'Safety'
 description: 'Public safety and security'
 color: '#dc3545'
 icon: '🛡️'
 public: true

 infrastructure:
 name: 'Infrastructure'
 description: 'Roads, utilities, and public works'
 color: '#17a2b8'
 icon: '🏗️'
 public: true

 environment:
 name: 'Environment'
 description: 'Environmental protection and sustainability'
 color: '#20c997'
 icon: '🌱'
 public: true

 recreation:
 name: 'Recreation'
 description: 'Parks, sports, and community activities'
 color: '#fd7e14'
 icon: '⚽'
 public: true

 planning:
 name: 'Planning'
 description: 'Urban planning and development'
 color: '#6f42c1'
 icon: '🏘️'
 public: true

# Internal tags
 confidential:
 name: 'Confidential'
 description: 'Internal use only'
 color: '#ffc107'
 icon: '🔒'
 public: false

 urgent:
 name: 'Urgent'
 description: 'Requires immediate attention'
 color: '#dc3545'
 icon: '🚨'
 public: true

workflows:
# Status transition rules
 transitions:
 draft:
 to: ['proposed', 'deleted']
 requires_approval: false

 proposed:
 to: ['adopted', 'draft', 'expired']
 requires_approval: true
 approval_roles: ['mayor', 'clerk']

 adopted:
 to: ['expired', 'archived']
 requires_approval: true
 approval_roles: ['mayor', 'clerk']

 expired:
 to: ['archived']
 requires_approval: false

 archived:
 to: []
 requires_approval: false

validation:
 required_tags: false
 max_tags_per_record: 5
 allow_custom_tags: true
 custom_tag_approval: false
```

---

## Security & Trust Considerations

### Status Transition Security

- Cryptographic signatures required for all status change operations
- Multi-factor authentication for critical status transitions
- Role-based access control with granular permissions per status type
- Audit trail with tamper-evident logging for all status changes
- Approval workflow for sensitive status transitions (e.g., adopted → retracted)

### Data Integrity & Validation

- Input validation and sanitization for all status tag content
- Prevention of malicious code injection through status descriptions
- Automated detection of inappropriate or offensive status labels
- Version control and rollback capability for status configuration changes
- Regular security audits of status management systems

### Access Control & Permissions

- Granular permissions for status creation, modification, and deletion
- Multi-factor authentication for status administrator access
- Approval workflow for new status types and tag categories
- Emergency lockdown capability for status system during security incidents
- Audit logging of all status-related activities and configuration changes

### Compliance & Governance

- Compliance with municipal record-keeping requirements and regulations
- Legal review process for status definitions and transition rules
- Support for public records laws and transparency requirements
- Compliance with data retention policies for status history
- Regular legal audits of status management practices

### Abuse Prevention & Monitoring

- Rate limiting and abuse detection for status tag creation and modification
- Machine learning detection of coordinated status manipulation attempts
- Real-time monitoring of status change patterns and volume
- Automated alerts for unusual status activity or potential abuse
- Blacklist/whitelist management for status tag content

### Transparency & Accountability

- Public transparency logs for non-sensitive status changes
- Cryptographic verification of status change authenticity
- Immutable audit trails for all status-related activities
- Support for public records requests and legal discovery
- Regular transparency reports and compliance audits

---

## Testing & Validation

- Validate all status values against spec
- Confirm UI displays correct badges
- Test filtering by status in CLI and UI
- Ensure workflows trigger on status transitions

---

## ️ Future Enhancements

- Custom town-defined statuses in `.civic/status.yml`
- Status-specific print or display templates
- Timeline of status history per record

---

## History

- Drafted: 2025-07-04
