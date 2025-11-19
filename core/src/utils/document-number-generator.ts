/**
 * Document Number Generator - Generate Official Document Numbers
 *
 * This utility generates official document numbers for legal documents
 * following common patterns (e.g., BYL-2024-001, ORD-15-42).
 *
 * @module utils/document-number-generator
 */

import { CentralConfigManager } from '../config/central-config.js';
import { Logger } from './logger.js';

const logger = new Logger();

/**
 * Document number format configuration
 */
interface DocumentNumberFormat {
  prefix: string; // e.g., "BYL", "ORD"
  yearFormat: 'full' | 'short'; // "2024" vs "24"
  separator: string; // "-" or "/"
  sequencePadding: number; // Number of digits for sequence (e.g., 3 = "001")
}

/**
 * DocumentNumberGenerator - Generate official document numbers
 */
export class DocumentNumberGenerator {
  /**
   * Get the document number format for a record type from config
   * Falls back to default format if not configured
   */
  private static getFormat(recordType: string): DocumentNumberFormat {
    try {
      const formats = CentralConfigManager.getDocumentNumberFormats();
      
      if (formats[recordType]) {
        // Map config format (snake_case) to internal format (camelCase)
        const configFormat = formats[recordType];
        return {
          prefix: configFormat.prefix,
          yearFormat: configFormat.year_format === 'short' ? 'short' : 'full',
          separator: configFormat.separator || '-',
          sequencePadding: configFormat.sequence_padding || 3,
        };
      }
    } catch (error) {
      logger.warn('Failed to load document number format from config, using default', error);
    }

    // Default format
    return {
      prefix: this.getDefaultPrefix(recordType),
      yearFormat: 'full',
      separator: '-',
      sequencePadding: 3,
    };
  }

  /**
   * Get default prefix for a record type
   */
  private static getDefaultPrefix(recordType: string): string {
    const prefixMap: Record<string, string> = {
      bylaw: 'BYL',
      ordinance: 'ORD',
      policy: 'POL',
      proclamation: 'PRO',
      resolution: 'RES',
      geography: 'GEO',
      session: 'SES',
    };

    return prefixMap[recordType] || 'DOC';
  }

  /**
   * Generate a document number for a record
   *
   * @param recordType - The record type (e.g., 'bylaw', 'ordinance')
   * @param year - The year (defaults to current year)
   * @param sequence - The sequence number (defaults to 1)
   * @returns Formatted document number (e.g., "BYL-2024-001")
   */
  static generate(
    recordType: string,
    year?: number,
    sequence: number = 1
  ): string {
    const format = this.getFormat(recordType);
    const yearValue = year || new Date().getFullYear();
    const yearStr = format.yearFormat === 'short' 
      ? String(yearValue).slice(-2) 
      : String(yearValue);
    
    const sequenceStr = String(sequence).padStart(format.sequencePadding, '0');

    return `${format.prefix}${format.separator}${yearStr}${format.separator}${sequenceStr}`;
  }

  /**
   * Parse a document number to extract components
   *
   * @param documentNumber - The document number to parse (e.g., "BYL-2024-001")
   * @returns Parsed components or null if invalid
   */
  static parse(documentNumber: string): {
    prefix: string;
    year: number;
    sequence: number;
  } | null {
    // Try to match common patterns: PREFIX-YEAR-SEQ or PREFIX/YEAR/SEQ
    const patterns = [
      /^([A-Z]+)[-/](\d{2,4})[-/](\d+)$/, // BYL-2024-001 or BYL/2024/001
      /^([A-Z]+)[-/](\d+)$/, // BYL-001 (no year)
    ];

    for (const pattern of patterns) {
      const match = documentNumber.match(pattern);
      if (match) {
        const prefix = match[1];
        const yearStr = match[2];
        const seqStr = match[3] || match[2]; // If no year, sequence is in position 2

        // Determine if year is 2-digit or 4-digit
        let year: number;
        if (yearStr.length === 2) {
          // 2-digit year: assume 20XX
          year = 2000 + parseInt(yearStr, 10);
        } else if (yearStr.length === 4) {
          year = parseInt(yearStr, 10);
        } else {
          // Not a valid year format
          continue;
        }

        return {
          prefix,
          year,
          sequence: parseInt(seqStr, 10),
        };
      }
    }

    return null;
  }

  /**
   * Validate a document number format
   *
   * @param documentNumber - The document number to validate
   * @param recordType - Optional record type to check prefix
   * @returns True if valid, false otherwise
   */
  static validate(documentNumber: string, recordType?: string): boolean {
    const parsed = this.parse(documentNumber);
    if (!parsed) {
      return false;
    }

    // If record type provided, check prefix matches
    if (recordType) {
      const expectedPrefix = this.getDefaultPrefix(recordType);
      return parsed.prefix === expectedPrefix;
    }

    return true;
  }

  /**
   * Get the next sequence number for a record type and year
   * This would typically query the database to find the highest sequence
   * For now, returns a placeholder that should be implemented with actual DB query
   *
   * @param recordType - The record type
   * @param year - The year
   * @returns Next sequence number
   */
  static async getNextSequence(
    recordType: string,
    year?: number
  ): Promise<number> {
    // TODO: Implement database query to find highest sequence for this type/year
    // For now, return 1 as placeholder
    logger.warn('getNextSequence not yet implemented, returning 1');
    return 1;
  }
}

