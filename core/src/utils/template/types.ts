/**
 * Template types — extracted from template-engine.ts in Phase 2d W2-T1
 * decomposition. Re-exported from template-engine.ts for backward compat.
 */

export interface TemplateValidation {
  required_fields: string[];
  status_values: string[];
  business_rules: string[];
  sections: TemplateSection[];
  // Advanced validation rules
  advanced_rules?: AdvancedValidationRule[];
  field_relationships?: FieldRelationship[];
  custom_validators?: CustomValidator[];
}

export interface AdvancedValidationRule {
  name: string;
  condition?: string; // When this rule applies
  fields: string[]; // Fields involved in validation
  rule: string; // Rule description or expression
  severity: 'error' | 'warning'; // How severe is the violation
  message?: string; // Custom error message
}

export interface FieldRelationship {
  name: string;
  fields: string[]; // Fields that must be related
  type:
    | 'required_together'
    | 'mutually_exclusive'
    | 'dependent_on'
    | 'conditional';
  condition?: string;
  message?: string;
}

export interface CustomValidator {
  name: string;
  field: string;
  validator: string;
  params?: unknown[];
  message?: string;
}

export interface TemplateSection {
  name: string;
  required: boolean;
  min_length?: number;
  max_length?: number;
  fields?: string[];
  conditional?: string;
}

export interface Template {
  name: string;
  type: string;
  extends?: string;
  validation: TemplateValidation;
  sections: TemplateSection[];
  content: string;
  rawContent: string;
  parentTemplate?: Template;
  partials?: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface TemplateVariable {
  name: string;
  value?: string;
  type: 'static' | 'dynamic' | 'conditional';
  description?: string;
}

export interface Partial {
  name: string;
  content: string;
  parameters?: string[];
  description?: string;
}
