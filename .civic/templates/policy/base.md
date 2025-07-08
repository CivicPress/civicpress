---
template: policy/base
validation:
  required_fields: [title, type, status, author, version, department]
  status_values: [draft, proposed, approved, active, archived]
  business_rules:
    - "approved policies must have approval_date"
    - "active policies must have effective_date"
    - "version must be semantic (x.y.z)"
    - "department must be specified"
  sections:
    - name: "header"
      required: true
      fields: [title, type, status, author, version, department]
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
  - name: "scope"
    required: true
  - name: "definitions"
    required: false
  - name: "procedures"
    required: true
  - name: "compliance"
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
**Department:** {{department}}

{{#if status == 'approved'}} **Approved:** {{approval_date}}  
**By:** {{approved_by}} {{/if}}

{{#if status == 'active'}} **Effective Date:** {{effective_date}} {{/if}}

## Purpose

{{purpose}}

## Scope

{{scope}}

## Definitions

{{#if definitions}} {{definitions}} {{else}} _Definitions will be added as
needed._ {{/if}}

## Procedures

{{procedures}}

## Compliance

{{#if compliance}} {{compliance}} {{else}} _Compliance requirements will be
determined by the department._ {{/if}}

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

_This policy is part of the official record of {{city}}, {{state}}._
