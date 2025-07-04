# ✅ CivicPress Spec: `records-validation.md`

## 📛 Name

`records-validation` — Civic Record Validation Rules (`civic lint`)

## 🎯 Purpose

Define the validation rules and CLI tools used to ensure all civic records are
structurally valid, properly formatted, and compliant with CivicPress standards
before they can be published or approved.

---

## 🧩 Scope & Responsibilities

✅ Responsibilities:

- Validate frontmatter structure and required fields
- Check file naming conventions and directory paths
- Verify roles and authorship against `.civic/roles.yml`
- Detect missing metadata or unapproved records
- Help catch errors early in the civic process

❌ Out of scope:

- Content moderation or sentiment checking
- Full spellchecking or grammar enforcement

---

## 🧪 What Gets Validated

### 🔖 Frontmatter Checks

- Required fields: `title`, `status`, `module`
- Optional fields: `tags`, `authors`, `source`, `approved_by`
- Valid `status` values: `draft`, `proposed`, `approved`, `adopted`, `archived`
- Valid `module` name must match declared modules in `manifest.yml`

### 📁 File Checks

- File must reside in correct folder (`timeline/YYYY-MM-DD/`, `bylaws/`, etc.)
- File must have `.md` extension
- No duplicate slugs (based on filename or `slug:` field)
- Must not be empty

### 👥 Authorship & Roles

- All `authors:` entries must match `.civic/roles.yml`
- If `approved_by:` is present, each name must map to a `council-member`,
  `mayor`, or `admin`
- If publishing, ensure minimum quorum (from `git-policy.md`)

### 🧠 Metadata Checks

- Dates (`issued:`, `created:`, etc.) must be valid ISO dates
- `tags:` must be array of lowercase strings
- If `source:` is present, file must exist at referenced path

---

## 🔧 Usage

Run manually:

```bash
civic lint
```

Or check a single file:

```bash
civic lint records/timeline/2025-07-03/bylaw-quiet-hours.md
```

---

## 🧰 CLI Integrations

- `civic propose` auto-validates file before opening PR
- `civic approve` checks role match and record readiness
- `civic publish` refuses to run if record is invalid

---

## 🔍 Output Format

Errors are shown with file, line, and reason:

```
✖ records/timeline/2025-07-03/bylaw-quiet-hours.md
  - Missing required field: title
  - Author "Emmy Noether" not found in roles.yml
```

---

## 🔐 Security & Trust Considerations

- Validation rules must be committed and versioned
- Hooks and workflows may call validation before proceeding
- Output is human-readable and can be run offline

---

## 🧪 Testing & Validation

- Test validation with valid and invalid records
- Verify all required fields are checked
- Test role validation against `.civic/roles.yml`
- Ensure proper error messages and formatting
- Test CLI integration with other commands

---

## 🛠️ Future Enhancements

- Support `.civic/validation.yml` to customize required fields
- Add spellchecking for `title`, `summary`, `content`
- Visual feedback in CivicPress editor UI
- GitHub Action template for CI

---

## 📅 History

- Drafted: 2025-07-03
