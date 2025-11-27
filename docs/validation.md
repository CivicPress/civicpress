# Validation System

CivicPress includes a comprehensive validation system that ensures data quality,
compliance, and consistency across all civic records.

## Overview

The validation system provides multiple layers of validation:

- **Basic Validation** - Required fields, data types, format checking
- **Advanced Validation** - Business rules, field relationships, custom
  validators
- **Content Validation** - Section requirements, placeholder detection
- **Template Validation** - Template structure and inheritance validation

## Validation Types

### Basic Validation

Basic validation checks fundamental record requirements:

```yaml
validation:
  required_fields: [title, type, status, author]
  status_values: [draft, proposed, approved, active, archived]
  business_rules:
    - "bylaw number must be unique"
    - "fiscal year must be current or future"
```

#### Required Fields

- Ensures all mandatory fields are present
- Validates field content is not empty
- Supports conditional requirements

#### Status Values

- Validates record status against allowed values
- Ensures consistent status tracking
- Supports workflow state validation

#### Business Rules

- Simple text-based business logic
- Common compliance requirements
- Basic data integrity checks

### Advanced Validation

Advanced validation provides sophisticated rule-based validation:

#### Advanced Rules

```yaml
validation:
  advanced_rules:
    - name: "approval_workflow"
      condition: "status == 'approved'"
      fields: [approval_date, approved_by, approval_meeting]
      rule: "approved_by_authority"
      severity: "error"
      message: "Approved bylaws must have approval details"
    - name: "date_sequence_validation"
      fields: [approval_date, effective_date]
      rule: "date_sequence"
      severity: "error"
      message: "Approval date must be before effective date"
    - name: "content_quality_check"
      fields: [purpose, provisions]
      rule: "content_quality"
      severity: "warning"
      message: "Content should be complete and professional"
```

#### Rule Types

- **`approved_by_authority`** - Ensures approval authority is specified
- **`date_sequence`** - Validates chronological order of dates
- **`content_quality`** - Checks content completeness and professionalism
- **`business_logic`** - Custom business rule validation

#### Severity Levels

- **`error`** - Validation failure prevents record completion
- **`warning`** - Validation issue that should be addressed

### Field Relationships

Field relationships define how fields interact with each other:

```yaml
validation:
  field_relationships:
    - name: "approval_required_together"
      type: "required_together"
      fields: [approval_date, approved_by]
      condition: "status == 'approved'"
      message: "Both approval date and approver must be specified"
    - name: "mutually_exclusive_contacts"
      type: "mutually_exclusive"
      fields: [contact_email, contact_phone]
      message: "Specify either email or phone contact, not both"
    - name: "dependent_on_approval"
      type: "dependent_on"
      fields: [effective_date, approval_date]
      message: "Effective date requires approval date"
```

#### Relationship Types

- **`required_together`** - Fields must all be present or all absent
- **`mutually_exclusive`** - Only one field can be present
- **`dependent_on`** - One field requires another field
- **`conditional`** - Custom conditional logic

### Custom Validators

Custom validators provide field-specific validation:

```yaml
validation:
  custom_validators:
    - name: "email_validation"
      field: "contact_email"
      validator: "email"
      message: "Contact email must be a valid email address"
    - name: "phone_validation"
      field: "contact_phone"
      validator: "phone"
      message: "Contact phone must be a valid phone number"
    - name: "version_validation"
      field: "version"
      validator: "semantic_version"
      message: "Version must be in semantic format (x.y.z)"
    - name: "conditional_approval_meeting"
      field: "approval_meeting"
      validator: "required_if"
      params: ["status", "approved"]
      message: "Approval meeting must be specified for approved bylaws"
```

#### Built-in Validators

| Validator          | Description                | Example                | Format               |
| ------------------ | -------------------------- | ---------------------- | -------------------- |
| `email`            | Email format validation    | `user@example.com`     | RFC 5322             |
| `phone`            | Phone number validation    | `+1-555-123-4567`      | International format |
| `date`             | Date format validation     | `2024-01-01`           | ISO 8601             |
| `url`              | URL format validation      | `https://example.com`  | RFC 3986             |
| `semantic_version` | Semantic versioning        | `1.2.3`                | SemVer 2.0           |
| `required_if`      | Conditional required field | `status == 'approved'` | Condition expression |

## Validation Commands

### Validate Single Record

```bash
# Basic validation
civic validate bylaw/public-meeting-procedures

# JSON output
civic validate bylaw/public-meeting-procedures --json

# Strict validation (warnings as errors)
civic validate bylaw/public-meeting-procedures --strict
```

### Validate All Records

```bash
# Validate all records
civic validate --all

# JSON output
civic validate --all --json

# Auto-fix validation issues
civic validate --all --fix

# Strict validation
civic validate --all --strict
```

### Validation Output

#### Human Readable Output

```
📊 Validation Summary:
  Total records: 15
  Valid records: 12
  Invalid records: 3

📄 bylaw/public-meeting-procedures.md
  ❌ Invalid
    ❌ bylaw_number: Required field 'bylaw_number' is missing or empty
    ⚠  contact_email: Invalid email format
    ⚠  content: Found 2 placeholder(s) in content

📊 Final Summary:
  Total errors: 1
  Total warnings: 2

❌ Some records have validation errors that need to be fixed.
```

#### JSON Output

```json
{
  "results": [
    {
      "record": "bylaw/public-meeting-procedures.md",
      "isValid": false,
      "errors": [
        {
          "field": "bylaw_number",
          "message": "Required field 'bylaw_number' is missing or empty",
          "severity": "error"
        }
      ],
      "warnings": [
        {
          "field": "contact_email",
          "message": "Invalid email format",
          "suggestion": "Use a valid email format (e.g., user@example.com)"
        },
        {
          "field": "content",
          "message": "Found 2 placeholder(s) in content",
          "suggestion": "Replace placeholders with actual content"
        }
      ],
      "suggestions": []
    }
  ],
  "summary": {
    "totalRecords": 15,
    "validRecords": 12,
    "invalidRecords": 3,
    "totalErrors": 1,
    "totalWarnings": 2
  }
}
```

## Validation Configuration

### Template-Level Validation

Validation rules are defined in template files:

```yaml
# .civic/templates/bylaw/advanced.md
---
template: bylaw/advanced
extends: bylaw/base
validation:
  required_fields: [bylaw_number, fiscal_year, purpose, provisions]
  advanced_rules:
    - name: "approval_workflow"
      condition: "status == 'approved'"
      fields: [approval_date, approved_by]
      rule: "approved_by_authority"
      severity: "error"
  field_relationships:
    - name: "approval_required_together"
      type: "required_together"
      fields: [approval_date, approved_by]
      condition: "status == 'approved'"
  custom_validators:
    - name: "email_validation"
      field: "contact_email"
      validator: "email"
---
```

### Global Validation Settings

Global validation settings can be configured in the CivicPress config:

```yaml
# .civic/config.yml
validation:
  strict_mode: false
  auto_fix: false
  max_warnings: 10
  ignore_patterns:
    - "*.draft.md"
    - "temp/*"
```

## Validation Examples

### Bylaw Validation

```yaml
# Example bylaw record
---
title: "Public Meeting Procedures"
type: bylaw
status: approved
author: "City Council"
version: "1.0.0"
bylaw_number: "2024-001"
fiscal_year: "2024"
purpose: "Establish procedures for public meetings"
provisions: "Detailed provisions for public meeting conduct"
approval_date: "2024-01-15"
approved_by: "City Council"
contact_email: "council@city.gov"
contact_phone: "+1-555-123-4567"
effective_date: "2024-02-01"
---

# Public Meeting Procedures
...
```

**Validation Results:**

- ✅ All required fields present
- ✅ Email format valid
- ✅ Phone format valid
- ✅ Date sequence valid (approval before effective)
- ✅ Approval workflow complete

### Policy Validation

```yaml
# Example policy record
---
title: "Data Privacy Policy"
type: policy
status: draft
author: "IT Department"
version: "1.0.0"
policy_number: "IT-001"
description: "Policy for handling personal data"
purpose: "Protect personal information"
implementation: "Implementation procedures"
contact_email: "invalid-email"
---

# Data Privacy Policy
...
```

**Validation Results:**

- ❌ Invalid email format
- ⚠ Missing compliance section
- ⚠ Content too short for policy

### Resolution Validation

```yaml
# Example resolution record
---
title: "Budget Approval 2024"
type: resolution
status: approved
author: "Finance Committee"
version: "1.0.0"
resolution_number: "2024-001"
background: "Annual budget review"
whereas: "Budget analysis complete"
resolved: "Budget approved"
budget_impact: 5000000
budget_justification: "Annual operating budget"
---

# Budget Approval 2024
...
```

**Validation Results:**

- ✅ Budget justification provided for high impact
- ✅ All required sections present
- ✅ Approval workflow complete

## Custom Validation Development

### Creating Custom Validators

Custom validators can be implemented in the template engine:

```typescript
// Example custom validator
private validateCustomField(
  validator: CustomValidator,
  frontmatter: any
): { valid: boolean } {
  const fieldValue = frontmatter[validator.field];

  switch (validator.validator) {
    case 'custom_format':
      return { valid: this.isValidCustomFormat(fieldValue) };
    case 'business_rule':
      return { valid: this.validateBusinessRule(fieldValue, validator.params) };
    default:
      return { valid: true };
  }
}
```

### Adding Validation Rules

New validation rules can be added to the template engine:

```typescript
// Example advanced rule
private validateAdvancedRule(
  rule: AdvancedValidationRule,
  frontmatter: any
): { valid: boolean } {
  switch (rule.rule) {
    case 'custom_business_logic':
      return this.validateCustomBusinessLogic(rule, frontmatter);
    case 'compliance_check':
      return this.validateCompliance(rule, frontmatter);
    default:
      return { valid: true };
  }
}
```

## Best Practices

### Validation Design

1. **Start Simple** - Begin with basic required field validation
2. **Add Complexity Gradually** - Build advanced rules incrementally
3. **Test Thoroughly** - Validate with real data scenarios
4. **Document Rules** - Clear explanations for validation failures
5. **Consider User Experience** - Helpful error messages and suggestions

### Performance Considerations

1. **Efficient Validation** - Avoid expensive operations in validation
2. **Caching** - Cache validation results when appropriate
3. **Batch Processing** - Validate multiple records efficiently
4. **Incremental Validation** - Validate only changed fields

### Error Handling

1. **Clear Messages** - Descriptive error messages
2. **Actionable Suggestions** - Provide guidance for fixing issues
3. **Severity Levels** - Distinguish between errors and warnings
4. **Context Information** - Include relevant field and value information

## Additional Resources

- [Template System Guide](templates.md)
- [CLI Usage Guide](cli.md)
- [Validation Rules](../core/src/utils/template-engine.ts)
- [Template Examples](../core/src/defaults/templates/)
