import * as fs from 'fs';
import * as path from 'path';
import yaml from 'yaml';
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
  min_length?: number;
  max_length?: number;
  fields?: string[];
  conditional?: string;
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
  partials?: string[]; // New: list of partials to include
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

// New: Partial interface
export interface Partial {
  name: string;
  content: string;
  parameters?: string[];
  description?: string;
}

export class TemplateEngine {
  private baseTemplatePath: string;
  private customTemplatePath: string;
  private partialsPath: string; // New: path to partials directory

  constructor(dataDir: string) {
    this.baseTemplatePath = path.join(process.cwd(), '.civic', 'templates');
    this.customTemplatePath = path.join(dataDir, '.civic', 'templates');
    this.partialsPath = path.join(dataDir, '.civic', 'partials'); // New: partials directory
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
   * List available templates for a type
   */
  listTemplates(type: string): string[] {
    const templates: string[] = [];

    // Check custom templates
    const customTypePath = path.join(this.customTemplatePath, type);
    if (fs.existsSync(customTypePath)) {
      const files = fs.readdirSync(customTypePath);
      for (const file of files) {
        if (file.endsWith('.md')) {
          templates.push(file.replace('.md', ''));
        }
      }
    }

    // Check base templates
    const baseTypePath = path.join(this.baseTemplatePath, type);
    if (fs.existsSync(baseTypePath)) {
      const files = fs.readdirSync(baseTypePath);
      for (const file of files) {
        if (file.endsWith('.md')) {
          const templateName = file.replace('.md', '');
          if (!templates.includes(templateName)) {
            templates.push(templateName);
          }
        }
      }
    }

    return templates;
  }

  /**
   * Generate content from template with variables
   */
  generateContent(
    template: Template,
    variables: Record<string, any> = {}
  ): string {
    let content = template.content;

    // Process template variables
    const processedVariables = this.processTemplateVariables(
      variables,
      template
    );

    // Process partials first
    content = this.processPartials(content, processedVariables);

    // Replace variables in content
    for (const [key, value] of Object.entries(processedVariables)) {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      content = content.replace(regex, String(value || ''));
    }

    // Process conditional blocks
    content = this.processConditionalBlocks(content, processedVariables);

    return content;
  }

  /**
   * Process partials in template content
   */
  private processPartials(
    content: string,
    variables: Record<string, any>
  ): string {
    // Process {{> partial-name param1=value1 param2=value2}} syntax
    const partialRegex = /{{>\s*([a-zA-Z0-9_-]+)(?:\s+([^}]+))?}}/g;

    return content.replace(partialRegex, (match, partialName, params) => {
      const partial = this.loadPartial(partialName);
      if (!partial) {
        return `<!-- Partial not found: ${partialName} -->`;
      }

      // Parse parameters
      const partialVariables = this.parsePartialParameters(params, variables);

      // Process the partial content with its own variables
      let partialContent = partial.content;

      // Replace variables in partial
      for (const [key, value] of Object.entries(partialVariables)) {
        const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
        partialContent = partialContent.replace(regex, String(value || ''));
      }

      // Process conditional blocks in partial
      partialContent = this.processConditionalBlocks(
        partialContent,
        partialVariables
      );

      return partialContent;
    });
  }

  /**
   * Load a partial by name
   */
  private loadPartial(partialName: string): Partial | null {
    try {
      // Try custom partials first
      const customPartialPath = path.join(
        this.partialsPath,
        `${partialName}.md`
      );
      if (fs.existsSync(customPartialPath)) {
        const content = fs.readFileSync(customPartialPath, 'utf8');
        const { data: frontmatter, content: markdownContent } = matter(content);

        return {
          name: partialName,
          content: markdownContent,
          parameters: frontmatter.parameters || [],
          description: frontmatter.description || '',
        };
      }

      // Try base partials (in templates directory)
      const basePartialPath = path.join(
        this.baseTemplatePath,
        'partials',
        `${partialName}.md`
      );
      if (fs.existsSync(basePartialPath)) {
        const content = fs.readFileSync(basePartialPath, 'utf8');
        const { data: frontmatter, content: markdownContent } = matter(content);

        return {
          name: partialName,
          content: markdownContent,
          parameters: frontmatter.parameters || [],
          description: frontmatter.description || '',
        };
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Parse partial parameters from string
   */
  private parsePartialParameters(
    paramsString: string | undefined,
    globalVariables: Record<string, any>
  ): Record<string, any> {
    const partialVariables: Record<string, any> = {};

    if (!paramsString) {
      return partialVariables;
    }

    // Parse parameters like "param1=value1 param2=value2"
    const paramRegex = /(\w+)=([^\s]+)/g;
    let match;

    while ((match = paramRegex.exec(paramsString)) !== null) {
      const [, paramName, paramValue] = match;

      // Check if the value is a variable reference (no quotes)
      if (globalVariables[paramValue]) {
        partialVariables[paramName] = globalVariables[paramValue];
      } else {
        // Remove quotes if present
        partialVariables[paramName] = paramValue.replace(/['"]/g, '');
      }
    }

    return partialVariables;
  }

  /**
   * List available partials
   */
  listPartials(): string[] {
    const partials: string[] = [];

    try {
      // Check custom partials
      if (fs.existsSync(this.partialsPath)) {
        const files = fs.readdirSync(this.partialsPath);
        for (const file of files) {
          if (file.endsWith('.md')) {
            partials.push(file.replace('.md', ''));
          }
        }
      }

      // Check base partials
      const basePartialsPath = path.join(this.baseTemplatePath, 'partials');
      if (fs.existsSync(basePartialsPath)) {
        const files = fs.readdirSync(basePartialsPath);
        for (const file of files) {
          if (file.endsWith('.md')) {
            const partialName = file.replace('.md', '');
            if (!partials.includes(partialName)) {
              partials.push(partialName);
            }
          }
        }
      }
    } catch (error) {
      // Ignore errors if directories don't exist
    }

    return partials;
  }

  /**
   * Get partial details
   */
  getPartialDetails(partialName: string): Partial | null {
    return this.loadPartial(partialName);
  }

  /**
   * Process template variables with smart defaults
   */
  private processTemplateVariables(
    variables: Record<string, any>,
    template: Template
  ): Record<string, any> {
    const processed: Record<string, any> = { ...variables };

    // Add smart defaults
    if (!processed.date && !processed.created) {
      processed.date = new Date().toISOString().split('T')[0];
      processed.created = processed.date;
    }

    if (!processed.updated) {
      processed.updated = processed.date;
    }

    if (!processed.author) {
      processed.author = this.detectAuthor();
    }

    if (!processed.version) {
      processed.version = '1.0.0';
    }

    if (!processed.status) {
      processed.status = 'draft';
    }

    // Add type-specific defaults
    if (template.type === 'bylaw' && !processed.bylaw_number) {
      processed.bylaw_number = this.generateBylawNumber();
    }

    if (template.type === 'policy' && !processed.policy_number) {
      processed.policy_number = this.generatePolicyNumber();
    }

    if (template.type === 'resolution' && !processed.resolution_number) {
      processed.resolution_number = this.generateResolutionNumber();
    }

    // Add fiscal year if not present
    if (!processed.fiscal_year) {
      const currentYear = new Date().getFullYear();
      processed.fiscal_year = currentYear.toString();
    }

    return processed;
  }

  /**
   * Process conditional blocks in template content
   */
  private processConditionalBlocks(
    content: string,
    variables: Record<string, any>
  ): string {
    // Process {{#if condition}}...{{/if}} blocks
    const ifBlockRegex = /{{#if\s+([^}]+)}}([\s\S]*?){{\/if}}/g;

    return content.replace(ifBlockRegex, (match, condition, blockContent) => {
      if (this.evaluateCondition(condition, variables)) {
        return blockContent;
      }
      return '';
    });
  }

  /**
   * Evaluate a condition expression
   */
  private evaluateCondition(
    condition: string,
    variables: Record<string, any>
  ): boolean {
    // Simple condition evaluation
    // Supports: field == 'value', field != 'value', field, !field

    const parts = condition.trim().split(/\s*(==|!=)\s*/);

    if (parts.length === 1) {
      // Simple field check: field or !field
      const field = parts[0].replace(/^!/, '');
      const value = variables[field];
      const isNegated = parts[0].startsWith('!');

      if (isNegated) {
        return !value || value === '' || value === null || value === undefined;
      } else {
        return !!value && value !== '' && value !== null && value !== undefined;
      }
    } else if (parts.length === 3) {
      // Comparison: field == 'value' or field != 'value'
      const field = parts[0].trim();
      const operator = parts[1];
      const expectedValue = parts[2].replace(/['"]/g, ''); // Remove quotes
      const actualValue = variables[field];

      if (operator === '==') {
        return String(actualValue) === expectedValue;
      } else if (operator === '!=') {
        return String(actualValue) !== expectedValue;
      }
    }

    return false;
  }

  /**
   * Detect author from Git configuration
   */
  private detectAuthor(): string {
    try {
      const { execSync } = require('child_process');
      const gitName = execSync('git config user.name', {
        encoding: 'utf8',
      }).trim();
      const gitEmail = execSync('git config user.email', {
        encoding: 'utf8',
      }).trim();
      return `${gitName} <${gitEmail}>`;
    } catch {
      return 'Unknown Author';
    }
  }

  /**
   * Generate a bylaw number
   */
  private generateBylawNumber(): string {
    const year = new Date().getFullYear();
    const random = Math.floor(Math.random() * 999) + 1;
    return `${year}-${random.toString().padStart(3, '0')}`;
  }

  /**
   * Generate a policy number
   */
  private generatePolicyNumber(): string {
    const year = new Date().getFullYear();
    const random = Math.floor(Math.random() * 999) + 1;
    return `POL-${year}-${random.toString().padStart(3, '0')}`;
  }

  /**
   * Generate a resolution number
   */
  private generateResolutionNumber(): string {
    const year = new Date().getFullYear();
    const random = Math.floor(Math.random() * 999) + 1;
    return `RES-${year}-${random.toString().padStart(3, '0')}`;
  }

  /**
   * Get available template variables
   */
  getTemplateVariables(template: Template): TemplateVariable[] {
    const variables: TemplateVariable[] = [
      // Static variables
      { name: 'title', type: 'static', description: 'Record title' },
      { name: 'type', type: 'static', description: 'Record type' },
      { name: 'status', type: 'static', description: 'Record status' },
      { name: 'author', type: 'dynamic', description: 'Record author' },
      { name: 'version', type: 'dynamic', description: 'Record version' },

      // Dynamic variables
      { name: 'date', type: 'dynamic', description: 'Current date' },
      { name: 'created', type: 'dynamic', description: 'Creation date' },
      { name: 'updated', type: 'dynamic', description: 'Last updated date' },

      // Type-specific variables
      { name: 'bylaw_number', type: 'dynamic', description: 'Bylaw number' },
      { name: 'policy_number', type: 'dynamic', description: 'Policy number' },
      {
        name: 'resolution_number',
        type: 'dynamic',
        description: 'Resolution number',
      },
      { name: 'fiscal_year', type: 'dynamic', description: 'Fiscal year' },

      // Conditional variables
      {
        name: 'approval_date',
        type: 'conditional',
        description: 'Approval date (when status is approved)',
      },
      {
        name: 'approved_by',
        type: 'conditional',
        description: 'Approver name (when status is approved)',
      },
      {
        name: 'approval_meeting',
        type: 'conditional',
        description: 'Approval meeting (when status is approved)',
      },
      {
        name: 'effective_date',
        type: 'conditional',
        description: 'Effective date (when status is active)',
      },
      {
        name: 'implementation_notes',
        type: 'conditional',
        description: 'Implementation notes (when status is active)',
      },
    ];

    return variables;
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
    // This is a placeholder - in a real implementation, you'd have more sophisticated rule parsing
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
    // Validate content quality (e.g., minimum length, professional tone)
    const contentFields = rule.fields.map((field) => frontmatter[field]);
    const totalContent = contentFields.join(' ');

    // Basic content quality checks
    if (totalContent.length < 50) {
      return { valid: false };
    }

    // Check for placeholder content
    if (totalContent.includes('[Add') || totalContent.includes('[TODO')) {
      return { valid: false };
    }

    return { valid: true };
  }

  private validateBusinessLogic(
    rule: AdvancedValidationRule,
    frontmatter: any
  ): { valid: boolean } {
    // Custom business logic validation
    // This is a placeholder - implement specific business rules as needed
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

  /**
   * Validation helper methods
   */
  private isValidEmail(email: string): boolean {
    if (!email) return true; // Empty is valid (not required)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private isValidUrl(url: string): boolean {
    if (!url) return true; // Empty is valid (not required)
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  private isValidPhone(phone: string): boolean {
    if (!phone) return true; // Empty is valid (not required)
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    return phoneRegex.test(phone.replace(/[\s\-\(\)]/g, ''));
  }

  private isValidDate(date: string): boolean {
    if (!date) return true; // Empty is valid (not required)
    const dateObj = new Date(date);
    return !isNaN(dateObj.getTime());
  }

  private isValidSemanticVersion(version: string): boolean {
    if (!version) return true; // Empty is valid (not required)
    const semverRegex = /^\d+\.\d+\.\d+$/;
    return semverRegex.test(version);
  }

  /**
   * Section validation helpers
   */
  private hasSection(content: string, sectionName: string): boolean {
    const sectionRegex = new RegExp(
      `^##\\s*${sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
      'm'
    );
    return sectionRegex.test(content);
  }

  private getSectionContent(
    content: string,
    sectionName: string
  ): string | null {
    const sectionRegex = new RegExp(
      `^##\\s*${sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n([\\s\\S]*?)(?=^##|$)`,
      'm'
    );
    const match = content.match(sectionRegex);
    return match ? match[1] : null;
  }
}
