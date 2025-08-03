# 🧑‍💼 CivicPress Spec: `roles.yml.md`

---

version: 1.0.0 status: stable created: '2025-07-03' updated: '2025-07-15'
deprecated: false sunset_date: null breaking_changes: [] additions:

- comprehensive roles documentation
- YAML schema
- security considerations fixes: [] migration_guide: null compatibility:
  min_civicpress: 1.0.0 max_civicpress: 'null' dependencies:
  - 'permissions.md: >=1.0.0'
  - 'auth.md: >=1.0.0' authors:
- Sophie Germain <sophie@civic-press.org> reviewers:
- Ada Lovelace
- Irène Joliot-Curie

---

## 📛 Name

`.civic/roles.yml` — CivicPress Role Assignments

## 🎯 Purpose

Define the format, structure, and usage of `.civic/roles.yml`, which maps Git
users to civic roles and metadata. This file powers permissions across CLI,
workflows, approvals, and visual editors.

---

## 🧩 Scope & Responsibilities

✅ Responsibilities:

- Map Git usernames to defined roles
- Enable CLI and editors to validate permissions
- Expose human-readable civic role info
- Optionally include metadata (title, email, etc.)

❌ Out of scope:

- Authentication or login management (see future `auth.md`)
- Dynamic role assignment or delegation (future extension)

---

## 🔗 Inputs & Outputs

| Input                    | Description                         |
| ------------------------ | ----------------------------------- |
| Git usernames            | Commit authors and user identifiers |
| Role definitions         | Role types from `permissions.md`    |
| User metadata            | Names, emails, departments, titles  |
| Role assignments         | User-to-role mappings and changes   |
| Role validation requests | Permission checks and role lookups  |

| Output                  | Description                           |
| ----------------------- | ------------------------------------- |
| Role mappings           | Validated user-to-role assignments    |
| Permission decisions    | Allow/deny responses based on roles   |
| Role validation results | Role verification and status checks   |
| User metadata           | Display names and contact information |
| Audit logs              | Role assignment and change history    |

---

## 📂 File/Folder Location

```
.civic/
├── roles.yml              # User role assignments
├── role-metadata.yml      # Extended user metadata
└── role-history.yml       # Role change history

core/
├── roles.ts               # Role management logic
├── role-validator.ts      # Role validation utilities
├── role-resolver.ts       # Role lookup and resolution
└── role-audit.ts          # Role audit logging

modules/
├── roles/
│   ├── components/
│   │   ├── RoleManager.tsx # Role management UI
│   │   ├── RoleViewer.tsx # Role display component
│   │   └── RoleAssigner.tsx # Role assignment interface
│   ├── hooks/
│   │   └── useRoles.ts     # Role data hook
│   └── utils/
│       ├── role-parser.ts  # Role file parsing
│       └── role-validator.ts # Role validation utilities
└── ui/
    └── components/
        └── RoleProvider.tsx # Role context provider

tests/
├── roles/
│   ├── role-validation.test.ts
│   ├── role-assignment.test.ts
│   └── role-resolution.test.ts
└── integration/
    └── roles-integration.test.ts
```

---

## 🔐 Security & Trust Considerations

### Role Assignment Security

- All role assignments must be cryptographically signed
- Role changes require administrative approval and audit logging
- Automated validation of role assignment integrity
- Protection against unauthorized role modifications
- Role assignment history with immutable audit trails

### Access Control & Permissions

- Role-based access control for role management
- Granular permissions for role assignment and modification
- Approval workflow for role changes and assignments
- Emergency role lockdown capability during security incidents
- Audit logging of all role-related activities

### Compliance & Legal Requirements

- Compliance with municipal role management requirements
- Legal review process for role assignment policies
- Support for public records laws and transparency
- Compliance with data protection regulations
- Regular legal audits of role management practices

### Data Protection & Privacy

- Encryption of sensitive role data in transit and at rest
- GDPR-compliant role data handling and retention
- Anonymization of role metadata in public records
- User consent management for role data processing
- Data sovereignty compliance for cross-border role storage

### Audit & Transparency

- Public transparency logs for all role assignments
- Cryptographic verification of role assignment authenticity
- Immutable audit trails for all role management activities
- Support for public records requests and legal discovery
- Regular transparency reports and compliance audits

### Abuse Prevention & Monitoring

- Rate limiting and abuse detection for role operations
- Machine learning detection of coordinated role manipulation
- Real-time monitoring of role assignment patterns
- Automated alerts for unusual role activity
- Blacklist/whitelist management for role assignments

---

## 📄 Example `.civic/roles.yml`

```yaml
users:
  clerk-richmond:
    role: clerk
    name: 'Ada Lovelace'
    email: 'ada@richmond.ca'

  council-marie:
    role: council-member
    name: 'Marie Curie'

  mayor-luc:
    role: mayor
    name: 'Luc Lapointe'

  auditor-hugo:
    role: auditor
    name: 'Hugo Gagarine'
```

---

## 📚 Usage

- Validates commit authors (`git log`) in `civic lint`
- Powers dropdowns in visual editors (assign author/approver)
- Ensures approvals come from valid council members
- Helps resolve `authors:` fields in YAML to known roles

---

## 🧠 Schema

```yaml
users:
  <git-username>:
    role: <role>
    name: <display name>
    email: <optional>
    department: <optional>
    title: <optional>
```

- `role`: must match defined civic role in `permissions.md`
- `name`: for display in dashboards and records
- `email`, `department`, etc. are optional

---

## 🧪 Validation

- Check for duplicate roles
- Validate usernames are lowercase, no spaces
- Ensure all `authors:` in civic records match a known user
- Use `civic lint:roles` for checks

## 🧪 Testing & Validation

- Test role validation with valid and invalid users
- Verify duplicate role detection works correctly
- Test username format validation
- Ensure proper error messages for missing roles
- Test integration with CLI and UI components

---

## 🛠️ Future Enhancements

- Group membership or committees (e.g., finance-committee)
- Delegation tokens (temporary approval rights)
- Cross-town federation user linking (via `id:` or `key:`)

---

## 📅 History

- Drafted: 2025-07-03
