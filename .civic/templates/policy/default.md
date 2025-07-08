---
template: policy/default
extends: policy/base
validation:
  required_fields: [policy_number]
  business_rules:
    - "policy number must be unique"
sections:
  - name: "header"
    required: true
    fields: [title, type, status, author, version, department, policy_number]
  - name: "responsibilities"
    required: false
---

# {{title}}

**Type:** {{type}}  
**Status:** {{status}}  
**Author:** {{author}}  
**Version:** {{version}}  
{{#if policy_number}}**Policy Number:** {{policy_number}}{{/if}}

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

## Responsibilities

{{#if responsibilities}} {{responsibilities}} {{else}} _Responsibilities will be
determined by the implementing department._ {{/if}}

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
