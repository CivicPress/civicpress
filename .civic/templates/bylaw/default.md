---
template: bylaw/default
extends: bylaw/base
validation:
  required_fields: [bylaw_number]
  business_rules:
    - "bylaw number must be unique"
sections:
  - name: "header"
    required: true
    fields: [title, type, status, author, version, bylaw_number]
---

# {{title}}

**Type:** {{type}}  
**Status:** {{status}}  
**Author:** {{author}}  
**Version:** {{version}}  
{{#if bylaw_number}}**Bylaw Number:** {{bylaw_number}}{{/if}}

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
