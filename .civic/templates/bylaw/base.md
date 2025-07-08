---
template: bylaw/base
validation:
  required_fields: [title, type, status, author, version]
  status_values: [draft, proposed, approved, active, archived]
  business_rules:
    - "approved bylaws must have approval_date"
    - "active bylaws must have effective_date"
    - "version must be semantic (x.y.z)"
  sections:
    - name: "header"
      required: true
      fields: [title, type, status, author, version]
    - name: "content"
      required: true
      min_length: 100
    - name: "approval"
      required: false
      conditional: "status == 'approved'"
      fields: [approval_date, approved_by]
    - name: "implementation"
      required: false
      conditional: "status == 'active'"
      fields: [effective_date, implementation_notes]
sections:
  - name: "header"
    required: true
  - name: "purpose"
    required: true
  - name: "definitions"
    required: false
  - name: "provisions"
    required: true
  - name: "enforcement"
    required: false
  - name: "approval"
    required: false
    conditional: "status == 'approved'"
  - name: "implementation"
    required: false
    conditional: "status == 'active'"
---

# {{title}}

**Type:** {{type}}  
**Status:** {{status}}  
**Author:** {{author}}  
**Version:** {{version}}

{{#if status == 'approved'}} **Approved:** {{approval_date}}  
**By:** {{approved_by}} {{/if}}

{{#if status == 'active'}} **Effective Date:** {{effective_date}} {{/if}}

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

_This bylaw is part of the official record of {{city}}, {{state}}._
