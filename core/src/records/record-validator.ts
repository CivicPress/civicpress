/**
 * Record Validator - Standardized Record Format Validation
 *
 * This module provides validation utilities for CivicPress records according
 * to the official record format standard. It validates:
 * - Required fields (id, title, type, status, author, created, updated)
 * - Field types and formats (ISO 8601 timestamps, valid IDs, etc.)
 * - Status and type values against approved lists
 * - Type-specific field requirements
 * - Structure of complex fields (authors, source, geography, etc.)
 *
 * @module records/record-validator
 */

import { RecordData } from './record-manager.js';
import { RecordParser } from './record-parser.js';
import { CentralConfigManager } from '../config/central-config.js';
import { Logger } from '../utils/logger.js';
import { RecordSchemaValidator } from './record-schema-validator.js';
import { ComplianceFieldHelpers } from '../utils/compliance-helpers.js';
import matter from 'gray-matter';

const logger = new Logger();

/**
 * Validation error with severity and field information
 */
export interface ValidationError {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  field: string;
  suggestion?: string;
}

/**
 * Validation result containing all issues found
 */
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  info: ValidationError[];
}

/**
 * RecordValidator - Validate records against the standard format
 * 
 * Validation rules are loaded dynamically from configuration files,
 * allowing new record types and statuses to be added without code changes.
 */
export class RecordValidator {
  /**
   * Get valid record types from configuration (loaded dynamically)
   */
  private static getValidTypes(): string[] {
    try {
      const recordTypes = CentralConfigManager.getRecordTypesConfig();
      return Object.keys(recordTypes);
    } catch (error) {
      logger.warn('Failed to load record types from config, using fallback', error);
      // Fallback to core types if config not available
      return ['bylaw', 'ordinance', 'policy', 'proclamation', 'resolution', 'geography', 'session'];
    }
  }

  /**
   * Get valid status values from configuration (loaded dynamically)
   */
  private static getValidStatuses(): string[] {
    try {
      const recordStatuses = CentralConfigManager.getRecordStatusesConfig();
      return Object.keys(recordStatuses);
    } catch (error) {
      logger.warn('Failed to load record statuses from config, using fallback', error);
      // Fallback to core statuses if config not available
      return [
        'draft',
        'pending_review',
        'under_review',
        'approved',
        'published',
        'rejected',
        'archived',
        'expired',
      ];
    }
  }

  /**
   * Validate a complete record
   *
   * @param record - RecordData object to validate
   * @param options - Validation options
   * @returns ValidationResult with all issues found
   */
  static validateRecord(
    record: RecordData,
    options: {
      strict?: boolean;
      checkFormat?: boolean;
      checkContent?: boolean;
    } = {}
  ): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    const info: ValidationError[] = [];

    // STEP 1: Schema validation first (fail fast on schema errors)
    // Convert RecordData to frontmatter format for schema validation
    const markdownContent = RecordParser.serializeToMarkdown(record);
    const { data: frontmatter } = matter(markdownContent);
    
    const schemaValidation = RecordSchemaValidator.validate(
      frontmatter,
      record.type,
      {
        includeModuleExtensions: true,
        includeTypeExtensions: true,
        strict: false,
      }
    );

    // Add schema validation errors
    errors.push(...schemaValidation.errors);
    warnings.push(...schemaValidation.warnings);
    info.push(...schemaValidation.info);

    // STEP 2: Business rule validation (only if schema passed or for additional checks)
    if (options.checkFormat !== false) {
      // Validate required fields (backup, though schema should catch these)
      this.validateRequiredFields(record, errors);

      // Validate field types
      this.validateFieldTypes(record, errors, warnings);

      // Validate field formats
      this.validateFieldFormats(record, errors, warnings);

      // Validate status and type values
      this.validateStatus(record, errors, warnings);
      this.validateType(record, errors, warnings);

      // Validate type-specific fields
      this.validateTypeSpecificFields(record, errors, warnings);

      // Validate complex fields
      this.validateAuthors(record, warnings, info);
      this.validateSource(record, warnings);
      this.validateLinkedRecords(record, errors, warnings);
      this.validateAttachedFiles(record, errors, warnings);
      this.validateLinkedGeography(record, warnings);
    }

    // STEP 3: Compliance field validation
    if (record.metadata) {
      const complianceErrors = ComplianceFieldHelpers.validateComplianceMetadata(record.metadata);
      for (const complianceError of complianceErrors) {
        errors.push({
          severity: 'error',
          code: 'COMPLIANCE_VALIDATION_ERROR',
          message: complianceError.message,
          field: complianceError.field,
        });
      }
    }

    // Categorize issues by severity
    const result: ValidationResult = {
      isValid: errors.length === 0 && (!options.strict || warnings.length === 0),
      errors,
      warnings,
      info,
    };

    return result;
  }

  /**
   * Validate a markdown file string
   *
   * @param content - Full markdown file content
   * @param filePath - Optional file path for error reporting
   * @param options - Validation options
   * @returns ValidationResult with all issues found
   */
  static validateMarkdown(
    content: string,
    filePath?: string,
    options: {
      strict?: boolean;
      checkFormat?: boolean;
      checkContent?: boolean;
    } = {}
  ): ValidationResult {
    try {
      // Parse the markdown using RecordParser
      const record = RecordParser.parseFromMarkdown(content, filePath);

      // Validate the parsed record
      return this.validateRecord(record, options);
    } catch (error) {
      // Parsing failed - return error
      return {
        isValid: false,
        errors: [
          {
            severity: 'error',
            code: 'PARSE_ERROR',
            message: `Failed to parse record${filePath ? ` (${filePath})` : ''}: ${error instanceof Error ? error.message : String(error)}`,
            field: 'frontmatter',
          },
        ],
        warnings: [],
        info: [],
      };
    }
  }

  /**
   * Validate required fields are present
   */
  private static validateRequiredFields(
    record: RecordData,
    errors: ValidationError[]
  ): void {
    const required: Array<keyof RecordData> = [
      'id',
      'title',
      'type',
      'status',
      'author',
      'created_at',
      'updated_at',
    ];

    for (const field of required) {
      if (!record[field] || record[field] === '') {
        errors.push({
          severity: 'error',
          code: `MISSING_${field.toUpperCase()}`,
          message: `Required field '${field}' is missing or empty`,
          field: String(field),
          suggestion: this.getFieldSuggestion(field),
        });
      }
    }
  }

  /**
   * Validate field types
   */
  private static validateFieldTypes(
    record: RecordData,
    errors: ValidationError[],
    warnings: ValidationError[]
  ): void {
    // ID must be string
    if (record.id && typeof record.id !== 'string') {
      errors.push({
        severity: 'error',
        code: 'INVALID_ID_TYPE',
        message: 'Field `id` must be a string',
        field: 'id',
      });
    }

    // Title must be string
    if (record.title && typeof record.title !== 'string') {
      errors.push({
        severity: 'error',
        code: 'INVALID_TITLE_TYPE',
        message: 'Field `title` must be a string',
        field: 'title',
      });
    }

    // Authors must be array if present
    if (record.authors !== undefined && !Array.isArray(record.authors)) {
      errors.push({
        severity: 'error',
        code: 'INVALID_AUTHORS_TYPE',
        message: 'Field `authors` must be an array',
        field: 'authors',
      });
    }

    // Timestamps must be strings
    if (record.created_at && typeof record.created_at !== 'string') {
      errors.push({
        severity: 'error',
        code: 'INVALID_CREATED_TYPE',
        message: 'Field `created_at` must be a string',
        field: 'created_at',
      });
    }

    if (record.updated_at && typeof record.updated_at !== 'string') {
      errors.push({
        severity: 'error',
        code: 'INVALID_UPDATED_TYPE',
        message: 'Field `updated_at` must be a string',
        field: 'updated_at',
      });
    }
  }

  /**
   * Validate field formats
   */
  private static validateFieldFormats(
    record: RecordData,
    errors: ValidationError[],
    warnings: ValidationError[]
  ): void {
    // Validate ID format (alphanumeric, hyphens, underscores)
    if (record.id && !/^[a-zA-Z0-9_-]+$/.test(record.id)) {
      errors.push({
        severity: 'error',
        code: 'INVALID_ID_FORMAT',
        message: 'Field `id` must contain only alphanumeric characters, hyphens, and underscores',
        field: 'id',
        suggestion: 'Use format like: record-1234567890 or geo-001',
      });
    }

    // Validate timestamps (ISO 8601)
    if (record.created_at && !this.isValidISO8601(record.created_at)) {
      errors.push({
        severity: 'error',
        code: 'INVALID_CREATED_FORMAT',
        message: 'Field `created_at` must be in ISO 8601 format (e.g., 2025-01-15T10:30:00Z)',
        field: 'created_at',
        suggestion: 'Use ISO 8601 format: YYYY-MM-DDTHH:mm:ssZ',
      });
    }

    if (record.updated_at && !this.isValidISO8601(record.updated_at)) {
      errors.push({
        severity: 'error',
        code: 'INVALID_UPDATED_FORMAT',
        message: 'Field `updated_at` must be in ISO 8601 format (e.g., 2025-01-15T10:30:00Z)',
        field: 'updated_at',
        suggestion: 'Use ISO 8601 format: YYYY-MM-DDTHH:mm:ssZ',
      });
    }
  }

  /**
   * Validate status value (from configuration)
   */
  private static validateStatus(
    record: RecordData,
    errors: ValidationError[],
    warnings: ValidationError[]
  ): void {
    if (!record.status) return;

    const validStatuses = this.getValidStatuses();
    if (!validStatuses.includes(record.status)) {
      warnings.push({
        severity: 'warning',
        code: 'INVALID_STATUS',
        message: `Status '${record.status}' is not a configured status value`,
        field: 'status',
        suggestion: `Valid statuses: ${validStatuses.join(', ')}. Add new statuses in data/.civic/config.yml → record_statuses_config`,
      });
    }
  }

  /**
   * Validate type value (from configuration)
   */
  private static validateType(
    record: RecordData,
    errors: ValidationError[],
    warnings: ValidationError[]
  ): void {
    if (!record.type) return;

    const validTypes = this.getValidTypes();
    if (!validTypes.includes(record.type)) {
      warnings.push({
        severity: 'warning',
        code: 'INVALID_TYPE',
        message: `Type '${record.type}' is not a configured record type`,
        field: 'type',
        suggestion: `Valid types: ${validTypes.join(', ')}. Add new types in data/.civic/config.yml → record_types_config`,
      });
    }
  }

  /**
   * Validate type-specific fields
   */
  private static validateTypeSpecificFields(
    record: RecordData,
    errors: ValidationError[],
    warnings: ValidationError[]
  ): void {
    if (record.type === 'geography') {
      if (!record.geography && !record.metadata?.category) {
        warnings.push({
          severity: 'warning',
          code: 'MISSING_GEOGRAPHY_DATA',
          message: 'Geography records should have `geography_data` or `category` field',
          field: 'geography',
        });
      }
    }

    if (record.type === 'session') {
      if (!record.metadata?.session_type) {
        warnings.push({
          severity: 'info',
          code: 'MISSING_SESSION_TYPE',
          message: 'Session records should have `session_type` field',
          field: 'session_type',
        });
      }

      if (!record.metadata?.date) {
        warnings.push({
          severity: 'info',
          code: 'MISSING_SESSION_DATE',
          message: 'Session records should have `date` field',
          field: 'date',
        });
      }
    }
  }

  /**
   * Validate authors array structure
   */
  private static validateAuthors(
    record: RecordData,
    warnings: ValidationError[],
    info: ValidationError[]
  ): void {
    if (!record.authors || record.authors.length === 0) return;

    record.authors.forEach((author, index) => {
      if (!author.name) {
        warnings.push({
          severity: 'warning',
          code: 'MISSING_AUTHOR_NAME',
          message: `Author at index ${index} is missing required 'name' field`,
          field: `authors[${index}].name`,
        });
      }

      if (!author.username) {
        warnings.push({
          severity: 'warning',
          code: 'MISSING_AUTHOR_USERNAME',
          message: `Author at index ${index} is missing required 'username' field`,
          field: `authors[${index}].username`,
        });
      }

      // Check if primary author matches first author
      if (index === 0 && author.username !== record.author) {
        info.push({
          severity: 'info',
          code: 'AUTHOR_MISMATCH',
          message: `Primary author '${record.author}' does not match first author username '${author.username}'`,
          field: 'author',
        });
      }
    });
  }

  /**
   * Validate source object structure
   */
  private static validateSource(
    record: RecordData,
    warnings: ValidationError[]
  ): void {
    if (!record.source) return;

    if (!record.source.reference) {
      warnings.push({
        severity: 'warning',
        code: 'MISSING_SOURCE_REFERENCE',
        message: 'Source object should have a `reference` field',
        field: 'source.reference',
      });
    }

    if (record.source.type) {
      const validTypes = ['legacy', 'import', 'external'];
      if (!validTypes.includes(record.source.type)) {
        warnings.push({
          severity: 'warning',
          code: 'INVALID_SOURCE_TYPE',
          message: `Source type '${record.source.type}' is not valid`,
          field: 'source.type',
          suggestion: `Valid source types: ${validTypes.join(', ')}`,
        });
      }
    }

    if (record.source.imported_at && !this.isValidISO8601(record.source.imported_at)) {
      warnings.push({
        severity: 'warning',
        code: 'INVALID_SOURCE_IMPORTED_AT',
        message: 'Source `imported_at` must be in ISO 8601 format',
        field: 'source.imported_at',
      });
    }
  }

  /**
   * Validate linked records structure
   */
  private static validateLinkedRecords(
    record: RecordData,
    errors: ValidationError[],
    warnings: ValidationError[]
  ): void {
    if (!record.linkedRecords || record.linkedRecords.length === 0) return;

    record.linkedRecords.forEach((linkedRecord, index) => {
      if (!linkedRecord.id) {
        errors.push({
          severity: 'error',
          code: 'MISSING_LINKED_RECORD_ID',
          message: `Linked record at index ${index} is missing required 'id' field`,
          field: `linkedRecords[${index}].id`,
        });
      }

      if (!linkedRecord.type) {
        errors.push({
          severity: 'error',
          code: 'MISSING_LINKED_RECORD_TYPE',
          message: `Linked record at index ${index} is missing required 'type' field`,
          field: `linkedRecords[${index}].type`,
        });
      }

      if (!linkedRecord.description) {
        warnings.push({
          severity: 'warning',
          code: 'MISSING_LINKED_RECORD_DESCRIPTION',
          message: `Linked record at index ${index} is missing 'description' field`,
          field: `linkedRecords[${index}].description`,
        });
      }
    });
  }

  /**
   * Validate attached files structure
   */
  private static validateAttachedFiles(
    record: RecordData,
    errors: ValidationError[],
    warnings: ValidationError[]
  ): void {
    if (!record.attachedFiles || record.attachedFiles.length === 0) return;

    record.attachedFiles.forEach((file, index) => {
      if (!file.id) {
        errors.push({
          severity: 'error',
          code: 'MISSING_ATTACHED_FILE_ID',
          message: `Attached file at index ${index} is missing required 'id' field`,
          field: `attachedFiles[${index}].id`,
        });
      }

      if (!file.path) {
        errors.push({
          severity: 'error',
          code: 'MISSING_ATTACHED_FILE_PATH',
          message: `Attached file at index ${index} is missing required 'path' field`,
          field: `attachedFiles[${index}].path`,
        });
      }

      if (!file.original_name) {
        errors.push({
          severity: 'error',
          code: 'MISSING_ATTACHED_FILE_NAME',
          message: `Attached file at index ${index} is missing required 'original_name' field`,
          field: `attachedFiles[${index}].original_name`,
        });
      }
    });
  }

  /**
   * Validate linked geography files structure
   */
  private static validateLinkedGeography(
    record: RecordData,
    warnings: ValidationError[]
  ): void {
    if (!record.linkedGeographyFiles || record.linkedGeographyFiles.length === 0)
      return;

    record.linkedGeographyFiles.forEach((geoFile, index) => {
      if (!geoFile.id) {
        warnings.push({
          severity: 'warning',
          code: 'MISSING_LINKED_GEOGRAPHY_ID',
          message: `Linked geography file at index ${index} is missing 'id' field`,
          field: `linkedGeographyFiles[${index}].id`,
        });
      }

      if (!geoFile.name) {
        warnings.push({
          severity: 'warning',
          code: 'MISSING_LINKED_GEOGRAPHY_NAME',
          message: `Linked geography file at index ${index} is missing 'name' field`,
          field: `linkedGeographyFiles[${index}].name`,
        });
      }
    });
  }

  /**
   * Check if string is valid ISO 8601 timestamp
   */
  private static isValidISO8601(dateString: string): boolean {
    // Basic ISO 8601 format check
    const iso8601Regex =
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})$/;

    if (!iso8601Regex.test(dateString)) {
      return false;
    }

    // Try to parse and validate
    try {
      const date = new Date(dateString);
      return !isNaN(date.getTime());
    } catch {
      return false;
    }
  }

  /**
   * Get suggestion for missing field
   */
  private static getFieldSuggestion(field: string): string {
    const validTypes = this.getValidTypes();
    const validStatuses = this.getValidStatuses();
    
    const suggestions: Record<string, string> = {
      id: 'Generate a unique ID like: record-1234567890',
      title: 'Provide a descriptive title for the record',
      type: `Use one of: ${validTypes.join(', ')}. Add new types in data/.civic/config.yml`,
      status: `Use one of: ${validStatuses.join(', ')}. Add new statuses in data/.civic/config.yml`,
      author: 'Provide the username of the primary author',
      created_at: 'Use ISO 8601 format: 2025-01-15T10:30:00Z',
      updated_at: 'Use ISO 8601 format: 2025-01-15T10:30:00Z',
    };

    return suggestions[field] || `Provide a value for ${field}`;
  }
}

