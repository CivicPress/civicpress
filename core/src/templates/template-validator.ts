/**
 * Template Validator
 *
 * Validates template structure, inheritance chains, and security
 */

import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import type { TemplateValidation, Template } from '../utils/template-engine.js';
import type { ValidationResult, TemplateId } from './types.js';
import { parseTemplateId } from './types.js';

export class TemplateValidator {
  private dataDir: string;
  private customTemplatePath: string;
  private baseTemplatePath: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.customTemplatePath = path.join(dataDir, '.civic', 'templates');
    this.baseTemplatePath = path.join(
      process.cwd(),
      '.system-data',
      'templates'
    );
  }

  /**
   * Validate template structure
   */
  validateStructure(template: Template): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check required fields
    if (!template.name) {
      errors.push('Template name is required');
    }
    if (!template.type) {
      errors.push('Template type is required');
    }
    if (!template.content && !template.rawContent) {
      errors.push('Template content is required');
    }

    // Check validation structure
    if (template.validation) {
      if (
        !template.validation.required_fields &&
        !template.validation.sections
      ) {
        warnings.push(
          'Template validation should include required_fields or sections'
        );
      }
    }

    // Check for common placeholders
    if (template.content && !template.content.includes('{{title}}')) {
      warnings.push('Template should include {{title}} placeholder');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate inheritance chain and detect cycles
   */
  async validateInheritance(
    templateId: TemplateId,
    visited: Set<string> = new Set()
  ): Promise<{
    chain: string[];
    hasCycle: boolean;
    errors: string[];
  }> {
    const { type, name } = parseTemplateId(templateId);
    const chain: string[] = [];
    const errors: string[] = [];

    // Check for cycles
    if (visited.has(templateId)) {
      return {
        chain: Array.from(visited),
        hasCycle: true,
        errors: [
          `Circular inheritance detected: ${Array.from(visited).join(' -> ')} -> ${templateId}`,
        ],
      };
    }

    visited.add(templateId);
    chain.push(templateId);

    // Load template to check extends
    const template = await this.loadTemplate(type, name);
    if (!template) {
      errors.push(`Template not found: ${templateId}`);
      return { chain, hasCycle: false, errors };
    }

    if (template.extends) {
      // Validate parent template ID format
      if (!template.extends.includes('/')) {
        errors.push(
          `Invalid extends format: ${template.extends}. Expected format: {type}/{name}`
        );
        return { chain, hasCycle: false, errors };
      }

      // Recursively validate parent
      const parentResult = await this.validateInheritance(
        template.extends,
        new Set(visited)
      );
      chain.push(...parentResult.chain);
      if (parentResult.hasCycle) {
        return {
          chain,
          hasCycle: true,
          errors: [...errors, ...parentResult.errors],
        };
      }
      errors.push(...parentResult.errors);
    }

    return {
      chain,
      hasCycle: false,
      errors,
    };
  }

  /**
   * Validate template file path security
   */
  validatePath(templateId: TemplateId): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    try {
      const { type, name } = parseTemplateId(templateId);

      // Check for path traversal attempts
      if (type.includes('..') || name.includes('..')) {
        errors.push('Path traversal detected in template ID');
        return { valid: false, errors };
      }

      // Validate type and name format
      if (!/^[a-z0-9_-]+$/i.test(type)) {
        errors.push(
          `Invalid template type: ${type}. Only alphanumeric, hyphens, and underscores allowed.`
        );
      }
      if (!/^[a-z0-9_-]+$/i.test(name)) {
        errors.push(
          `Invalid template name: ${name}. Only alphanumeric, hyphens, and underscores allowed.`
        );
      }

      return {
        valid: errors.length === 0,
        errors,
      };
    } catch (error) {
      errors.push(
        error instanceof Error ? error.message : 'Invalid template ID format'
      );
      return { valid: false, errors };
    }
  }

  /**
   * Validate YAML frontmatter structure
   */
  validateFrontmatter(content: string): {
    valid: boolean;
    errors: string[];
    frontmatter?: any;
  } {
    const errors: string[] = [];

    try {
      const { data: frontmatter } = matter(content);

      // Check for required frontmatter fields
      if (!frontmatter.type) {
        errors.push('Frontmatter must include "type" field');
      }

      return {
        valid: errors.length === 0,
        errors,
        frontmatter,
      };
    } catch (error) {
      errors.push(
        `Invalid YAML frontmatter: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return { valid: false, errors };
    }
  }

  /**
   * Comprehensive template validation
   */
  async validateTemplate(
    templateId: TemplateId,
    template: Template
  ): Promise<ValidationResult> {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
    };

    // Validate path security
    const pathValidation = this.validatePath(templateId);
    if (!pathValidation.valid) {
      result.valid = false;
      result.errors.push(...pathValidation.errors);
    }

    // Validate structure
    const structureValidation = this.validateStructure(template);
    if (!structureValidation.valid) {
      result.valid = false;
      result.errors.push(...structureValidation.errors);
    }
    result.warnings.push(...structureValidation.warnings);

    // Validate frontmatter
    const frontmatterValidation = this.validateFrontmatter(template.rawContent);
    if (!frontmatterValidation.valid) {
      result.valid = false;
      result.errors.push(...frontmatterValidation.errors);
    }

    // Validate inheritance
    const inheritanceValidation = await this.validateInheritance(templateId);
    result.inheritance = {
      chain: inheritanceValidation.chain,
      hasCycle: inheritanceValidation.hasCycle,
    };
    if (inheritanceValidation.hasCycle) {
      result.valid = false;
      result.errors.push(...inheritanceValidation.errors);
    }
    if (inheritanceValidation.errors.length > 0) {
      result.warnings.push(...inheritanceValidation.errors);
    }

    // Store structure validation
    result.structure = {
      valid: structureValidation.valid,
      errors: structureValidation.errors,
    };

    return result;
  }

  /**
   * Load template for validation (helper method)
   */
  private async loadTemplate(
    type: string,
    name: string
  ): Promise<Template | null> {
    // Try custom template first
    const customPath = path.join(this.customTemplatePath, type, `${name}.md`);
    if (fs.existsSync(customPath)) {
      try {
        const content = fs.readFileSync(customPath, 'utf8');
        const { data: frontmatter, content: markdownContent } = matter(content);
        return {
          name,
          type,
          extends: frontmatter.extends,
          validation: frontmatter.validation || {},
          sections: frontmatter.sections || [],
          content: markdownContent,
          rawContent: content,
        } as Template;
      } catch {
        return null;
      }
    }

    // Try base template
    const basePath = path.join(this.baseTemplatePath, type, `${name}.md`);
    if (fs.existsSync(basePath)) {
      try {
        const content = fs.readFileSync(basePath, 'utf8');
        const { data: frontmatter, content: markdownContent } = matter(content);
        return {
          name,
          type,
          extends: frontmatter.extends,
          validation: frontmatter.validation || {},
          sections: frontmatter.sections || [],
          content: markdownContent,
          rawContent: content,
        } as Template;
      } catch {
        return null;
      }
    }

    return null;
  }
}
