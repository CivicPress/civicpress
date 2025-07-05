# 🧑‍💼 CivicPress Spec: `roles.yml.md`

---
version: 1.0.0
status: stable
created: '2025-07-03'
updated: '2025-07-15'
deprecated: false
sunset_date: null
additions:

- comprehensive roles documentation
- YAML schema
- security considerations
compatibility:
  min_civicpress: 1.0.0
  max_civicpress: 'null'
  dependencies:
  - 'permissions.md: >=1.1.0'
  - 'auth.md: >=1.2.0'
authors:
- Sophie Germain <sophie@civic-press.org>
reviewers:
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

---

## 🔐 Security & Trust Considerations

- This file is Git-committed and publicly visible
- All commit authors must resolve to an entry here
- Future auth layer may validate signatures or tokens

---

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
