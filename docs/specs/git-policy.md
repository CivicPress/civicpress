# 🔧 CivicPress Spec: `git-policy.md`

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

`git-policy` — CivicPress Git Commit & Branch Policy

## 🎯 Purpose

Define how CivicPress enforces commit rules, branch protections, user roles, and
civic editing flows using Git.

---

## 🧩 Scope & Responsibilities

✅ Responsibilities:

- Validate commit messages and formats
- Enforce role-based branching rules (e.g., clerk vs. contributor)
- Integrate with visual editors and CLI
- Define civic-friendly Git workflows (draft → review → publish)

❌ Out of scope:

- Git server setup (e.g., GitHub vs. Gitea)
- Hosting deployment logic

---

## 🔗 Inputs & Outputs

| Input                | Description                                    |
| -------------------- | ---------------------------------------------- |
| Git commits          | Commit messages, metadata, and changes         |
| Branch operations    | Branch creation, merging, and protection       |
| User roles           | Role-based permissions from `.civic/roles.yml` |
| Pull requests        | PR metadata, reviews, and approval status      |
| Policy configuration | Git policy rules from `.civic/git-policy.yml`  |

| Output              | Description                                   |
| ------------------- | --------------------------------------------- |
| Validated commits   | Git commits that pass policy validation       |
| Protected branches  | Branches with enforced protection rules       |
| Approval workflows  | Multi-role approval processes and status      |
| Audit logs          | Git operation history and policy enforcement  |
| Rejected operations | Blocked commits, merges, or branch operations |

---

## 🔀 Civic Branch Strategy

| Branch Type         | Purpose                                 | Naming Convention         |
| ------------------- | --------------------------------------- | ------------------------- |
| `main`              | Published civic records                 | Protected, review-only    |
| `draft/bylaw-023`   | Auto-saved in-editor changes (by clerk) | `draft/<slug>`            |
| `review/bylaw-023`  | Open PRs ready for approval             | `review/<slug>`           |
| `hotfix/<desc>`     | Emergency corrections                   | For admins only           |
| `feature/editor-ui` | Dev branch for platform changes         | Used by contributors/devs |

### Editor Flow

When a user edits a record:

1. A `draft/...` branch is created automatically
2. Changes are saved with `status: draft` in frontmatter
3. On submission, a PR is opened to `review/...` or `main`
4. CivicPress CLI or Git UI manages the merge with audit

This allows **safe drafts, review workflows, and protected publishing** without
breaking the Git-native foundation.

---

## 🔒 Git Commit Rules

| Rule                 | Description                                            |
| -------------------- | ------------------------------------------------------ |
| Conventional commits | All commits must follow format (`feat:`, `fix:`, etc.) |
| Role-based scope     | Each commit must include `Signed-by` or author role    |
| Status tags          | Drafts, review, published (in frontmatter)             |
| Required PRs         | Commits to `main` must come via PR unless in dev mode  |

---

## 🪪 Roles & Permissions (example)

| Role        | Branch Access                           | Commit Directly? | Auto-publish? |
| ----------- | --------------------------------------- | ---------------- | ------------- |
| Clerk       | `draft/*`, `review/*`, `main` (PR only) | ✅ With review   | ✅ If trusted |
| Contributor | `draft/*`                               | ✅               | ❌            |
| Admin       | All                                     | ✅               | ✅            |

---

## 🛠️ Commit Linting & Enforcement

- CLI: `civic commit` enforces policy locally
- Editor: Visual commits are routed through API or local handler
- CI: GitHub Actions (or equivalent) validates PR format and status

---

## 🗳️ Committee-Based PR Approval

CivicPress allows Pull Requests (PRs) to require approval from **multiple
users**, simulating real-world civic voting and committee processes.

### 🧠 Approval Strategies

| Strategy    | Description                                      |
| ----------- | ------------------------------------------------ |
| `any`       | One approval is sufficient                       |
| `majority`  | More than 50% of assigned reviewers must approve |
| `unanimous` | All required roles must approve before merging   |

### 👥 Role-Based Approvals

CivicPress can define approvers by role, such as:

- `clerk`
- `mayor`
- `council-member`
- `external-auditor`

For example:

- A PR to merge a new bylaw might require unanimous approval from `clerk`,
  `mayor`, and at least 2 `council-members`.

### 🔐 Enforcement Points

Approval enforcement can occur via:

- GitHub/GitLab/Gitea branch protection rules (cloud)
- CivicPress CLI (`civic approve`, `civic review --status`)
- Local Git workflows with metadata files (`APPROVALS.yml`)
- GitHub Actions or similar CI checks

This ensures that **no civic decision is merged without legitimate, multi-role
sign-off**.

---

## 📂 File/Folder Location

```
core/git-policy.ts
.civic/git-policy.yml (optional runtime config)
hooks/validate-commit.ts
```

---

## 🧠 Git Policy Configuration Examples

### 📄 Example Git Policy Configuration (`.civic/git-policy.yml`)

```yaml
# CivicPress Git Policy Configuration
version: '1.0'
town: 'richmond-qc'

# Branch protection rules
branches:
  main:
    protection:
      required_reviews: 2
      required_approvers:
        - role: 'mayor'
        - role: 'council-member'
          count: 2
      require_linear_history: true
      allow_force_push: false
      allow_deletions: false

  'draft/*':
    protection:
      required_reviews: 0
      allow_force_push: true
      allowed_roles: ['clerk', 'contributor']

  'review/*':
    protection:
      required_reviews: 1
      required_approvers:
        - role: 'council-member'
      allow_force_push: false
      allowed_roles: ['clerk', 'council-member', 'mayor']

# Commit message policies
commits:
  conventional_format: true
  required_scope: true
  max_length: 72
  allowed_types:
    - 'feat' # New civic record
    - 'fix' # Bug fix
    - 'docs' # Documentation
    - 'style' # Formatting
    - 'refactor' # Code restructuring
    - 'test' # Testing
    - 'chore' # Maintenance

  scopes:
    - 'bylaw'
    - 'motion'
    - 'feedback'
    - 'session'
    - 'budget'
    - 'cli'
    - 'ui'

# Approval workflows
approvals:
  bylaw_approval:
    required_roles:
      - 'clerk'
      - 'mayor'
      - 'council-member'
    required_count: 3
    strategy: 'unanimous'

  budget_approval:
    required_roles:
      - 'clerk'
      - 'mayor'
      - 'council-member'
      - 'auditor'
    required_count: 4
    strategy: 'majority'

  feedback_approval:
    required_roles:
      - 'clerk'
    required_count: 1
    strategy: 'any'

# Development settings
development:
  allow_direct_commits: false
  require_prs: true
  auto_merge: false
  merge_strategy: 'squash'

# Audit settings
audit:
  log_all_commits: true
  log_approvals: true
  log_merges: true
  retention_days: 2555 # 7 years
```

### 📄 Example Commit Message Templates

```yaml
# Conventional commit examples for civic records
examples:
  bylaw:
    - 'feat(bylaw): add noise restrictions for nighttime events'
    - 'fix(bylaw): correct typo in section 2.1 of curfew bylaw'

  motion:
    - 'feat(motion): approve budget increase for road repairs'
    - 'fix(motion): update meeting date in budget motion'

  feedback:
    - 'feat(feedback): implement citizen complaint system'
    - 'fix(feedback): resolve email notification issue'

  session:
    - 'feat(session): schedule emergency council meeting'
    - 'docs(session): add meeting minutes for July 3rd'
```

### 📄 Example PR Approval Metadata (`.civic/approvals.yml`)

```yaml
# Approval tracking for PR #42
pull_request: 42
title: 'feat(bylaw): add noise restrictions for nighttime events'
branch: 'review/bylaw-noise-restrictions'
created_by: 'clerk-richmond'
created_at: '2025-07-03T10:00:00Z'

# Required approvals
required_approvals:
  - role: 'clerk'
    user: 'clerk-richmond'
    status: 'approved'
    approved_at: '2025-07-03T14:30:00Z'
    comment: 'Legal review complete, ready for council vote'

  - role: 'mayor'
    user: 'mayor-luc'
    status: 'approved'
    approved_at: '2025-07-03T16:45:00Z'
    comment: 'Approved after public consultation'

  - role: 'council-member'
    user: 'council-marie'
    status: 'approved'
    approved_at: '2025-07-03T15:20:00Z'
    comment: 'Supports the measure'

  - role: 'council-member'
    user: 'council-jean'
    status: 'pending'
    comment: ''

# Approval status
status: 'pending'
approved_count: 3
required_count: 4
strategy: 'majority'
can_merge: false
```

---

## 🔐 Security & Trust Considerations

- Git metadata is civic infrastructure
- Branch names are human-readable, versionable civic history
- All changes must pass through controlled paths

---

## 🧪 Testing & Validation

- Try unauthorized commit → reject
- Push protected branch → force PR
- Lint script catches invalid commits or empty messages
- Draft and review flows tested in both CLI and UI

---

## 🛠️ Future Enhancements

- Digital signatures or signed commits
- Per-module commit policies
- Visual branch graph for audit

---

## 📅 History

- Drafted: 2025-07-03
- Updated: 2025-07-03 with civic branch strategy
