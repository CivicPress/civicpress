/**
 * Compliance Field Helpers - Validate and Generate Compliance Fields
 *
 * This utility provides helpers for validating and generating compliance-related
 * fields according to various standards (ISO 15489, Dublin Core, WCAG, etc.).
 *
 * @module utils/compliance-helpers
 */

import { Logger } from './logger.js';

const logger = new Logger();

/**
 * ComplianceFieldHelpers - Utilities for compliance field validation
 */
export class ComplianceFieldHelpers {
  /**
   * Validate ISO 639-1 language code (e.g., "en", "fr", "en-CA")
   *
   * @param code - The language code to validate
   * @returns True if valid, false otherwise
   */
  static validateLanguageCode(code: string): boolean {
    // ISO 639-1: 2-letter codes (e.g., "en", "fr")
    // Extended: 2-letter + optional region (e.g., "en-CA", "fr-CA")
    const pattern = /^[a-z]{2}(-[A-Z]{2})?$/;
    return pattern.test(code);
  }

  /**
   * Get list of common ISO 639-1 language codes
   */
  static getCommonLanguageCodes(): string[] {
    return [
      'en', 'fr', 'es', 'de', 'it', 'pt', 'ru', 'zh', 'ja', 'ko',
      'ar', 'hi', 'nl', 'sv', 'pl', 'tr', 'vi', 'th', 'id', 'cs',
    ];
  }

  /**
   * Validate retention schedule format
   * Accepts: "permanent", "temporary", or duration strings like "10 years", "5 years"
   *
   * @param schedule - The retention schedule string
   * @returns True if valid, false otherwise
   */
  static validateRetentionSchedule(schedule: string): boolean {
    if (schedule === 'permanent' || schedule === 'temporary') {
      return true;
    }

    // Check for duration format: "N years", "N months", "N days"
    const durationPattern = /^\d+\s+(years?|months?|days?)$/i;
    return durationPattern.test(schedule);
  }

  /**
   * Validate jurisdiction value
   *
   * @param jurisdiction - The jurisdiction string
   * @returns True if valid, false otherwise
   */
  static validateJurisdiction(jurisdiction: string): boolean {
    const validJurisdictions = ['federal', 'provincial', 'state', 'municipal'];
    return validJurisdictions.includes(jurisdiction.toLowerCase());
  }

  /**
   * Validate classification level
   *
   * @param classification - The classification string
   * @returns True if valid, false otherwise
   */
  static validateClassification(classification: string): boolean {
    const validClassifications = ['public', 'confidential', 'restricted', 'secret'];
    return validClassifications.includes(classification.toLowerCase());
  }

  /**
   * Validate access level
   *
   * @param accessLevel - The access level string
   * @returns True if valid, false otherwise
   */
  static validateAccessLevel(accessLevel: string): boolean {
    const validLevels = ['public', 'restricted', 'confidential'];
    return validLevels.includes(accessLevel.toLowerCase());
  }

  /**
   * Validate WCAG level
   *
   * @param level - The WCAG level string
   * @returns True if valid, false otherwise
   */
  static validateWCAGLevel(level: string): boolean {
    const validLevels = ['A', 'AA', 'AAA'];
    return validLevels.includes(level.toUpperCase());
  }

  /**
   * Validate ISO 8601 time interval format
   * Format: "YYYY-MM-DD/YYYY-MM-DD" or "YYYY-MM-DDTHH:mm:ssZ/YYYY-MM-DDTHH:mm:ssZ"
   *
   * @param interval - The time interval string
   * @returns True if valid, false otherwise
   */
  static validateTimeInterval(interval: string): boolean {
    // Split by "/" and validate each part as ISO 8601 date or date-time
    const parts = interval.split('/');
    if (parts.length !== 2) {
      return false;
    }

    const [start, end] = parts;
    
    // Check if both parts are valid ISO 8601 dates or date-times
    // Pattern: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ or YYYY-MM-DDTHH:mm:ss+HH:mm
    const dateTimePatternStr = '^\\d{4}-\\d{2}-\\d{2}(T\\d{2}:\\d{2}:\\d{2}(\\.\\d{3})?(Z|[\\+\\-]\\d{2}:\\d{2}))?)?$';
    const dateTimePattern = new RegExp(dateTimePatternStr);
    return dateTimePattern.test(start) && dateTimePattern.test(end);
  }

  /**
   * Validate FOIA/ATIP exemption code format
   * Common formats: numeric codes, alphanumeric codes
   *
   * @param code - The exemption code string
   * @returns True if valid format, false otherwise
   */
  static validateExemptionCode(code: string): boolean {
    // Allow alphanumeric codes with optional dashes/underscores
    // Examples: "A.1", "B(1)", "15(1)", "s.24(1)"
    const pattern = /^[A-Za-z0-9().\-_]+$/;
    return pattern.test(code) && code.length <= 50;
  }

  /**
   * Generate a default compliance metadata object with recommended fields
   *
   * @param recordType - The record type
   * @param options - Options for generating defaults
   * @returns Default compliance metadata object
   */
  static generateDefaultComplianceMetadata(
    recordType: string,
    options: {
      language?: string;
      jurisdiction?: string;
      classification?: string;
      publicAccess?: boolean;
    } = {}
  ): Record<string, any> {
    const defaults: Record<string, any> = {
      language: options.language || 'en',
      jurisdiction: options.jurisdiction || 'municipal',
      classification: options.classification || 'public',
      public_access: options.publicAccess !== undefined ? options.publicAccess : true,
      access_level: options.publicAccess !== undefined 
        ? (options.publicAccess ? 'public' : 'restricted')
        : 'public',
      retention_schedule: 'permanent', // Default for legal documents
    };

    // Add type-specific defaults
    if (['bylaw', 'ordinance', 'policy', 'proclamation', 'resolution'].includes(recordType)) {
      defaults.retention_schedule = 'permanent';
      defaults.classification = 'public';
      defaults.public_access = true;
    }

    return defaults;
  }

  /**
   * Validate a complete compliance metadata object
   *
   * @param metadata - The metadata object to validate
   * @returns Array of validation errors (empty if valid)
   */
  static validateComplianceMetadata(metadata: Record<string, any>): Array<{
    field: string;
    message: string;
  }> {
    const errors: Array<{ field: string; message: string }> = [];

    // Validate language code
    if (metadata.language && !this.validateLanguageCode(metadata.language)) {
      errors.push({
        field: 'metadata.language',
        message: `Invalid language code: ${metadata.language}. Use ISO 639-1 format (e.g., "en", "fr", "en-CA")`,
      });
    }

    // Validate jurisdiction
    if (metadata.jurisdiction && !this.validateJurisdiction(metadata.jurisdiction)) {
      errors.push({
        field: 'metadata.jurisdiction',
        message: `Invalid jurisdiction: ${metadata.jurisdiction}. Must be one of: federal, provincial, state, municipal`,
      });
    }

    // Validate classification
    if (metadata.classification && !this.validateClassification(metadata.classification)) {
      errors.push({
        field: 'metadata.classification',
        message: `Invalid classification: ${metadata.classification}. Must be one of: public, confidential, restricted, secret`,
      });
    }

    // Validate access level
    if (metadata.access_level && !this.validateAccessLevel(metadata.access_level)) {
      errors.push({
        field: 'metadata.access_level',
        message: `Invalid access level: ${metadata.access_level}. Must be one of: public, restricted, confidential`,
      });
    }

    // Validate retention schedule
    if (metadata.retention_schedule && !this.validateRetentionSchedule(metadata.retention_schedule)) {
      errors.push({
        field: 'metadata.retention_schedule',
        message: `Invalid retention schedule: ${metadata.retention_schedule}. Use "permanent", "temporary", or duration (e.g., "10 years")`,
      });
    }

    // Validate WCAG level
    if (metadata.accessibility?.wcag_level && !this.validateWCAGLevel(metadata.accessibility.wcag_level)) {
      errors.push({
        field: 'metadata.accessibility.wcag_level',
        message: `Invalid WCAG level: ${metadata.accessibility.wcag_level}. Must be one of: A, AA, AAA`,
      });
    }

    // Validate time interval
    if (metadata.coverage?.temporal && !this.validateTimeInterval(metadata.coverage.temporal)) {
      errors.push({
        field: 'metadata.coverage.temporal',
        message: `Invalid time interval: ${metadata.coverage.temporal}. Use ISO 8601 format: YYYY-MM-DD/YYYY-MM-DD`,
      });
    }

    // Validate exemption codes
    if (metadata.exemption_codes && Array.isArray(metadata.exemption_codes)) {
      for (const code of metadata.exemption_codes) {
        if (typeof code === 'string' && !this.validateExemptionCode(code)) {
          errors.push({
            field: 'metadata.exemption_codes',
            message: `Invalid exemption code format: ${code}`,
          });
        }
      }
    }

    return errors;
  }
}

