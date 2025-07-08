import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import matter from 'gray-matter';

export interface TemplateValidation {
  required_fields: string[];
  status_values: string[];
  business_rules: string[];
  sections: TemplateSection[];
  // New: Advanced validation rules
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
  condition?: string; // When this relationship applies
  message?: string;
}

export interface CustomValidator {
  name: string;
  field: string;
  validator: string; // Validator function name or expression
  params?: any[]; // Parameters for the validator
  message?: string;
}

export interface TemplateSection {
  name: string;
  required: boolean;
  fields?: string[];
  conditional?: string;
  min_length?: number;
}

export interface Template {
  name: string;
  type: string;
  extends?: string; // New: parent template to inherit from
  validation: TemplateValidation;
  sections: TemplateSection[];
  content: string;
  rawContent: string;
  parentTemplate?: Template; // New: reference to parent template
}

export interface TemplateContext {
  title: string;
  type: string;
  status: string;
  author: string;
  version: string;
  [key: string]: any;
}

export class TemplateEngine {
  private baseTemplatePath: string;
  private customTemplatePath: string;

  constructor(dataDir: string) {
    this.baseTemplatePath = path.join(process.cwd(), '.civic', 'templates');
    this.customTemplatePath = path.join(dataDir, '.civic', 'templates');
  }

  /**
   * Load a template by type and name with inheritance support
   */
  async loadTemplate(
    type: string,
    templateName: string = 'default'
  ): Promise<Template | null> {
    // Try custom template first
    const customPath = path.join(
      this.customTemplatePath,
      type,
      `${templateName}.md`
    );
    if (fs.existsSync(customPath)) {
      return this.parseTemplateWithInheritance(customPath, type, templateName);
    }

    // Fall back to base template
    const basePath = path.join(
      this.baseTemplatePath,
      type,
      `${templateName}.md`
    );
    if (fs.existsSync(basePath)) {
      return this.parseTemplateWithInheritance(basePath, type, templateName);
    }

    return null;
  }

  /**
   * Parse a template file with inheritance support
   */
  private async parseTemplateWithInheritance(
    filePath: string,
    type: string,
    name: string
  ): Promise<Template> {
    const content = fs.readFileSync(filePath, 'utf8');
    const { data: frontmatter, content: markdownContent } = matter(content);

    const template: Template = {
      name,
      type,
      extends: frontmatter.extends,
      validation: frontmatter.validation || {},
      sections: frontmatter.sections || [],
      content: markdownContent,
      rawContent: content,
    };

    // Handle inheritance
    if (template.extends) {
      const parentTemplate = await this.loadParentTemplate(template.extends);
      if (parentTemplate) {
        template.parentTemplate = parentTemplate;
        return this.mergeTemplates(parentTemplate, template);
      }
    }

    return template;
  }

  /**
   * Load parent template for inheritance
   */
  private async loadParentTemplate(
    extendsPath: string
  ): Promise<Template | null> {
    // Parse extends path (e.g., "bylaw/default" or "policy/standard")
    const [parentType, parentName] = extendsPath.split('/');

    // Try custom parent template first
    const customParentPath = path.join(
      this.customTemplatePath,
      parentType,
      `${parentName}.md`
    );
    if (fs.existsSync(customParentPath)) {
      return this.parseTemplateWithInheritance(
        customParentPath,
        parentType,
        parentName
      );
    }

    // Fall back to base parent template
    const baseParentPath = path.join(
      this.baseTemplatePath,
      parentType,
      `${parentName}.md`
    );
    if (fs.existsSync(baseParentPath)) {
      return this.parseTemplateWithInheritance(
        baseParentPath,
        parentType,
        parentName
      );
    }

    return null;
  }

  /**
   * Merge parent and child templates
   */
  private mergeTemplates(parent: Template, child: Template): Template {
    const merged: Template = {
      name: child.name,
      type: child.type,
      extends: child.extends,
      validation: this.mergeValidation(parent.validation, child.validation),
      sections: this.mergeSections(parent.sections, child.sections),
      content: child.content || parent.content, // Child content overrides parent
      rawContent: child.rawContent,
      parentTemplate: parent,
    };

    return merged;
  }

  /**
   * Merge validation rules from parent and child
   */
  private mergeValidation(
    parent: TemplateValidation,
    child: TemplateValidation
  ): TemplateValidation {
    return {
      required_fields: [
        ...(parent.required_fields || []),
        ...(child.required_fields || []),
      ],
      status_values: child.status_values || parent.status_values || [],
      business_rules: [
        ...(parent.business_rules || []),
        ...(child.business_rules || []),
      ],
      sections: this.mergeSections(parent.sections || [], child.sections || []),
      // Merge advanced validation rules
      advanced_rules: [
        ...(parent.advanced_rules || []),
        ...(child.advanced_rules || []),
      ],
      field_relationships: [
        ...(parent.field_relationships || []),
        ...(child.field_relationships || []),
      ],
      custom_validators: [
        ...(parent.custom_validators || []),
        ...(child.custom_validators || []),
      ],
    };
  }

  /**
   * Merge sections from parent and child
   */
  private mergeSections(
    parentSections: TemplateSection[],
    childSections: TemplateSection[]
  ): TemplateSection[] {
    const merged = new Map<string, TemplateSection>();

    // Add parent sections first
    for (const section of parentSections) {
      merged.set(section.name, { ...section });
    }

    // Override with child sections
    for (const section of childSections) {
      merged.set(section.name, { ...section });
    }

    return Array.from(merged.values());
  }

  /**
   * Parse a template file (legacy method for backward compatibility)
   */
  private parseTemplate(
    filePath: string,
    type: string,
    name: string
  ): Template {
    const content = fs.readFileSync(filePath, 'utf8');
    const { data: frontmatter, content: markdownContent } = matter(content);

    return {
      name,
      type,
      validation: frontmatter.validation || {},
      sections: frontmatter.sections || [],
      content: markdownContent,
      rawContent: content,
    };
  }

  /**
   * Process a template with context variables
   */
  processTemplate(template: Template, context: TemplateContext): string {
    let content = template.content;

    // Replace simple variables
    for (const [key, value] of Object.entries(context)) {
      const placeholder = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      content = content.replace(placeholder, String(value));
    }

    // Process conditional blocks
    content = this.processConditionals(content, context);

    return content;
  }

  /**
   * Process conditional blocks in template
   */
  private processConditionals(
    content: string,
    context: TemplateContext
  ): string {
    // Simple conditional processing for {{#if condition}}...{{/if}}
    const conditionalRegex = /{{#if\s+([^}]+)}}([\s\S]*?){{\/if}}/g;

    return content.replace(conditionalRegex, (match, condition, block) => {
      if (this.evaluateCondition(condition, context)) {
        return block;
      }
      return '';
    });
  }

  /**
   * Evaluate a condition against context
   */
  private evaluateCondition(
    condition: string,
    context: TemplateContext
  ): boolean {
    // Simple condition evaluation
    // Supports: status == 'approved', title, !title
    const trimmed = condition.trim();

    if (trimmed.includes('==')) {
      const [field, value] = trimmed.split('==').map((s) => s.trim());
      const fieldValue = context[field];
      const expectedValue = value.replace(/['"]/g, '');
      return fieldValue === expectedValue;
    }

    if (trimmed.startsWith('!')) {
      const field = trimmed.substring(1).trim();
      return !context[field];
    }

    return !!context[trimmed];
  }

  /**
   * Validate a record against its template
   */
  validateRecord(recordPath: string, template: Template): ValidationResult {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
    };

    if (!fs.existsSync(recordPath)) {
      result.valid = false;
      result.errors.push('Record file not found');
      return result;
    }

    const recordFileContent = fs.readFileSync(recordPath, 'utf8');
    const { data: recordFrontmatter, content: recordContent } =
      matter(recordFileContent);

    // Validate required fields
    for (const field of template.validation.required_fields || []) {
      if (!recordFrontmatter[field]) {
        result.valid = false;
        result.errors.push(`Missing required field: ${field}`);
      }
    }

    // Validate status values
    if (template.validation.status_values && recordFrontmatter.status) {
      if (
        !template.validation.status_values.includes(recordFrontmatter.status)
      ) {
        result.valid = false;
        result.errors.push(
          `Invalid status: ${recordFrontmatter.status}. Valid values: ${template.validation.status_values.join(', ')}`
        );
      }
    }

    // Validate business rules
    for (const rule of template.validation.business_rules || []) {
      if (!this.validateBusinessRule(rule, recordFrontmatter)) {
        result.warnings.push(`Business rule violation: ${rule}`);
      }
    }

    // Validate advanced rules
    for (const rule of template.validation.advanced_rules || []) {
      const validationResult = this.validateAdvancedRule(
        rule,
        recordFrontmatter
      );
      if (!validationResult.valid) {
        const message = rule.message || `Advanced rule violation: ${rule.name}`;
        if (rule.severity === 'error') {
          result.valid = false;
          result.errors.push(message);
        } else {
          result.warnings.push(message);
        }
      }
    }

    // Validate field relationships
    for (const relationship of template.validation.field_relationships || []) {
      const validationResult = this.validateFieldRelationship(
        relationship,
        recordFrontmatter
      );
      if (!validationResult.valid) {
        const message =
          relationship.message ||
          `Field relationship violation: ${relationship.name}`;
        result.warnings.push(message);
      }
    }

    // Validate custom validators
    for (const validator of template.validation.custom_validators || []) {
      const validationResult = this.validateCustomField(
        validator,
        recordFrontmatter
      );
      if (!validationResult.valid) {
        const message =
          validator.message || `Custom validation failed: ${validator.name}`;
        result.warnings.push(message);
      }
    }

    // Validate sections
    for (const section of template.validation.sections || []) {
      if (section.required && !this.hasSection(recordContent, section.name)) {
        result.valid = false;
        result.errors.push(`Missing required section: ${section.name}`);
      }

      if (section.min_length) {
        const sectionContent = this.getSectionContent(
          recordContent,
          section.name
        );
        if (sectionContent && sectionContent.length < section.min_length) {
          result.warnings.push(
            `Section ${section.name} is shorter than minimum length (${section.min_length} chars)`
          );
        }
      }
    }

    return result;
  }

  /**
   * Validate a business rule
   */
  private validateBusinessRule(rule: string, frontmatter: any): boolean {
    // Simple business rule validation
    if (rule.includes('approved') && rule.includes('approval_date')) {
      if (frontmatter.status === 'approved' && !frontmatter.approval_date) {
        return false;
      }
    }

    if (rule.includes('active') && rule.includes('effective_date')) {
      if (frontmatter.status === 'active' && !frontmatter.effective_date) {
        return false;
      }
    }

    if (rule.includes('semantic')) {
      const version = frontmatter.version;
      if (version && !/^\d+\.\d+\.\d+$/.test(version)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Validate an advanced rule
   */
  private validateAdvancedRule(
    rule: AdvancedValidationRule,
    frontmatter: any
  ): { valid: boolean } {
    // Check if rule condition applies
    if (
      rule.condition &&
      !this.evaluateCondition(rule.condition, frontmatter)
    ) {
      return { valid: true }; // Rule doesn't apply
    }

    // Evaluate the rule based on its type
    const ruleType = this.getRuleType(rule.rule);

    switch (ruleType) {
      case 'date_sequence':
        return this.validateDateSequence(rule, frontmatter);
      case 'field_dependency':
        return this.validateFieldDependency(rule, frontmatter);
      case 'content_quality':
        return this.validateContentQuality(rule, frontmatter);
      case 'business_logic':
        return this.validateBusinessLogic(rule, frontmatter);
      default:
        return { valid: true }; // Unknown rule type, skip
    }
  }

  /**
   * Validate field relationships
   */
  private validateFieldRelationship(
    relationship: FieldRelationship,
    frontmatter: any
  ): { valid: boolean } {
    // Check if relationship condition applies
    if (
      relationship.condition &&
      !this.evaluateCondition(relationship.condition, frontmatter)
    ) {
      return { valid: true }; // Relationship doesn't apply
    }

    const fieldValues = relationship.fields.map((field) => frontmatter[field]);

    switch (relationship.type) {
      case 'required_together':
        const allPresent = fieldValues.every(
          (value) => value !== undefined && value !== null && value !== ''
        );
        const allMissing = fieldValues.every(
          (value) => value === undefined || value === null || value === ''
        );
        return { valid: allPresent || allMissing };

      case 'mutually_exclusive':
        const presentCount = fieldValues.filter(
          (value) => value !== undefined && value !== null && value !== ''
        ).length;
        return { valid: presentCount <= 1 };

      case 'dependent_on':
        const [dependentField, requiredField] = relationship.fields;
        if (frontmatter[dependentField] && !frontmatter[requiredField]) {
          return { valid: false };
        }
        return { valid: true };

      case 'conditional':
        // Custom conditional logic
        return this.validateConditionalRelationship(relationship, frontmatter);

      default:
        return { valid: true };
    }
  }

  /**
   * Validate custom field validators
   */
  private validateCustomField(
    validator: CustomValidator,
    frontmatter: any
  ): { valid: boolean } {
    const fieldValue = frontmatter[validator.field];

    switch (validator.validator) {
      case 'email':
        return { valid: this.isValidEmail(fieldValue) };
      case 'url':
        return { valid: this.isValidUrl(fieldValue) };
      case 'phone':
        return { valid: this.isValidPhone(fieldValue) };
      case 'date':
        return { valid: this.isValidDate(fieldValue) };
      case 'semantic_version':
        return { valid: this.isValidSemanticVersion(fieldValue) };
      case 'required_if':
        const [conditionField, conditionValue] = validator.params || [];
        if (frontmatter[conditionField] === conditionValue) {
          return {
            valid:
              fieldValue !== undefined &&
              fieldValue !== null &&
              fieldValue !== '',
          };
        }
        return { valid: true };
      default:
        return { valid: true }; // Unknown validator, skip
    }
  }

  /**
   * Helper methods for advanced validation
   */
  private getRuleType(rule: string): string {
    if (rule.includes('date') && rule.includes('sequence'))
      return 'date_sequence';
    if (rule.includes('field') && rule.includes('dependency'))
      return 'field_dependency';
    if (rule.includes('content') && rule.includes('quality'))
      return 'content_quality';
    if (rule.includes('business') && rule.includes('logic'))
      return 'business_logic';
    return 'unknown';
  }

  private validateDateSequence(
    rule: AdvancedValidationRule,
    frontmatter: any
  ): { valid: boolean } {
    // Validate that dates are in logical sequence (e.g., approval_date <= effective_date)
    const dates = rule.fields
      .map((field) => frontmatter[field])
      .filter((date) => date);

    if (dates.length < 2) return { valid: true };

    const parsedDates = dates
      .map((date) => new Date(date))
      .filter((date) => !isNaN(date.getTime()));
    if (parsedDates.length < 2) return { valid: true };

    // Check if dates are in ascending order
    for (let i = 1; i < parsedDates.length; i++) {
      if (parsedDates[i] < parsedDates[i - 1]) {
        return { valid: false };
      }
    }

    return { valid: true };
  }

  private validateFieldDependency(
    rule: AdvancedValidationRule,
    frontmatter: any
  ): { valid: boolean } {
    // Validate field dependencies (e.g., if status is 'approved', approval_date must be set)
    const [dependentField, requiredField] = rule.fields;

    if (frontmatter[dependentField] && !frontmatter[requiredField]) {
      return { valid: false };
    }

    return { valid: true };
  }

  private validateContentQuality(
    rule: AdvancedValidationRule,
    frontmatter: any
  ): { valid: boolean } {
    // Validate content quality (e.g., minimum length, no placeholder text)
    const contentField = rule.fields[0];
    const content = frontmatter[contentField];

    if (!content) return { valid: true };

    // Check for placeholder text
    if (
      content.includes('[Add') ||
      content.includes('TODO') ||
      content.includes('FIXME')
    ) {
      return { valid: false };
    }

    // Check minimum length
    if (content.length < 50) {
      return { valid: false };
    }

    return { valid: true };
  }

  private validateBusinessLogic(
    rule: AdvancedValidationRule,
    frontmatter: any
  ): { valid: boolean } {
    // Validate business logic rules
    if (rule.rule.includes('approved_by_authority')) {
      if (frontmatter.status === 'approved' && !frontmatter.approved_by) {
        return { valid: false };
      }
    }

    if (rule.rule.includes('version_increment')) {
      const version = frontmatter.version;
      if (version && !/^\d+\.\d+\.\d+$/.test(version)) {
        return { valid: false };
      }
    }

    return { valid: true };
  }

  private validateConditionalRelationship(
    relationship: FieldRelationship,
    frontmatter: any
  ): { valid: boolean } {
    // Custom conditional relationship validation
    const [field1, field2] = relationship.fields;

    // Example: if field1 is set, field2 must also be set
    if (frontmatter[field1] && !frontmatter[field2]) {
      return { valid: false };
    }

    return { valid: true };
  }

  private isValidEmail(email: string): boolean {
    if (!email) return true;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private isValidUrl(url: string): boolean {
    if (!url) return true;
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  private isValidPhone(phone: string): boolean {
    if (!phone) return true;
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    return phoneRegex.test(phone.replace(/[\s\-\(\)]/g, ''));
  }

  private isValidDate(date: string): boolean {
    if (!date) return true;
    const parsed = new Date(date);
    return !isNaN(parsed.getTime());
  }

  private isValidSemanticVersion(version: string): boolean {
    if (!version) return true;
    const versionRegex = /^\d+\.\d+\.\d+$/;
    return versionRegex.test(version);
  }

  /**
   * Check if a section exists in content
   */
  private hasSection(content: string, sectionName: string): boolean {
    const sectionRegex = new RegExp(`^##\\s+${sectionName}$`, 'm');
    return sectionRegex.test(content);
  }

  /**
   * Get section content
   */
  private getSectionContent(
    content: string,
    sectionName: string
  ): string | null {
    const sectionRegex = new RegExp(
      `^##\\s+${sectionName}$\\s*([\\s\\S]*?)(?=^##\\s+|$)`,
      'm'
    );
    const match = content.match(sectionRegex);
    return match ? match[1].trim() : null;
  }

  /**
   * List available templates for a type
   */
  listTemplates(type: string): string[] {
    const templates: string[] = [];

    // Check custom templates
    const customTypePath = path.join(this.customTemplatePath, type);
    if (fs.existsSync(customTypePath)) {
      const files = fs.readdirSync(customTypePath);
      templates.push(
        ...files
          .filter((f) => f.endsWith('.md'))
          .map((f) => f.replace('.md', ''))
      );
    }

    // Check base templates
    const baseTypePath = path.join(this.baseTemplatePath, type);
    if (fs.existsSync(baseTypePath)) {
      const files = fs.readdirSync(baseTypePath);
      const baseTemplates = files
        .filter((f) => f.endsWith('.md'))
        .map((f) => f.replace('.md', ''));
      templates.push(...baseTemplates.filter((t) => !templates.includes(t)));
    }

    return templates;
  }
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
