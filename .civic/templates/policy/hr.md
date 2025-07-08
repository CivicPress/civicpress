---
template: policy/hr
extends: policy/base
validation:
  required_fields: [hr_director, employee_categories, grievance_procedure]
  business_rules:
    - "HR policies must have hr_director"
    - "employee_categories must be specified"
    - "grievance_procedure must be defined"
sections:
  - name: "header"
    required: true
    fields: [title, type, status, author, version, department, hr_director]
  - name: "employee_categories"
    required: true
    min_length: 50
  - name: "grievance_procedure"
    required: true
    min_length: 100
  - name: "disciplinary_process"
    required: false
    min_length: 75
  - name: "training_requirements"
    required: false
    min_length: 50
---

# {{title}}

**Type:** {{type}}  
**Status:** {{status}}  
**Author:** {{author}}  
**Version:** {{version}}  
**Department:** {{department}}  
**HR Director:** {{hr_director}}

{{#if status == 'approved'}} **Approved:** {{approval_date}}  
**By:** {{approved_by}} {{/if}}

{{#if status == 'active'}} **Effective Date:** {{effective_date}} {{/if}}

## Purpose

{{purpose}}

## Scope

{{scope}}

## Employee Categories

{{employee_categories}}

## Grievance Procedure

{{grievance_procedure}}

## Disciplinary Process

{{#if disciplinary_process}} {{disciplinary_process}} {{else}} _Disciplinary
process will be determined by HR._ {{/if}}

## Training Requirements

{{#if training_requirements}} {{training_requirements}} {{else}} _Training
requirements will be determined by HR._ {{/if}}

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

_This HR policy is part of the official record of {{city}}, {{state}}._
