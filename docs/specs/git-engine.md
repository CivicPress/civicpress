# ⚙️ CivicPress Spec: `git-engine.md`

---

version: 1.0.0 status: stable created: '2025-07-03' updated: '2025-07-15'
deprecated: false sunset_date: null breaking_changes: [] additions:

- detailed YAML examples
- comprehensive field definitions
- security considerations fixes: [] migration_guide: null compatibility:
  min_civicpress: 1.0.0 max_civicpress: 'null' dependencies:
  - 'auth.md: >=1.0.0'
  - 'permissions.md: >=1.0.0' authors:
- Sophie Germain <sophie@civic-press.org> reviewers:
- Ada Lovelace
- Irène Joliot-Curie

---

## 📛 Name

`git-engine` — CivicPress Git Engine Integration

## 🎯 Purpose

Provide a built-in Git engine for CivicPress to enable local-first civic record
keeping, audit logging, and offline publishing.

CivicPress treats Git as the **canonical ledger** for all civic records.

---

## 🧩 Scope & Responsibilities

✅ Responsibilities:

- Enable local commits, branches, merges, and history
- Use Git for audit logging and traceability
- Provide secure wrapper commands for Git actions
- Support CLI and API usage
- Support sync with upstream (e.g. GitHub)

❌ Out of scope:

- Exposing raw Git to UI users
- Git hosting (GitHub/Gitea/etc.)

---

## 🔗 Inputs & Outputs

Triggered by: CivicPress Core, modules, or CLI commands  
Input: record changes (files), actions (publish, approve)  
Output: Git commits, logs, status changes

---

## 📂 File/Folder Location

```
core/git-engine.ts         # Git wrapper library
cli/commands/git.ts        # `civic git` commands
.civic/hooks.log.jsonl     # Optional hook logs
records/                   # Files under Git version control
```

---

## 🧠 Git Engine Configuration Examples

### 📄 Example Git Configuration (`.civic/git.yml`)

```yaml
# Git engine configuration
git:
  # Repository settings
  repository:
    path: './records'
    remote: 'origin'
    branch: 'main'

  # Commit settings
  commits:
    require_signature: true
    role_prefix: true
    conventional_format: true
    max_message_length: 72

  # Role-based commit patterns
  roles:
    clerk:
      pattern: 'feat(clerk): {message}'
      allowed_actions: ['create', 'update', 'publish']

    council:
      pattern: 'feat(council): {message}'
      allowed_actions: ['approve', 'reject', 'amend']

    mayor:
      pattern: 'feat(mayor): {message}'
      allowed_actions: ['approve', 'veto', 'sign']

    public:
      pattern: 'feat(public): {message}'
      allowed_actions: ['comment', 'propose']

  # Audit logging
  audit:
    enabled: true
    log_file: '.civic/git-audit.log'
    include_payload: true
    retention_days: 365

  # Security settings
  security:
    require_authentication: true
    validate_permissions: true
    sandbox_commands: true
    max_file_size: '10MB'
```

### 📄 Example Commit Message Format

```yaml
# Example commit for publishing a bylaw
message: 'feat(clerk): publish noise restriction bylaw'
author: 'clerk-richmond <clerk@richmond-qc.ca>'
timestamp: '2025-07-03T14:30:00Z'
role: 'clerk'
action: 'publish'
record:
  type: 'bylaw'
  title: 'Noise Restrictions'
  path: 'records/bylaws/section-02/bylaw-noise-restrictions.md'
  status: 'published'
context:
  town: 'richmond-qc'
  environment: 'production'
  approval_chain: ['council', 'mayor']
```

### 📄 Example CLI Commands

```bash
# Create a new civic record
civic git commit --role clerk --action create --message "Add noise bylaw"

# Approve a record
civic git commit --role council --action approve --message "Approve noise bylaw"

# Publish a record
civic git commit --role clerk --action publish --message "Publish noise bylaw"

# View audit log
civic git audit --since "2025-07-01" --role clerk

# Sync with remote
civic git sync --remote origin --branch main
```

---

## 🔐 Security & Trust Considerations

- All Git actions must pass through controlled CLI/API functions
- Role-based actions (e.g., only clerks can `approve`)
- All commits must be signed or logged
- Use safe commit messages and naming conventions
- Sandbox all Git operations to prevent malicious commands
- Validate file paths and prevent directory traversal
- Audit all Git operations for compliance

---

## 🧪 Testing & Validation

- Create dummy civic records, commit, inspect log
- Test role-restricted commands
- Ensure rebase, merge, rollback work safely
- Validate commit message format and role permissions
- Test audit logging and compliance reporting
- Verify sandbox security prevents unauthorized access

---

## 🛠️ Future Enhancements

- Web-based Git UI (for clerk/staff)
- Signatures & attestations per commit
- Git federation (pull civic data from other towns)
- Advanced branching strategies for complex workflows
- Integration with external Git hosting services
- Blockchain-style immutable audit trails

---

## 📅 History

- Drafted: 2025-07-05
- Last updated: 2025-07-05
