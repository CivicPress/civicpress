/**
 * TemplateRecordValidator — extracted from template-engine.ts in
 * Phase 2d W2-T1. Owns the validateRecord surface and all its helpers:
 * advanced rules, field relationships, custom field validators, format
 * checkers, section helpers.
 */

import * as fs from 'fs';
import matter from 'gray-matter';
import type {
  Template,
  ValidationResult,
  AdvancedValidationRule,
  FieldRelationship,
  CustomValidator,
} from './types.js';

export class TemplateRecordValidator {
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

    // Required fields
    for (const field of template.validation.required_fields || []) {
      if (!recordFrontmatter[field]) {
        result.valid = false;
        result.errors.push(`Missing required field: ${field}`);
      }
    }

    // Status values
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

    // Business rules
    for (const rule of template.validation.business_rules || []) {
      if (!this.validateBusinessRule(rule, recordFrontmatter)) {
        result.warnings.push(`Business rule violation: ${rule}`);
      }
    }

    // Advanced rules
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

    // Field relationships
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

    // Custom validators
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

    // Sections
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

  // ----- rule helpers -----

  private validateBusinessRule(_rule: string, _frontmatter: Record<string, unknown>): boolean {
    // Placeholder — in a real implementation, more sophisticated parsing.
    return true;
  }

  private validateAdvancedRule(
    rule: AdvancedValidationRule,
    frontmatter: Record<string, unknown>
  ): { valid: boolean } {
    if (rule.condition && !this.evaluateCondition(rule.condition, frontmatter)) {
      return { valid: true };
    }

    switch (this.getRuleType(rule.rule)) {
      case 'date_sequence':
        return this.validateDateSequence(rule, frontmatter);
      case 'field_dependency':
        return this.validateFieldDependency(rule, frontmatter);
      case 'content_quality':
        return this.validateContentQuality(rule, frontmatter);
      case 'business_logic':
        return this.validateBusinessLogic(rule, frontmatter);
      default:
        return { valid: true };
    }
  }

  private validateFieldRelationship(
    relationship: FieldRelationship,
    frontmatter: Record<string, unknown>
  ): { valid: boolean } {
    if (
      relationship.condition &&
      !this.evaluateCondition(relationship.condition, frontmatter)
    ) {
      return { valid: true };
    }

    const fieldValues = relationship.fields.map((field) => frontmatter[field]);

    switch (relationship.type) {
      case 'required_together': {
        const allPresent = fieldValues.every(
          (value) => value !== undefined && value !== null && value !== ''
        );
        const allMissing = fieldValues.every(
          (value) => value === undefined || value === null || value === ''
        );
        return { valid: allPresent || allMissing };
      }
      case 'mutually_exclusive': {
        const presentCount = fieldValues.filter(
          (value) => value !== undefined && value !== null && value !== ''
        ).length;
        return { valid: presentCount <= 1 };
      }
      case 'dependent_on': {
        const [dependentField, requiredField] = relationship.fields;
        if (frontmatter[dependentField] && !frontmatter[requiredField]) {
          return { valid: false };
        }
        return { valid: true };
      }
      case 'conditional':
        return this.validateConditionalRelationship(relationship, frontmatter);
      default:
        return { valid: true };
    }
  }

  private validateCustomField(
    validator: CustomValidator,
    frontmatter: Record<string, unknown>
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
      case 'required_if': {
        const [conditionField, conditionValue] = (validator.params ?? []) as [
          string,
          unknown,
        ];
        if (frontmatter[conditionField] === conditionValue) {
          return {
            valid:
              fieldValue !== undefined &&
              fieldValue !== null &&
              fieldValue !== '',
          };
        }
        return { valid: true };
      }
      default:
        return { valid: true };
    }
  }

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
    frontmatter: Record<string, unknown>
  ): { valid: boolean } {
    const dates = rule.fields
      .map((field) => frontmatter[field])
      .filter((date) => date);

    if (dates.length < 2) return { valid: true };

    const parsedDates = dates
      .filter(
        (date): date is string | number | Date =>
          typeof date === 'string' ||
          typeof date === 'number' ||
          date instanceof Date
      )
      .map((date) => new Date(date))
      .filter((date) => !isNaN(date.getTime()));
    if (parsedDates.length < 2) return { valid: true };

    for (let i = 1; i < parsedDates.length; i++) {
      if (parsedDates[i] < parsedDates[i - 1]) return { valid: false };
    }
    return { valid: true };
  }

  private validateFieldDependency(
    rule: AdvancedValidationRule,
    frontmatter: Record<string, unknown>
  ): { valid: boolean } {
    const [dependentField, requiredField] = rule.fields;
    if (frontmatter[dependentField] && !frontmatter[requiredField]) {
      return { valid: false };
    }
    return { valid: true };
  }

  private validateContentQuality(
    rule: AdvancedValidationRule,
    frontmatter: Record<string, unknown>
  ): { valid: boolean } {
    const contentFields = rule.fields.map((field) => frontmatter[field]);
    const totalContent = contentFields.join(' ');

    if (totalContent.length < 50) return { valid: false };
    if (totalContent.includes('[Add') || totalContent.includes('[TODO')) {
      return { valid: false };
    }
    return { valid: true };
  }

  private validateBusinessLogic(
    _rule: AdvancedValidationRule,
    _frontmatter: Record<string, unknown>
  ): { valid: boolean } {
    // Placeholder — implement specific business rules as needed
    return { valid: true };
  }

  private validateConditionalRelationship(
    relationship: FieldRelationship,
    frontmatter: Record<string, unknown>
  ): { valid: boolean } {
    const [field1, field2] = relationship.fields;
    if (frontmatter[field1] && !frontmatter[field2]) {
      return { valid: false };
    }
    return { valid: true };
  }

  // ----- format validators -----

  private isValidEmail(email: unknown): boolean {
    if (typeof email !== 'string') return false;
    if (!email) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private isValidUrl(url: unknown): boolean {
    if (typeof url !== 'string') return false;
    if (!url) return true;
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  private isValidPhone(phone: unknown): boolean {
    if (typeof phone !== 'string') return false;
    if (!phone) return true;
    return /^[\+]?[1-9][\d]{0,15}$/.test(phone.replace(/[\s\-\(\)]/g, ''));
  }

  private isValidDate(date: unknown): boolean {
    if (typeof date !== 'string' && typeof date !== 'number') return false;
    if (!date) return true;
    const dateObj = new Date(date);
    return !isNaN(dateObj.getTime());
  }

  private isValidSemanticVersion(version: unknown): boolean {
    if (typeof version !== 'string') return false;
    if (!version) return true;
    return /^\d+\.\d+\.\d+$/.test(version);
  }

  // ----- section helpers -----

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

  // ----- condition evaluation (used by advanced-rule check) -----

  private evaluateCondition(
    condition: string,
    variables: Record<string, unknown>
  ): boolean {
    const parts = condition.trim().split(/\s*(==|!=)\s*/);

    if (parts.length === 1) {
      const field = parts[0].replace(/^!/, '');
      const value = variables[field];
      const isNegated = parts[0].startsWith('!');

      if (isNegated) {
        return !value || value === '' || value === null || value === undefined;
      }
      return !!value && value !== '' && value !== null && value !== undefined;
    } else if (parts.length === 3) {
      const field = parts[0].trim();
      const operator = parts[1];
      const expectedValue = parts[2].replace(/['"]/g, '');
      const actualValue = variables[field];

      if (operator === '==') return String(actualValue) === expectedValue;
      if (operator === '!=') return String(actualValue) !== expectedValue;
    }

    return false;
  }
}
