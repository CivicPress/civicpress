/**
 * TemplateGenerator — extracted from template-engine.ts in Phase 2d W2-T1.
 *
 * Pure-ish content-generation responsibilities: variable substitution,
 * conditional block processing, partial inlining, smart-default variable
 * fills, and XSS-sanitization of substituted values. Takes a partial-
 * loader callback (typically TemplateLoader.loadPartial) so it doesn't
 * carry filesystem state itself.
 */

import type { Template, TemplateVariable, Partial } from './types.js';

export class TemplateGenerator {
  constructor(private partialLoader: (name: string) => Partial | null) {}

  /**
   * Generate content from template with variables
   */
  generateContent(template: Template, variables: Record<string, any> = {}): string {
    let content = template.content;

    const processedVariables = this.processTemplateVariables(variables, template);

    // Process partials first
    content = this.processPartials(content, processedVariables);

    // Replace variables in content (with sanitization to prevent injection)
    for (const [key, value] of Object.entries(processedVariables)) {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      const sanitizedValue = this.sanitizeVariableValue(String(value || ''));
      content = content.replace(regex, sanitizedValue);
    }

    // Process conditional blocks
    content = this.processConditionalBlocks(content, processedVariables);

    return content;
  }

  /**
   * Get available template variables (metadata)
   */
  getTemplateVariables(_template: Template): TemplateVariable[] {
    return [
      // Static
      { name: 'title', type: 'static', description: 'Record title' },
      { name: 'type', type: 'static', description: 'Record type' },
      { name: 'status', type: 'static', description: 'Record status' },
      { name: 'author', type: 'dynamic', description: 'Record author' },
      { name: 'version', type: 'dynamic', description: 'Record version' },
      // Dynamic
      { name: 'date', type: 'dynamic', description: 'Current date' },
      { name: 'created', type: 'dynamic', description: 'Creation date' },
      { name: 'updated', type: 'dynamic', description: 'Last updated date' },
      // Type-specific
      { name: 'bylaw_number', type: 'dynamic', description: 'Bylaw number' },
      { name: 'policy_number', type: 'dynamic', description: 'Policy number' },
      {
        name: 'resolution_number',
        type: 'dynamic',
        description: 'Resolution number',
      },
      { name: 'fiscal_year', type: 'dynamic', description: 'Fiscal year' },
      // Conditional
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
  }

  // ----- partials -----

  private processPartials(
    content: string,
    variables: Record<string, any>
  ): string {
    const partialRegex = /{{>\s*([a-zA-Z0-9_-]+)(?:\s+([^}]+))?}}/g;

    return content.replace(partialRegex, (_match, partialName, params) => {
      const partial = this.partialLoader(partialName);
      if (!partial) {
        return `<!-- Partial not found: ${partialName} -->`;
      }

      const partialVariables = this.parsePartialParameters(params, variables);

      let partialContent = partial.content;
      for (const [key, value] of Object.entries(partialVariables)) {
        const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
        partialContent = partialContent.replace(regex, String(value || ''));
      }

      partialContent = this.processConditionalBlocks(
        partialContent,
        partialVariables
      );

      return partialContent;
    });
  }

  private parsePartialParameters(
    paramsString: string | undefined,
    globalVariables: Record<string, any>
  ): Record<string, any> {
    const partialVariables: Record<string, any> = {};

    if (!paramsString) return partialVariables;

    const paramRegex = /(\w+)=([^\s]+)/g;
    let match;
    while ((match = paramRegex.exec(paramsString)) !== null) {
      const [, paramName, paramValue] = match;
      if (globalVariables[paramValue]) {
        partialVariables[paramName] = globalVariables[paramValue];
      } else {
        partialVariables[paramName] = paramValue.replace(/['"]/g, '');
      }
    }

    return partialVariables;
  }

  // ----- variable processing -----

  private processTemplateVariables(
    variables: Record<string, any>,
    template: Template
  ): Record<string, any> {
    const processed: Record<string, any> = { ...variables };

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

    if (template.type === 'bylaw' && !processed.bylaw_number) {
      processed.bylaw_number = this.generateBylawNumber();
    }

    if (template.type === 'policy' && !processed.policy_number) {
      processed.policy_number = this.generatePolicyNumber();
    }

    if (template.type === 'resolution' && !processed.resolution_number) {
      processed.resolution_number = this.generateResolutionNumber();
    }

    if (!processed.fiscal_year) {
      const currentYear = new Date().getFullYear();
      processed.fiscal_year = currentYear.toString();
    }

    return processed;
  }

  // ----- conditionals -----

  private processConditionalBlocks(
    content: string,
    variables: Record<string, any>
  ): string {
    const ifBlockRegex = /{{#if\s+([^}]+)}}([\s\S]*?){{\/if}}/g;
    return content.replace(ifBlockRegex, (_match, condition, blockContent) => {
      if (this.evaluateCondition(condition, variables)) {
        return blockContent;
      }
      return '';
    });
  }

  private evaluateCondition(
    condition: string,
    variables: Record<string, any>
  ): boolean {
    // Supports: field, !field, field == 'value', field != 'value'
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

  // ----- smart defaults -----

  private detectAuthor(): string {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
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

  private generateBylawNumber(): string {
    const year = new Date().getFullYear();
    const random = Math.floor(Math.random() * 999) + 1;
    return `${year}-${random.toString().padStart(3, '0')}`;
  }

  private generatePolicyNumber(): string {
    const year = new Date().getFullYear();
    const random = Math.floor(Math.random() * 999) + 1;
    return `POL-${year}-${random.toString().padStart(3, '0')}`;
  }

  private generateResolutionNumber(): string {
    const year = new Date().getFullYear();
    const random = Math.floor(Math.random() * 999) + 1;
    return `RES-${year}-${random.toString().padStart(3, '0')}`;
  }

  // ----- sanitization -----

  /**
   * Sanitize variable value to prevent code injection in template
   * substitution output. Strips script/iframe tags, javascript: protocol,
   * and on* event handlers.
   */
  private sanitizeVariableValue(value: string): string {
    if (!value) return '';

    let sanitized = value.replace(
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      ''
    );
    sanitized = sanitized.replace(
      /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
      ''
    );
    sanitized = sanitized.replace(/javascript:/gi, '');
    sanitized = sanitized.replace(/on\w+\s*=/gi, '');

    return sanitized;
  }
}
