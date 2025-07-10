---
template: resolution/default
validation:
  required_fields: [title, type, status, author, version]
  status_values: [draft, proposed, approved, active, archived]
  business_rules:
    - "approved resolutions must have approval_date"
    - "active resolutions must have effective_date"
    - "version must be semantic (x.y.z)"
    - "resolution number must be unique"
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
  - name: "preamble"
    required: true
  - name: "whereas"
    required: false
  - name: "resolved"
    required: true
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
{{#if resolution_number}}**Resolution Number:** {{resolution_number}}{{/if}}

{{#if status == 'approved'}} **Approved:** {{approval_date}}  
**By:** {{approved_by}} {{/if}}

{{#if status == 'active'}} **Effective Date:** {{effective_date}} {{/if}}

## Preamble

{{preamble}}

## Whereas

{{#if whereas}} {{whereas}} {{else}} _Whereas clauses will be added as needed._
{{/if}}

## Resolved

{{resolved}}

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

_This resolution is part of the official record of {{city}}, {{state}}._
