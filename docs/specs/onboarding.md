# 🚀 CivicPress Spec: `onboarding.md`

---
version: 1.0.0
status: stable
created: '2025-07-03'
updated: '2025-07-15'
deprecated: false
sunset_date: null
additions:

- comprehensive onboarding documentation
- user experience patterns
- security considerations
compatibility:
  min_civicpress: 1.0.0
  max_civicpress: 'null'
  dependencies:
  - 'ui.md: >=1.0.0'
  - 'auth.md: >=1.2.0'
authors:
- Sophie Germain <sophie@civic-press.org>
reviewers:
- Ada Lovelace
- Irène Joliot-Curie

---

## 📛 Name

Town Onboarding & Setup Flow

## 🎯 Purpose

Define how a **new municipality, clerk, or contributor** can initialize
CivicPress for the first time — including local dev setup, Git repo
bootstrapping, civic role assignment, and optional starter templates.

A smooth onboarding experience accelerates adoption and reduces technical
friction.

---

## 🧩 Scope & Responsibilities

✅ Responsibilities:

- Guide users through first-time repo setup
- Offer optional `civic init` CLI flow
- Setup default folders, `.civic/`, `roles.yml`
- Assign initial users and roles
- Offer sample data (minutes, bylaws, etc.)

❌ Out of Scope:

- Hosting or deployment platform logic
- Real-time multiplayer setup - Multiple people editing the same record at the
  same time (see future `collaboration.md`)

---

## 🔗 Inputs & Outputs

| Action            | Output Files/Folders                     |
| ----------------- | ---------------------------------------- |
| `civic init`      | Initializes `.civic/`, `records/`, roles |
| Template selected | Populates sample files in `records/`     |
| Clerk added       | Updates `.civic/roles.yml`               |

---

## 📂 File/Folder Location

```
.civic/
├── init.config.yml       # Optional template options
├── roles.yml             # Initial roles
records/
└── README.md             # Placeholder index
```

## 📝 Example Onboarding Configuration

```yaml
# .civic/init.config.yml
town:
  name: 'Richmond'
  province: 'Quebec'
  country: 'Canada'
  website: 'https://richmond.ca'
  contact:
    email: 'info@richmond.ca'
    phone: '+1-450-000-0000'

setup:
  template: 'standard' # standard, minimal, comprehensive
  public_repo: true
  sample_data: true

  initial_roles:
    - name: 'Ada Lovelace'
      email: 'ada@richmond.ca'
      role: 'clerk'
      github: 'adalovelace'

    - name: 'Irène Joliot-Curie'
      email: 'irene@richmond.ca'
      role: 'mayor'
      github: 'irenecurie'

templates:
  standard:
    description: 'Standard municipal setup with common folders'
    folders:
      - 'records/bylaws/'
      - 'records/minutes/'
      - 'records/permits/'
      - 'records/feedback/'
      - 'records/announcements/'

    sample_files:
      - 'records/bylaws/sample-bylaw.md'
      - 'records/minutes/sample-minutes.md'
      - 'records/announcements/welcome.md'

  minimal:
    description: 'Minimal setup for small towns'
    folders:
      - 'records/bylaws/'
      - 'records/minutes/'

    sample_files:
      - 'records/bylaws/sample-bylaw.md'

  comprehensive:
    description: 'Full setup with all modules'
    folders:
      - 'records/bylaws/'
      - 'records/minutes/'
      - 'records/permits/'
      - 'records/feedback/'
      - 'records/announcements/'
      - 'records/legal-register/'
      - 'records/archive/'

    sample_files:
      - 'records/bylaws/sample-bylaw.md'
      - 'records/minutes/sample-minutes.md'
      - 'records/permits/sample-permit.md'
      - 'records/feedback/sample-feedback.md'
      - 'records/announcements/welcome.md'
      - 'records/legal-register/sample-register.md'

git:
  initial_commit: true
  branch: 'main'
  remote: 'origin'
  auto_push: false

notifications:
  welcome_email: true
  setup_complete: true
  next_steps: true
```

---

## 🔐 Security & Trust Considerations

- Users must explicitly assign themselves a role
- On cloud instances, onboarding must be rate-limited and audited
- Initial repo can be public or private depending on civic policy

---

## 🧪 Testing & Validation

- Run `civic init` and confirm folder creation
- Validate that required roles are defined
- Ensure empty state still works (no sample data)
- Test onboarding from UI (if applicable)

---

## 🛠️ Future Enhancements

- UI-based onboarding wizard
- GitHub-based project scaffolding (e.g. CivicPress Starter Template)
- Civic "wizard" chat agent to assist during init
- Multi-town template marketplace
- Domain + email config guide

---

## 📅 History

- Drafted: 2025-07-04
