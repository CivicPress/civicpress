# 📋 CivicPress Spec: `add-version-headers.md`

---
version: 1.0.0
status: stable
created: '2025-07-03'
updated: '2025-07-15'
deprecated: false
sunset_date: null
authors:

- 'Sophie Germain <sophie@civic-press.org>'
reviewers:
- 'Ada Lovelace'
- 'Irène Joliot-Curie'

---

## 📛 Name

Version Header Standardization Guide

## 🎯 Purpose

Provide a systematic approach to add version headers to all CivicPress
specifications that currently lack them, ensuring consistency across the entire
specification ecosystem.

## 🧩 Scope & Responsibilities

✅ Responsibilities:

- Guide maintainers in standardizing spec headers
- Define required sections and fields for all specs
- Provide implementation plan and validation checklist

❌ Out of Scope:

- Automated script implementation (see tools folder)
- Spec content review (handled by individual spec files)

---

## 📊 Current Status

### ✅ Specs WITH Version Headers (8/50)

| Spec                    | Version | Status   | Last Updated |
| ----------------------- | ------- | -------- | ------------ |
| `manifest.md`           | `1.0.0` | `stable` | `2025-07-15` |
| `auth.md`               | `1.2.0` | `stable` | `2025-07-15` |
| `permissions.md`        | `1.1.0` | `stable` | `2025-07-15` |
| `git-policy.md`         | `1.1.0` | `stable` | `2025-07-15` |
| `workflows.md`          | `1.3.0` | `stable` | `2025-07-15` |
| `hooks.md`              | `1.2.0` | `stable` | `2025-07-15` |
| `plugins.md`            | `1.5.0` | `stable` | `2025-07-15` |
| `plugin-api.md`         | `1.0.0` | `stable` | `2025-07-15` |
| `plugin-development.md` | `1.0.0` | `stable` | `2025-07-15` |
| `testing-framework.md`  | `1.0.0` | `stable` | `2025-07-15` |
| `spec-versioning.md`    | `1.0.0` | `stable` | `2025-07-15` |
| `version-tracker.md`    | `1.0.0` | `stable` | `2025-07-15` |

### ❌ Specs WITHOUT Version Headers (38/50)

#### Core System (Remaining)

- `api.md`
- `cli.md`
- `ui.md`
- `deployment.md`
- `scheduler.md`
- `roles.yml.md`
- `module-api.md`
- `frontend.md`
- `editor-layer.md`

#### Security & Compliance

- `security.md`
- `backup.md`
- `storage.md`
- `database.md`
- `users.md`
- `moderation.md`

#### User Experience

- `accessibility.md`
- `themes.md`
- `translations.md`
- `notifications.md`

#### Data & Records

- `public-data-structure.md`
- `records-validation.md`
- `indexing.md`
- `search.md`
- `data-integrity.md`

#### System & Infrastructure

- `observability.md`
- `maintenance.md`
- `onboarding.md`
- `lifecycle.md`
- `branding.md`
- `static-export.md`
- `printable.md`
- `audit.md`
- `metrics.md`
- `activity-log.md`
- `signatures.md`
- `votes.md`
- `review-policy.md`
- `timeline.md`
- `versioning.md`
- `serve.md`
- `feedback.md`

---

## 🔧 Standard Version Header Template

### For Core System Specs (v1.0.0)

```markdown
# [EMOJI] CivicPress Spec: `[filename].md`


**Breaking Changes:** `[]`
**Additions:** `[comprehensive documentation, security considerations, testing patterns]`
**Fixes:**
`[documentation, code examples, validation patterns]`
**Migration Guide:** `null`

**Compatibility:**

- **Min CivicPress:** `1.0.0`
- **Max CivicPress:** `null`
- **Dependencies:** `[list of dependencies]`

**Authors:** Sophie Germain <sophie@civic-press.org>
**Reviewers:** Ada Lovelace, Irène Joliot-Curie
```

### For Enhanced Specs (v1.1.0+)

```markdown
# [EMOJI] CivicPress Spec: `[filename].md`


**Breaking Changes:** `[]`
**Additions:** `[detailed YAML examples, comprehensive field definitions, security considerations]`
**Fixes:**
`[field documentation, validation rules, schema documentation]`
**Migration Guide:** `null`

**Compatibility:**

- **Min CivicPress:** `1.0.0`
- **Max CivicPress:** `null`
- **Dependencies:** `[list of dependencies]`

**Authors:** Sophie Germain <sophie@civic-press.org>
**Reviewers:** Ada Lovelace, Irène Joliot-Curie
```

---

## 📋 Implementation Plan

### Phase 1: Core System Specs (Priority 1)

- [ ] `api.md` → v1.0.0
- [ ] `cli.md` → v1.0.0
- [ ] `ui.md` → v1.0.0
- [ ] `deployment.md` → v1.0.0
- [ ] `scheduler.md` → v1.0.0

### Phase 2: Security & Compliance (Priority 2)

- [ ] `security.md` → v1.0.0
- [ ] `backup.md` → v1.0.0
- [ ] `storage.md` → v1.0.0
- [ ] `database.md` → v1.0.0
- [ ] `users.md` → v1.0.0
- [ ] `moderation.md` → v1.0.0

### Phase 3: User Experience (Priority 3)

- [ ] `accessibility.md` → v1.0.0
- [ ] `themes.md` → v1.0.0
- [ ] `translations.md` → v1.0.0
- [ ] `notifications.md` → v1.0.0

### Phase 4: Data & Records (Priority 4)

- [ ] `public-data-structure.md` → v1.0.0
- [ ] `records-validation.md` → v1.0.0
- [ ] `indexing.md` → v1.0.0
- [ ] `search.md` → v1.0.0
- [ ] `data-integrity.md` → v1.0.0

### Phase 5: System & Infrastructure (Priority 5)

- [ ] `observability.md` → v1.0.0
- [ ] `maintenance.md` → v1.0.0
- [ ] `onboarding.md` → v1.0.0
- [ ] `lifecycle.md` → v1.0.0
- [ ] `branding.md` → v1.0.0
- [ ] `static-export.md` → v1.0.0
- [ ] `printable.md` → v1.0.0
- [ ] `audit.md` → v1.0.0
- [ ] `metrics.md` → v1.0.0
- [ ] `activity-log.md` → v1.0.0
- [ ] `signatures.md` → v1.0.0
- [ ] `votes.md` → v1.0.0
- [ ] `review-policy.md` → v1.0.0
- [ ] `timeline.md` → v1.0.0
- [ ] `versioning.md` → v1.0.0
- [ ] `serve.md` → v1.0.0
- [ ] `feedback.md` → v1.0.0
- [ ] `roles.yml.md` → v1.0.0
- [ ] `module-api.md` → v1.0.0
- [ ] `frontend.md` → v1.0.0
- [ ] `editor-layer.md` → v1.0.0

---

## 🔍 Validation Checklist

After adding version headers, verify:

- [ ] **Version format** follows semantic versioning (MAJOR.MINOR.PATCH)
- [ ] **Status** is appropriate (`stable`, `draft`, `deprecated`)
- [ ] **Dates** are consistent and accurate
- [ ] **Dependencies** are correctly listed with version constraints
- [ ] **Breaking changes** are accurately documented
- [ ] **Migration guides** are provided if needed
- [ ] **Authors and reviewers** are properly credited
- [ ] **Compatibility** information is complete

---

## 🚀 Benefits of Standardization

### Consistency

- All specs follow the same versioning format
- Clear dependency relationships
- Standardized change tracking

### Maintainability

- Easy to track changes across specs
- Automated validation possible
- Clear migration paths

### Collaboration

- Developers understand spec versions
- Clear ownership and review process
- Standardized contribution workflow

---

## 📅 History

- Drafted: 2025-07-15
- Last updated: 2025-07-15
