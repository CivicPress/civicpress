# CivicPress Spec: `records-validation.md`

---

version: 1.0.0 status: stable created: '2025-07-03' updated: '2025-07-15'
deprecated: false sunset_date: null breaking_changes: [] additions:

- comprehensive validation documentation
- integrity patterns
- security considerations fixes: [] migration_guide: null compatibility:
 min_civicpress: 1.0.0 max_civicpress: 'null' dependencies:
 - 'public-data-structure.md: >=1.0.0' authors:
- Sophie Germain <sophie@civicpress.io> reviewers:
- Ada Lovelace
- Irène Joliot-Curie

---

## Name

`records-validation` — Civic Record Validation Rules (`civic lint`)

## Purpose

Define the validation rules and CLI tools used to ensure all civic records are
structurally valid, properly formatted, and compliant with CivicPress standards
before they can be published or approved.

---

## Scope & Responsibilities

Responsibilities:

- Validate frontmatter structure and required fields
- Check file naming conventions and directory paths
- Verify roles and authorship against `.civic/roles.yml`
- Detect missing metadata or unapproved records
- Help catch errors early in the civic process

Out of scope:

- Content moderation or sentiment checking
- Full spellchecking or grammar enforcement

---

## Inputs & Outputs

| Input | Description |
| --------------------- | ------------------------------------------ |
| Civic records | Markdown files to be validated |
| Validation rules | Configuration from `.civic/validation.yml` |
| Role definitions | User roles from `.civic/roles.yml` |
| File system structure | Directory organization and naming |
| Validation schemas | Frontmatter and metadata schemas |

| Output | Description |
| ------------------ | ------------------------------------- |
| Validation results | Pass/fail status for each record |
| Error reports | Detailed error messages and locations |
| Validation logs | Audit trail of validation operations |
| Compliance reports | Summary of validation compliance |
| Fix suggestions | Automated suggestions for fixes |

---

## File/Folder Location

```
core/
├── validation.ts # Main validation logic
├── record-validator.ts # Record-specific validation
├── frontmatter-validator.ts # Frontmatter validation
└── schema-validator.ts # Schema validation utilities

modules/
├── validation/
│ ├── components/
│ │ ├── ValidationReport.tsx # Validation report display
│ │ ├── ValidationErrors.tsx # Error display component
│ │ └── ValidationSettings.tsx # Validation configuration UI
│ ├── hooks/
│ │ └── useValidation.ts # Validation data hook
│ └── utils/
│ ├── validation-rules.ts # Validation rule definitions
│ └── error-formatter.ts # Error message formatting
└── ui/
 └── components/
 └── ValidationProvider.tsx # Validation context provider

.civic/
├── validation.yml # Validation configuration
├── validation-schemas/ # Custom validation schemas
│ ├── bylaw-schema.yml
│ ├── motion-schema.yml
│ └── resolution-schema.yml
└── validation-rules/ # Custom validation rules
 ├── naming-rules.yml
 ├── frontmatter-rules.yml
 └── content-rules.yml

tests/
├── validation/
│ ├── record-validation.test.ts
│ ├── frontmatter-validation.test.ts
│ └── schema-validation.test.ts
└── integration/
 └── validation-integration.test.ts
```

---

## Security & Trust Considerations

### Validation Security

- All validation rules must be cryptographically signed
- Validation configuration requires administrative approval
- Automated validation of validation rule integrity
- Audit logging for all validation rule changes
- Protection against validation rule manipulation

### Validation Integrity & Trust

- Validation results cryptographically signed and verified
- Immutable audit trail for all validation operations
- Tamper-evident validation logs and reports
- Automated detection of validation bypass attempts
- Regular validation system health checks

### Access Control & Permissions

- Role-based access control for validation configuration
- Granular permissions for validation rule management
- Approval workflow for validation rule changes
- Emergency validation lockdown capability
- Audit logging of all validation-related activities

### Compliance & Legal Requirements

- Compliance with municipal validation requirements
- Legal review process for validation rules and policies
- Support for public records validation requirements
- Compliance with data protection regulations
- Regular legal audits of validation practices

### Data Protection & Privacy

- Encryption of sensitive validation data
- GDPR-compliant validation data handling
- Anonymization of validation error reports
- User consent management for validation processing
- Data retention policies for validation logs

### Performance & Reliability

- Validation performance monitoring and optimization
- Graceful degradation when validation systems fail
- Automated validation recovery and error handling
- Resource usage monitoring for validation operations
- Validation system backup and disaster recovery

---

## What Gets Validated

### Frontmatter Checks

- Required fields: `title`, `status`, `module`
- Optional fields: `tags`, `authors`, `source`, `approved_by`
- Valid `status` values: `draft`, `proposed`, `approved`, `adopted`, `archived`
- Valid `module` name must match declared modules in `manifest.yml`

### File Checks

- File must reside in correct folder (`timeline/YYYY-MM-DD/`, `bylaws/`, etc.)
- File must have `.md` extension
- No duplicate slugs (based on filename or `slug:` field)
- Must not be empty

### Authorship & Roles

- All `authors:` entries must match `.civic/roles.yml`
- If `approved_by:` is present, each name must map to a `council-member`,
 `mayor`, or `admin`
- If publishing, ensure minimum quorum (from `git-policy.md`)

### Metadata Checks

- Dates (`issued:`, `created:`, etc.) must be valid ISO dates
- `tags:` must be array of lowercase strings
- If `source:` is present, file must exist at referenced path

---

## Usage

Run manually:

```bash
civic lint
```

Or check a single file:

```bash
civic lint records/timeline/2025-07-03/bylaw-quiet-hours.md
```

---

## CLI Integrations

- `civic propose` auto-validates file before opening PR
- `civic approve` checks role match and record readiness
- `civic publish` refuses to run if record is invalid

---

## Output Format

Errors are shown with file, line, and reason:

```
records/timeline/2025-07-03/bylaw-quiet-hours.md
 - Missing required field: title
 - Author "Emmy Noether" not found in roles.yml
```

## Testing & Validation

- Test validation with valid and invalid records
- Verify all required fields are checked
- Test role validation against `.civic/roles.yml`
- Ensure proper error messages and formatting
- Test CLI integration with other commands

---

## Known Issues

- **CLI re-serialization bug**: `civic validate <record>` currently rebuilds the
 markdown via `RecordParser.serializeToMarkdown()` before running schema
 checks. When validating files outside `data/records/`, this conversion turns
 ISO 8601 strings into `Date` objects, so Ajv reports type errors for `date`,
 `created`, `updated`, and `source.imported_at`. Copy the file into
 `data/records/` or call `RecordSchemaValidator.validate()` directly until the
 CLI helper is patched.

---

## ️ Future Enhancements

- Support `.civic/validation.yml` to customize required fields
- Add spellchecking for `title`, `summary`, `content`
- Visual feedback in CivicPress editor UI
- GitHub Action template for CI

---

## History

- Drafted: 2025-07-03
