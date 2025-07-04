# 🔐 CivicPress Spec: `permissions.md`

## 📛 Name

`permissions` — CivicPress Permissions & Role Model

## 🎯 Purpose

Define how CivicPress assigns, interprets, and enforces user roles using
Git-based identities, enabling traceable participation in civic workflows and
approvals.

---

## 🧩 Scope & Responsibilities

✅ Responsibilities:

- Define standard roles (clerk, council-member, mayor, etc.)
- Establish what each role is allowed to do (edit, approve, publish)
- Apply roles across CLI, commit metadata, and UI
- Validate actions via `.civic/roles.yml`

❌ Out of scope:

- Login and authentication (see future `auth.md`)
- GitHub/Gitea team management (external)

---

## 👥 Standard Civic Roles

| Role             | Description                                |
| ---------------- | ------------------------------------------ |
| `clerk`          | Creates, edits, and proposes civic records |
| `council-member` | Reviews, comments, and approves records    |
| `mayor`          | Final approval + publishes to main         |
| `auditor`        | Read-only, can audit commits and records   |
| `contributor`    | Proposes drafts, requires review           |
| `admin`          | Full access to system and setup            |
| `public`         | Read-only access to published civic data   |

---

## 🗃️ Roles Schema & Field Definitions

### 📄 Complete `.civic/roles.yml` Example

```yaml
# CivicPress Roles Configuration
version: '1.0'
town: 'richmond-qc'
last_updated: '2025-07-03T10:00:00Z'

# User Role Assignments
users:
  clerk-richmond:
    role: 'clerk'
    name: 'Ada Lovelace'
    email: 'ada@richmond.ca'
    department: 'Administration'
    title: 'Town Clerk'
    active: true
    created: '2025-01-15T09:00:00Z'
    permissions:
      - 'create_draft'
      - 'edit_records'
      - 'propose_changes'
      - 'view_unpublished'
      - 'trigger_workflows'
    metadata:
      phone: '+1-450-774-2641'
      office: 'Town Hall, Room 101'
      hours: 'Mon-Fri 8:30-16:30'

  council-marie:
    role: 'council-member'
    name: 'Marie Curie'
    email: 'marie.curie@richmond.ca'
    department: 'Council'
    title: 'Council Member'
    active: true
    created: '2025-01-20T14:00:00Z'
    permissions:
      - 'review_proposals'
      - 'approve_records'
      - 'view_unpublished'
      - 'comment_on_records'
    metadata:
      district: 'District 1'
      term_start: '2024-11-01'
      term_end: '2028-10-31'

  mayor-luc:
    role: 'mayor'
    name: 'Luc Lapointe'
    email: 'mayor@richmond.ca'
    department: 'Executive'
    title: 'Mayor'
    active: true
    created: '2025-01-10T10:00:00Z'
    permissions:
      - 'final_approval'
      - 'publish_records'
      - 'merge_to_main'
      - 'trigger_workflows'
      - 'view_unpublished'
    metadata:
      term_start: '2024-11-01'
      term_end: '2028-10-31'
      emergency_contact: '+1-450-774-9999'

  auditor-hugo:
    role: 'auditor'
    name: 'Hugo Gagarine'
    email: 'auditor@richmond.ca'
    department: 'Audit'
    title: 'Town Auditor'
    active: true
    created: '2025-02-01T11:00:00Z'
    permissions:
      - 'view_unpublished'
      - 'audit_records'
      - 'view_audit_logs'
    metadata:
      certification: 'CPA'
      audit_cycle: 'quarterly'

  contributor-jane:
    role: 'contributor'
    name: 'Jane Smith'
    email: 'jane.smith@richmond.ca'
    department: 'Planning'
    title: 'Planning Consultant'
    active: true
    created: '2025-03-15T13:00:00Z'
    permissions:
      - 'create_draft'
      - 'propose_changes'
    metadata:
      organization: 'Smith Planning Associates'
      contract_end: '2025-12-31'

  admin-system:
    role: 'admin'
    name: 'System Administrator'
    email: 'admin@richmond.ca'
    department: 'IT'
    title: 'System Admin'
    active: true
    created: '2025-01-01T00:00:00Z'
    permissions:
      - 'full_access'
      - 'configure_system'
      - 'manage_users'
      - 'view_audit_logs'
    metadata:
      access_level: 'superuser'
      last_login: '2025-07-03T09:30:00Z'

# Role Definitions
roles:
  clerk:
    description: 'Creates, edits, and proposes civic records'
    permissions:
      - 'create_draft'
      - 'edit_records'
      - 'propose_changes'
      - 'view_unpublished'
      - 'trigger_workflows'
    approval_required: false
    can_publish: false
    can_merge: false

  council-member:
    description: 'Reviews, comments, and approves records'
    permissions:
      - 'review_proposals'
      - 'approve_records'
      - 'view_unpublished'
      - 'comment_on_records'
    approval_required: true
    can_publish: false
    can_merge: false

  mayor:
    description: 'Final approval and publishes to main'
    permissions:
      - 'final_approval'
      - 'publish_records'
      - 'merge_to_main'
      - 'trigger_workflows'
      - 'view_unpublished'
    approval_required: false
    can_publish: true
    can_merge: true

  auditor:
    description: 'Read-only access for audit purposes'
    permissions:
      - 'view_unpublished'
      - 'audit_records'
      - 'view_audit_logs'
    approval_required: false
    can_publish: false
    can_merge: false

  contributor:
    description: 'Proposes drafts, requires review'
    permissions:
      - 'create_draft'
      - 'propose_changes'
    approval_required: true
    can_publish: false
    can_merge: false

  admin:
    description: 'Full system access and configuration'
    permissions:
      - 'full_access'
      - 'configure_system'
      - 'manage_users'
      - 'view_audit_logs'
    approval_required: false
    can_publish: true
    can_merge: true

# Permission Definitions
permissions:
  create_draft:
    description: 'Create new draft records'
    scope: 'records'
    risk_level: 'low'

  edit_records:
    description: 'Edit existing records'
    scope: 'records'
    risk_level: 'medium'

  propose_changes:
    description: 'Propose changes to records'
    scope: 'records'
    risk_level: 'low'

  review_proposals:
    description: 'Review proposed changes'
    scope: 'records'
    risk_level: 'medium'

  approve_records:
    description: 'Approve records for publication'
    scope: 'records'
    risk_level: 'high'

  final_approval:
    description: 'Give final approval for publication'
    scope: 'records'
    risk_level: 'high'

  publish_records:
    description: 'Publish records to main branch'
    scope: 'records'
    risk_level: 'high'

  merge_to_main:
    description: 'Merge changes to main branch'
    scope: 'git'
    risk_level: 'high'

  trigger_workflows:
    description: 'Trigger automated workflows'
    scope: 'system'
    risk_level: 'medium'

  view_unpublished:
    description: 'View unpublished/draft records'
    scope: 'records'
    risk_level: 'low'

  audit_records:
    description: 'Audit record changes and history'
    scope: 'records'
    risk_level: 'low'

  view_audit_logs:
    description: 'View system audit logs'
    scope: 'system'
    risk_level: 'medium'

  comment_on_records:
    description: 'Add comments to records'
    scope: 'records'
    risk_level: 'low'

  full_access:
    description: 'Full system access'
    scope: 'system'
    risk_level: 'critical'

  configure_system:
    description: 'Configure system settings'
    scope: 'system'
    risk_level: 'high'

  manage_users:
    description: 'Manage user accounts and roles'
    scope: 'system'
    risk_level: 'high'

# Approval Workflows
approval_workflows:
  bylaw_approval:
    description: 'Bylaw approval workflow'
    required_roles:
      - 'clerk'
      - 'mayor'
      - 'council-member'
    required_count: 3
    strategy: 'unanimous'
    auto_merge: false

  budget_approval:
    description: 'Budget approval workflow'
    required_roles:
      - 'clerk'
      - 'mayor'
      - 'council-member'
      - 'auditor'
    required_count: 4
    strategy: 'majority'
    auto_merge: false

  feedback_approval:
    description: 'Feedback approval workflow'
    required_roles:
      - 'clerk'
    required_count: 1
    strategy: 'any'
    auto_merge: true
```

### 📋 Field Definitions & Validation Rules

#### **User Fields**

| Field                          | Type    | Required | Description           | Validation                     |
| ------------------------------ | ------- | -------- | --------------------- | ------------------------------ |
| `version`                      | string  | ✅       | Schema version        | Must be "1.0"                  |
| `town`                         | string  | ✅       | Town identifier       | Must match manifest.id         |
| `last_updated`                 | string  | ✅       | Last update timestamp | ISO 8601 format                |
| `users.<username>.role`        | string  | ✅       | User's role           | Must be valid role name        |
| `users.<username>.name`        | string  | ✅       | Display name          | Human-readable, max 100 chars  |
| `users.<username>.email`       | string  | ❌       | Contact email         | Valid email format             |
| `users.<username>.department`  | string  | ❌       | Department            | Max 50 chars                   |
| `users.<username>.title`       | string  | ❌       | Job title             | Max 100 chars                  |
| `users.<username>.active`      | boolean | ❌       | Account status        | true/false, defaults to true   |
| `users.<username>.created`     | string  | ❌       | Account creation date | ISO 8601 format                |
| `users.<username>.permissions` | array   | ❌       | Custom permissions    | List of valid permission names |
| `users.<username>.metadata`    | object  | ❌       | Additional metadata   | Free-form object               |

#### **Role Definition Fields**

| Field                            | Type    | Required | Description         | Validation                |
| -------------------------------- | ------- | -------- | ------------------- | ------------------------- |
| `roles.<role>.description`       | string  | ✅       | Role description    | Max 200 chars             |
| `roles.<role>.permissions`       | array   | ✅       | Default permissions | List of valid permissions |
| `roles.<role>.approval_required` | boolean | ✅       | Requires approval   | true/false                |
| `roles.<role>.can_publish`       | boolean | ✅       | Can publish records | true/false                |
| `roles.<role>.can_merge`         | boolean | ✅       | Can merge to main   | true/false                |

#### **Permission Definition Fields**

| Field                            | Type   | Required | Description            | Validation                  |
| -------------------------------- | ------ | -------- | ---------------------- | --------------------------- |
| `permissions.<perm>.description` | string | ✅       | Permission description | Max 200 chars               |
| `permissions.<perm>.scope`       | string | ✅       | Permission scope       | records, git, system        |
| `permissions.<perm>.risk_level`  | string | ✅       | Security risk level    | low, medium, high, critical |

#### **Approval Workflow Fields**

| Field                                          | Type    | Required | Description              | Validation               |
| ---------------------------------------------- | ------- | -------- | ------------------------ | ------------------------ |
| `approval_workflows.<workflow>.description`    | string  | ✅       | Workflow description     | Max 200 chars            |
| `approval_workflows.<workflow>.required_roles` | array   | ✅       | Required roles           | List of valid role names |
| `approval_workflows.<workflow>.required_count` | integer | ✅       | Minimum approvals        | Positive integer         |
| `approval_workflows.<workflow>.strategy`       | string  | ✅       | Approval strategy        | any, majority, unanimous |
| `approval_workflows.<workflow>.auto_merge`     | boolean | ✅       | Auto-merge when approved | true/false               |

### 🔧 Validation Rules

#### **Required Field Validation**

```yaml
# These fields must be present and valid
required_fields:
  - version
  - town
  - last_updated
  - users
  - roles
  - permissions
```

#### **Username Validation**

```yaml
# Username format requirements
username_rules:
  pattern: '^[a-z0-9-]+$' # lowercase, alphanumeric, hyphens only
  max_length: 50
  min_length: 3
  reserved_names:
    - 'admin'
    - 'system'
    - 'root'
    - 'public'
```

#### **Role Validation**

```yaml
# Role validation rules
role_rules:
  valid_roles:
    - 'clerk'
    - 'council-member'
    - 'mayor'
    - 'auditor'
    - 'contributor'
    - 'admin'
    - 'public'
  one_role_per_user: true
  role_must_be_defined: true
```

#### **Permission Validation**

```yaml
# Permission validation rules
permission_rules:
  valid_scopes:
    - 'records'
    - 'git'
    - 'system'
  valid_risk_levels:
    - 'low'
    - 'medium'
    - 'high'
    - 'critical'
  permission_must_be_defined: true
```

### 🔐 Security Considerations

#### **Permission Inheritance**

```yaml
# Permission inheritance rules
inheritance:
  admin_inherits_all: true
  mayor_inherits_council: true
  clerk_inherits_contributor: true
  auditor_read_only: true
```

#### **Approval Escalation**

```yaml
# Approval escalation rules
escalation:
  timeout_hours: 72 # 3 days
  escalate_to_mayor: true
  emergency_override: true
  override_roles:
    - 'admin'
    - 'mayor'
```

---

## 🧰 Role Mapping via `.civic/roles.yml`

```yaml
users:
  clerk-richmond:
    role: clerk
  council-marie:
    role: council-member
  mayor-luc:
    role: mayor
  auditor-hugo:
    role: auditor
```

---

## ✅ Permissions Matrix

| Action                  | Allowed Roles                   |
| ----------------------- | ------------------------------- |
| Create draft            | clerk, contributor              |
| Approve draft           | council-member, mayor           |
| Merge to `main`         | mayor, admin (if quorum met)    |
| Edit civic record       | clerk (contributor with review) |
| Configure module        | admin                           |
| View unpublished record | clerk, auditor, council-member  |
| Trigger workflow        | clerk, mayor                    |

---

## 🔁 Example Civic Flow (Git-based MVP)

### 🏛️ Simulating a Town Approval Flow

1. `clerk-richmond` creates a new bylaw:

```bash
civic propose records/timeline/2025-07-04/bylaw-18542.md
```

2. `council-marie` logs in and approves:

```bash
civic approve records/timeline/2025-07-04/bylaw-18542.md
```

3. `mayor-luc` publishes after quorum:

```bash
civic publish records/timeline/2025-07-04/bylaw-18542.md
```

→ File is moved to `bylaws/`, Git commit shows all approvals, hooks are
triggered.

---

## 🧪 Enforcement Locations

- CLI (`civic propose`, `civic approve`, `civic publish`)
- Editors with integrated role check
- Git commit authorship (used to validate role in `.civic/roles.yml`)

---

## 🔐 Trust & Transparency

- Every action is Git-tracked and role-validated
- Reviewers and approvers must be declared in YAML
- PRs or branches must match CivicPress `git-policy.md`

---

## 🧪 Testing & Validation

- Test role-based access controls
- Verify permission enforcement in CLI commands
- Ensure proper role validation in workflows
- Test approval quorum requirements
- Validate Git commit authorship checks

---

## 🛠️ Future Enhancements

- Role delegation (e.g. vacation override)
- Auth-bound enforcement (via future `auth.md`)
- Signature or notarization-based approval
- Role-based visibility filtering in dashboards

---

## 📅 History

- Drafted: 2025-07-03
- Updated: 2025-07-03
