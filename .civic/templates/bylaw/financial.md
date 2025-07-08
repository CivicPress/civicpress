---
template: bylaw/financial
extends: bylaw/base
validation:
  required_fields: [fiscal_year, budget_authority, audit_requirement]
  business_rules:
    - "financial bylaws must have fiscal_year"
    - "budget_authority must be specified"
    - "audit_requirement must be defined"
sections:
  - name: "header"
    required: true
    fields: [title, type, status, author, version, fiscal_year, budget_authority]
  - name: "financial_authority"
    required: true
    min_length: 50
  - name: "budget_process"
    required: true
    min_length: 100
  - name: "audit_requirements"
    required: true
    min_length: 75
  - name: "reporting_requirements"
    required: false
    min_length: 50
---

# {{title}}

**Type:** {{type}}  
**Status:** {{status}}  
**Author:** {{author}}  
**Version:** {{version}}  
**Fiscal Year:** {{fiscal_year}}  
**Budget Authority:** {{budget_authority}}

{{#if status == 'approved'}} **Approved:** {{approval_date}}  
**By:** {{approved_by}} {{/if}}

{{#if status == 'active'}} **Effective Date:** {{effective_date}} {{/if}}

## Purpose

{{purpose}}

## Financial Authority

{{financial_authority}}

## Budget Process

{{budget_process}}

## Audit Requirements

{{audit_requirements}}

## Reporting Requirements

{{#if reporting_requirements}} {{reporting_requirements}} {{else}} _Reporting
requirements will be determined by the finance committee._ {{/if}}

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

_This financial bylaw is part of the official record of {{city}}, {{state}}._
