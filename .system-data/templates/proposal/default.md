---
template: proposal/default
validation:
  required_fields: [title, type, status, author, version]
  status_values: [draft, proposed, approved, active, archived]
  business_rules:
    - "approved proposals must have approval_date"
    - "active proposals must have effective_date"
    - "version must be semantic (x.y.z)"
    - "proposal number must be unique"
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
  - name: "background"
    required: true
  - name: "objectives"
    required: true
  - name: "methodology"
    required: true
  - name: "timeline"
    required: false
  - name: "budget"
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
{{#if proposal_number}}**Proposal Number:** {{proposal_number}}{{/if}}

{{#if status == 'approved'}} **Approved:** {{approval_date}}  
**By:** {{approved_by}} {{/if}}

{{#if status == 'active'}} **Effective Date:** {{effective_date}} {{/if}}

## Background

{{background}}

## Objectives

{{objectives}}

## Methodology

{{methodology}}

## Timeline

{{#if timeline}} {{timeline}} {{else}} _Timeline will be determined during
implementation planning._ {{/if}}

## Budget

{{#if budget}} {{budget}} {{else}} _Budget details will be provided during
implementation planning._ {{/if}}

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

_This proposal is part of the official record of {{city}}, {{state}}._
