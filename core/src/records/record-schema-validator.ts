/**
 * Record Schema Validator - JSON Schema Validation for Records
 *
 * This module validates record frontmatter against JSON Schema using ajv.
 * It provides:
 * - Fast, declarative validation
 * - Clear error messages with field paths
 * - Integration with RecordSchemaBuilder for dynamic schemas
 * - Support for type-specific and module-specific validation
 *
 * @module records/record-schema-validator
 */

import AjvModule from 'ajv';
import addFormatsModule from 'ajv-formats';
import { RecordSchemaBuilder } from './record-schema-builder.js';
import { Logger } from '../utils/logger.js';
import { ValidationError, ValidationResult } from './record-validator.js';

// Handle default export for ajv
const Ajv = (AjvModule as any).default || AjvModule;
const addFormats = (addFormatsModule as any).default || addFormatsModule;

const logger = new Logger();

/**
 * RecordSchemaValidator - Validates frontmatter against JSON Schema
 */
export class RecordSchemaValidator {
  private static ajvInstance: any = null;

  /**
   * Get or create the Ajv instance (singleton)
   */
  private static getAjv(): any {
    if (!this.ajvInstance) {
      this.ajvInstance = new Ajv({
        allErrors: true, // Collect all errors, not just the first
        strict: false, // Allow additional properties (we validate what we care about)
        validateFormats: true, // Validate format strings (date-time, email, etc.)
        verbose: true, // Include schema path in errors
      });
      
      // Add format validators (date-time, email, uri, etc.)
      addFormats(this.ajvInstance);
    }
    
    return this.ajvInstance;
  }

  /**
   * Validate frontmatter data against JSON Schema
   *
   * @param frontmatter - The frontmatter object to validate (parsed YAML)
   * @param recordType - Optional record type for type-specific validation
   * @param options - Validation options
   * @returns ValidationResult with errors, warnings, and info messages
   */
  static validate(
    frontmatter: any,
    recordType?: string,
    options: {
      includeModuleExtensions?: boolean;
      includeTypeExtensions?: boolean;
      strict?: boolean;
    } = {}
  ): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      info: [],
    };

    try {
      // Build the schema for this record type
      const schema = RecordSchemaBuilder.buildSchema(recordType || frontmatter?.type, {
        includeModuleExtensions: options.includeModuleExtensions ?? true,
        includeTypeExtensions: options.includeTypeExtensions ?? true,
      });

      // Get Ajv instance and compile schema
      const ajv = this.getAjv();
      const validate = ajv.compile(schema);

      // Validate the frontmatter
      const isValid = validate(frontmatter);

      if (!isValid && validate.errors) {
        result.isValid = false;
        
        // Convert Ajv errors to ValidationError format
        for (const ajvError of validate.errors) {
          const error: ValidationError = {
            severity: 'error',
            code: ajvError.keyword || 'SCHEMA_VALIDATION_ERROR',
            message: this.formatErrorMessage(ajvError),
            field: ajvError.instancePath || ajvError.schemaPath || 'unknown',
            suggestion: this.getSuggestion(ajvError),
          };
          
          result.errors.push(error);
        }
      } else {
        result.isValid = true;
      }

      // Additional business rule validations (if needed)
      if (result.isValid) {
        const businessRuleResult = this.validateBusinessRules(frontmatter, recordType);
        result.errors.push(...businessRuleResult.errors);
        result.warnings.push(...businessRuleResult.warnings);
        result.info.push(...businessRuleResult.info);
        result.isValid = result.errors.length === 0;
      }

    } catch (error) {
      logger.error('Schema validation failed', error);
      result.isValid = false;
      result.errors.push({
        severity: 'error',
        code: 'SCHEMA_VALIDATION_EXCEPTION',
        message: `Schema validation exception: ${error instanceof Error ? error.message : String(error)}`,
        field: 'schema',
      });
    }

    return result;
  }

  /**
   * Format Ajv error message for better readability
   */
  private static formatErrorMessage(ajvError: any): string {
    const field = ajvError.instancePath?.replace(/^\//, '') || 'root';
    const keyword = ajvError.keyword;

    switch (keyword) {
      case 'required':
        return `Missing required field: ${ajvError.params.missingProperty}`;
      
      case 'type':
        return `Field "${field}" must be of type ${ajvError.params.type}, got ${typeof ajvError.data}`;
      
      case 'enum':
        return `Field "${field}" must be one of: ${ajvError.params.allowedValues.join(', ')}`;
      
      case 'format':
        return `Field "${field}" must be a valid ${ajvError.params.format}`;
      
      case 'pattern':
        return `Field "${field}" does not match required pattern: ${ajvError.params.pattern}`;
      
      case 'minLength':
        return `Field "${field}" must be at least ${ajvError.params.limit} characters`;
      
      case 'maxLength':
        return `Field "${field}" must be at most ${ajvError.params.limit} characters`;
      
      case 'minimum':
        return `Field "${field}" must be at least ${ajvError.params.limit}`;
      
      case 'maximum':
        return `Field "${field}" must be at most ${ajvError.params.limit}`;
      
      default:
        return ajvError.message || `Validation failed for field "${field}"`;
    }
  }

  /**
   * Get a helpful suggestion based on the error
   */
  private static getSuggestion(ajvError: any): string | undefined {
    const keyword = ajvError.keyword;
    const field = ajvError.instancePath?.replace(/^\//, '') || '';

    switch (keyword) {
      case 'required':
        return `Add the "${ajvError.params.missingProperty}" field to the frontmatter`;
      
      case 'type':
        if (ajvError.params.type === 'string') {
          return `Ensure "${field}" is a string value (use quotes in YAML if needed)`;
        }
        return `Ensure "${field}" is of type ${ajvError.params.type}`;
      
      case 'format':
        if (ajvError.params.format === 'date-time') {
          return `Use ISO 8601 format: YYYY-MM-DDTHH:mm:ssZ (e.g., "2025-01-15T10:30:00Z")`;
        }
        if (ajvError.params.format === 'email') {
          return `Use a valid email format: user@example.com`;
        }
        return `Use a valid ${ajvError.params.format} format`;
      
      case 'enum':
        return `Choose one of the allowed values: ${ajvError.params.allowedValues.join(', ')}`;
      
      default:
        return undefined;
    }
  }

  /**
   * Validate additional business rules that aren't captured in JSON Schema
   * (e.g., cross-field validation, custom logic)
   */
  private static validateBusinessRules(
    frontmatter: any,
    recordType?: string
  ): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      info: [],
    };

    // Example: Validate that if authors array exists, it should have at least one entry
    if (frontmatter.authors && Array.isArray(frontmatter.authors)) {
      if (frontmatter.authors.length === 0) {
        result.warnings.push({
          severity: 'warning',
          code: 'EMPTY_AUTHORS_ARRAY',
          message: 'Authors array is empty. Consider removing it or adding author information.',
          field: 'authors',
        });
      }
    }

    // Example: Validate that created <= updated
    if (frontmatter.created && frontmatter.updated) {
      const created = new Date(frontmatter.created);
      const updated = new Date(frontmatter.updated);
      
      if (created > updated) {
        result.warnings.push({
          severity: 'warning',
          code: 'INVALID_TIMESTAMP_ORDER',
          message: 'Created timestamp is after updated timestamp. This may indicate a data entry error.',
          field: 'created',
        });
      }
    }

    // Add more business rules as needed

    return result;
  }

  /**
   * Clear the Ajv instance (useful for testing)
   */
  static clearCache(): void {
    this.ajvInstance = null;
    RecordSchemaBuilder.clearCache();
  }
}

