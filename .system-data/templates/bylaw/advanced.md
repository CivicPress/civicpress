---
template: bylaw/advanced
extends: bylaw/base
validation:
  required_fields: [bylaw_number, fiscal_year]
  business_rules:
    - "bylaw number must be unique"
    - "fiscal year must be current or future"
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
  field_relationships:
    - name: "approval_required_together"
      type: "required_together"
      fields: [approval_date, approved_by]
      condition: "status == 'approved'"
      message: "Both approval date and approver must be specified"
    - name: "implementation_required_together"
      type: "required_together"
      fields: [effective_date, implementation_notes]
      condition: "status == 'active'"
      message: "Both effective date and implementation notes must be specified"
    - name: "mutually_exclusive_contacts"
      type: "mutually_exclusive"
      fields: [contact_email, contact_phone]
      message: "Specify either email or phone contact, not both"
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
sections:
  - name: "header"
    required: true
    fields: [title, type, status, author, version, bylaw_number, fiscal_year]
  - name: "contact_info"
    required: false
    fields: [contact_email, contact_phone]
---

# {{title}}

**Type:** {{type}}  
**Status:** {{status}}  
**Author:** {{author}}  
**Version:** {{version}}  
**Bylaw Number:** {{bylaw_number}}  
**Fiscal Year:** {{fiscal_year}}

{{#if status == 'approved'}} **Approved:** {{approval_date}}  
**By:** {{approved_by}}  
**Meeting:** {{approval_meeting}} {{/if}}

{{#if status == 'active'}} **Effective Date:** {{effective_date}} {{/if}}

{{#if contact_email || contact_phone}} **Contact:**
{{#if contact_email}}{{contact_email}}{{/if}}{{#if contact_phone}}{{#if contact_email}}
/ {{/if}}{{contact_phone}}{{/if}} {{/if}}

## Purpose

{{purpose}}

## Definitions

{{#if definitions}} {{definitions}} {{else}} _Definitions will be added as
needed._ {{/if}}

## Provisions

{{provisions}}

## Enforcement

{{#if enforcement}} {{enforcement}} {{else}} _Enforcement procedures will be
determined by the governing body._ {{/if}}

{{#if status == 'approved'}}

## Approval

**Approved:** {{approval_date}}  
**By:** {{approved_by}}  
**Meeting:** {{approval_meeting}} {{/if}}

{{#if status == 'active'}}

## Implementation

**Effective Date:** {{effective_date}}  
**Implementation Notes:** {{implementation_notes}} {{/if}}

---

_This advanced bylaw is part of the official record of {{city}}, {{state}}._
