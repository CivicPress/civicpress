/**
 * TemplateEngine — orchestrator for template loading, content generation,
 * and record validation. Phase 2d W2-T1 decomposed the prior 1,154-LoC
 * monolith into three internal collaborators under `template/`:
 *
 *   - TemplateLoader: filesystem access (loading, inheritance, listing)
 *   - TemplateGenerator: content generation (variables, conditionals,
 *     partials, smart defaults, XSS sanitization)
 *   - TemplateRecordValidator: record-against-template validation
 *
 * This file is the thin facade that preserves the existing public API
 * (loadTemplate, generateContent, validateRecord, listTemplates,
 * listPartials, getPartialDetails, getTemplateVariables) so consumers
 * (civic-core-services, record-manager, template-service, etc.) need no
 * code changes.
 *
 * Types are re-exported from `template/types.js` for backward compatibility
 * with imports like `import { TemplateValidation } from '@civicpress/core'`.
 */

import { TemplateLoader } from './template/loader.js';
import { TemplateGenerator } from './template/generator.js';
import { TemplateRecordValidator } from './template/record-validator.js';
import type {
  Template,
  TemplateVariable,
  Partial,
  ValidationResult,
} from './template/types.js';

export type {
  Template,
  TemplateSection,
  TemplateValidation,
  TemplateVariable,
  ValidationResult,
  AdvancedValidationRule,
  FieldRelationship,
  CustomValidator,
  Partial,
} from './template/types.js';

export class TemplateEngine {
  private loader: TemplateLoader;
  private generator: TemplateGenerator;
  private recordValidator: TemplateRecordValidator;

  constructor(dataDir: string) {
    this.loader = new TemplateLoader(dataDir);
    this.generator = new TemplateGenerator((name) =>
      this.loader.loadPartial(name)
    );
    this.recordValidator = new TemplateRecordValidator();
  }

  // ----- template loading + listing (delegated to TemplateLoader) -----

  loadTemplate(
    type: string,
    templateName: string = 'default'
  ): Promise<Template | null> {
    return this.loader.loadTemplate(type, templateName);
  }

  listTemplates(type: string): string[] {
    return this.loader.listTemplates(type);
  }

  listPartials(): string[] {
    return this.loader.listPartials();
  }

  getPartialDetails(partialName: string): Partial | null {
    return this.loader.loadPartial(partialName);
  }

  // ----- content generation (delegated to TemplateGenerator) -----

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  generateContent(template: Template, variables: Record<string, any> = {}): string {
    return this.generator.generateContent(template, variables);
  }

  getTemplateVariables(template: Template): TemplateVariable[] {
    return this.generator.getTemplateVariables(template);
  }

  // ----- record validation (delegated to TemplateRecordValidator) -----

  validateRecord(recordPath: string, template: Template): ValidationResult {
    return this.recordValidator.validateRecord(recordPath, template);
  }
}
