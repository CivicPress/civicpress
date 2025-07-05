# 📋 CivicPress Spec: `add-version-headers.md`

---
version: 1.0.0
status: stable
created: '2025-07-03'
updated: '2025-07-15'
deprecated: false
sunset_date: null
additions:

- comprehensive version header documentation
- maintenance guidelines
- validation standards
compatibility:
  min_civicpress: 1.0.0
  max_civicpress: 'null'
  dependencies:
  - 'spec-versioning.md: >=1.0.0'
authors:
- Sophie Germain <sophie@civic-press.org>
reviewers:
- Ada Lovelace
- Irène Joliot-Curie

---

## 📛 Name

Version Header Maintenance & Standards

## 🎯 Purpose

Define standards and guidelines for maintaining version headers across all CivicPress
specifications, ensuring consistency and proper version tracking throughout the
specification ecosystem.

## 🧩 Scope & Responsibilities

✅ Responsibilities:

- Define YAML frontmatter standards for all specs
- Provide guidelines for version updates and changes
- Establish validation and maintenance procedures
- Document dependency management practices

❌ Out of Scope:

- Automated version management (handled by spec-versioning.md)
- Content review of individual specs
- Implementation of version tracking tools

---

## 📊 Current Status

### ✅ All Specs Have Version Headers (60/60)

All CivicPress specifications now use standardized YAML frontmatter with:

- **Version tracking** (semantic versioning)
- **Status management** (stable, draft, deprecated)
- **Change documentation** (additions, fixes, breaking changes)
- **Dependency tracking** (compatibility and requirements)
- **Author attribution** (unified identity system)

### 📈 Version Distribution

| Version | Count | Status |
|---------|-------|--------|
| 1.5.0   | 1     | plugins.md |
| 1.3.0   | 1     | workflows.md |
| 1.2.0   | 3     | auth.md, hooks.md, spec-versioning.md |
| 1.1.0   | 2     | permissions.md, git-policy.md |
| 1.0.0   | 53    | All other specs |

---

## 🔧 YAML Frontmatter Standards

### Required Fields

```yaml
---
version: 1.0.0
status: stable
created: '2025-07-03'
updated: '2025-07-15'
deprecated: false
sunset_date: null
additions:
- list of new features or content
fixes:
- list of corrections or improvements
compatibility:
  min_civicpress: 1.0.0
  max_civicpress: 'null'
  dependencies:
  - 'dependency.md: >=1.0.0'
authors:
- Sophie Germain <sophie@civic-press.org>
reviewers:
- Ada Lovelace
- Irène Joliot-Curie
---
```

### Version Guidelines

- **MAJOR.MINOR.PATCH** format (semantic versioning)
- **1.0.0** for initial stable releases
- **Increment MINOR** for new features (1.1.0, 1.2.0)
- **Increment MAJOR** for breaking changes (2.0.0)
- **PATCH** for bug fixes and minor corrections

### Status Values

- **`stable`** - Production ready, no breaking changes expected
- **`draft`** - Under development, may change significantly
- **`deprecated`** - Being phased out, migration guide required

---

## 🔍 Validation & Maintenance

### Automated Validation

The `.civic/tools/validate-specs.js` script checks:

- ✅ YAML frontmatter presence and format
- ✅ Required fields (version, status, authors, etc.)
- ✅ Section structure and formatting
- ✅ Cross-reference consistency

### Manual Review Checklist

When updating specs, verify:

- [ ] **Version increment** follows semantic versioning
- [ ] **Status** reflects current development state
- [ ] **Dates** are accurate and updated
- [ ] **Dependencies** are correctly listed
- [ ] **Breaking changes** are documented
- [ ] **Migration guides** provided if needed
- [ ] **Authors and reviewers** are current
- [ ] **Compatibility** information is complete

### Update Workflow

1. **Identify changes** - What was added, fixed, or changed?
2. **Determine version** - Does this require MAJOR, MINOR, or PATCH increment?
3. **Update frontmatter** - Modify YAML with new version and changes
4. **Update dates** - Set `updated` to current date
5. **Validate** - Run `pnpm run spec:validate`
6. **Test dependencies** - Ensure cross-references still work

---

## 🔗 Integration with Other Specs

### Related Specifications

- **`spec-versioning.md`** - Overall versioning strategy and policies
- **`version-tracker.md`** - Dependency tracking and compatibility matrices
- **`testing-framework.md`** - Validation and testing procedures

### Tooling Integration

- **Validation scripts** - Automated checking of frontmatter
- **CI/CD pipeline** - GitHub Actions validation
- **Documentation generation** - Version-aware documentation

---

## 🚀 Benefits of Standardization

### Consistency

- All specs follow identical YAML frontmatter format
- Clear dependency relationships and constraints
- Standardized change tracking and documentation

### Maintainability

- Easy to track changes across all specifications
- Automated validation prevents formatting errors
- Clear migration paths for breaking changes

### Collaboration

- Developers understand version expectations
- Clear ownership and review process
- Standardized contribution workflow

---

## 📅 History

- Drafted: 2025-07-15
- Last updated: 2025-07-15
