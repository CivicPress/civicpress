import { ref, computed } from 'vue'

export interface Template {
  id: string
  name: string
  type: string
  content: string
  description?: string
}

export function useTemplates() {
  const templates = ref<Template[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Default templates for each record type
  const defaultTemplates = {
    bylaw: {
      id: 'bylaw-default',
      name: 'Default Bylaw Template',
      type: 'bylaw',
      content: `---
title: "{{title}}"
type: bylaw
status: draft
author: "{{user}}"
version: "1.0.0"
created: "{{timestamp}}"
updated: "{{timestamp}}"
priority: medium
department: general
---

# {{title}}

## Section 1: Purpose and Intent

[Describe the purpose and intent of this bylaw]

## Section 2: Definitions

### 2.1 [Term]

[Definition of key terms used in this bylaw]

## Section 3: Applicability

### 3.1 Scope

[Describe the scope and applicability of this bylaw]

### 3.2 Exemptions

[List any exemptions or exceptions]

## Section 4: Requirements

### 4.1 [Requirement Category]

[Describe specific requirements]

### 4.2 [Another Requirement]

[Describe additional requirements]

## Section 5: Enforcement

### 5.1 Violations

[Describe what constitutes a violation]

### 5.2 Penalties

[Describe penalties for violations]

## Section 6: Appeals

### 6.1 Appeal Process

[Describe the appeal process]

## Section 7: Effective Date

This bylaw shall become effective [date] upon adoption by the City Council.

## Section 8: Severability

If any section of this bylaw is found to be invalid, the remaining sections
shall remain in full force and effect.

---

_This bylaw was created using CivicPress on {{timestamp}}_`,
      description: 'Standard bylaw template with sections for purpose, definitions, requirements, and enforcement'
    },
    ordinance: {
      id: 'ordinance-default',
      name: 'Default Ordinance Template',
      type: 'ordinance',
      content: `---
title: "{{title}}"
type: ordinance
status: draft
author: "{{user}}"
version: "1.0.0"
created: "{{timestamp}}"
updated: "{{timestamp}}"
priority: medium
department: general
---

# {{title}}

## Section 1: Purpose

[Describe the purpose of this ordinance]

## Section 2: Definitions

### 2.1 [Term]

[Definition of key terms used in this ordinance]

## Section 3: Applicability

### 3.1 Scope

[Describe the scope and applicability of this ordinance]

### 3.2 Exemptions

[List any exemptions or exceptions]

## Section 4: Requirements

### 4.1 [Requirement Category]

[Describe specific requirements]

### 4.2 [Another Requirement]

[Describe additional requirements]

## Section 5: Enforcement

### 5.1 Violations

[Describe what constitutes a violation]

### 5.2 Penalties

[Describe penalties for violations]

## Section 6: Appeals

### 6.1 Appeal Process

[Describe the appeal process]

## Section 7: Effective Date

This ordinance shall become effective [date] upon adoption by the City Council.

## Section 8: Severability

If any section of this ordinance is found to be invalid, the remaining sections
shall remain in full force and effect.

---

_This ordinance was created using CivicPress on {{timestamp}}_`,
      description: 'Standard ordinance template with sections for purpose, definitions, requirements, and enforcement'
    },
    policy: {
      id: 'policy-default',
      name: 'Default Policy Template',
      type: 'policy',
      content: `---
title: "{{title}}"
type: policy
status: draft
author: "{{user}}"
version: "1.0.0"
created: "{{timestamp}}"
updated: "{{timestamp}}"
priority: medium
department: general
---

# {{title}}

## Section 1: Purpose

[Describe the purpose of this policy]

## Section 2: Scope

[Describe the scope and applicability of this policy]

## Section 3: Definitions

### 3.1 [Term]

[Definition of key terms used in this policy]

## Section 4: Policy Statement

### 4.1 [Policy Category]

[Describe specific policy requirements]

### 4.2 [Another Policy]

[Describe additional policy requirements]

## Section 5: Implementation

### 5.1 Responsibilities

[Describe who is responsible for implementing this policy]

### 5.2 Procedures

[Describe the procedures for implementing this policy]

## Section 6: Compliance

### 6.1 Monitoring

[Describe how compliance will be monitored]

### 6.2 Enforcement

[Describe enforcement mechanisms]

## Section 7: Review

This policy shall be reviewed [frequency] to ensure continued relevance and effectiveness.

## Section 8: Effective Date

This policy shall become effective [date] upon approval.

---

_This policy was created using CivicPress on {{timestamp}}_`,
      description: 'Standard policy template with sections for purpose, scope, implementation, and compliance'
    },
    resolution: {
      id: 'resolution-default',
      name: 'Default Resolution Template',
      type: 'resolution',
      content: `---
title: "{{title}}"
type: resolution
status: draft
author: "{{user}}"
version: "1.0.0"
created: "{{timestamp}}"
updated: "{{timestamp}}"
priority: medium
department: general
---

# {{title}}

## Section 1: Background

[Describe the background and context for this resolution]

## Section 2: Purpose

[Describe the purpose of this resolution]

## Section 3: Findings

### 3.1 [Finding Category]

[Describe specific findings]

### 3.2 [Another Finding]

[Describe additional findings]

## Section 4: Resolution

### 4.1 [Resolution Category]

[Describe specific resolutions]

### 4.2 [Another Resolution]

[Describe additional resolutions]

## Section 5: Implementation

### 5.1 Timeline

[Describe the timeline for implementation]

### 5.2 Responsibilities

[Describe who is responsible for implementation]

## Section 6: Effective Date

This resolution shall become effective [date] upon adoption.

---

_This resolution was created using CivicPress on {{timestamp}}_`,
      description: 'Standard resolution template with sections for background, findings, and resolutions'
    },
    proclamation: {
      id: 'proclamation-default',
      name: 'Default Proclamation Template',
      type: 'proclamation',
      content: `---
title: "{{title}}"
type: proclamation
status: draft
author: "{{user}}"
version: "1.0.0"
created: "{{timestamp}}"
updated: "{{timestamp}}"
priority: medium
department: general
---

# {{title}}

## Section 1: Background

[Describe the background and context for this proclamation]

## Section 2: Purpose

[Describe the purpose of this proclamation]

## Section 3: Recognition

### 3.1 [Recognition Category]

[Describe specific recognitions]

### 3.2 [Another Recognition]

[Describe additional recognitions]

## Section 4: Call to Action

### 4.1 [Action Category]

[Describe specific calls to action]

### 4.2 [Another Action]

[Describe additional calls to action]

## Section 5: Effective Date

This proclamation shall become effective [date] upon issuance.

---

_This proclamation was created using CivicPress on {{timestamp}}_`,
      description: 'Standard proclamation template with sections for background, recognition, and calls to action'
    }
  }

  // Get templates for a specific record type
  const getTemplatesForType = (recordType: string): Template[] => {
    const defaultTemplate = defaultTemplates[recordType as keyof typeof defaultTemplates]
    if (defaultTemplate) {
      return [defaultTemplate]
    }
    return []
  }

  // Get a specific template by ID
  const getTemplateById = (templateId: string): Template | null => {
    // Search through all default templates
    for (const type in defaultTemplates) {
      const template = defaultTemplates[type as keyof typeof defaultTemplates]
      if (template.id === templateId) {
        return template
      }
    }
    return null
  }

  // Process template content with variables
  const processTemplate = (template: Template, variables: Record<string, string>): string => {
    let processedContent = template.content

    // Replace variables in the template
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`
      processedContent = processedContent.replace(new RegExp(placeholder, 'g'), value)
    }

    return processedContent
  }

  // Get template options for select menu
  const getTemplateOptions = (recordType: string) => {
    const templates = getTemplatesForType(recordType)
    return templates.map(template => ({
      label: template.name,
      value: template.id,
      description: template.description,
      icon: 'i-lucide-file-text'
    }))
  }

  return {
    templates,
    loading,
    error,
    getTemplatesForType,
    getTemplateById,
    processTemplate,
    getTemplateOptions
  }
} 