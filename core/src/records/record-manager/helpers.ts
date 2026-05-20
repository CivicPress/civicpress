/**
 * RecordManager helpers — pure module-level utilities extracted from
 * `record-manager.ts` during Phase 2d W2-T6 decomposition.
 *
 * These were previously private methods on `RecordManager` but had no
 * dependency on instance state, so they live here as plain functions.
 */

import { RecordParser } from '../record-parser.js';
import { RecordData } from '../record-manager.js';

/**
 * Create markdown content for a record.
 * Uses RecordParser for standardized formatting.
 */
export function createMarkdownContent(record: RecordData): string {
  return RecordParser.serializeToMarkdown(record);
}

/**
 * Normalize frontmatter for validation: convert Date objects to ISO strings.
 * gray-matter automatically parses ISO 8601 dates as Date objects, but schema
 * expects strings.
 */
export function normalizeFrontmatterForValidation(frontmatter: any): any {
  const normalized = { ...frontmatter };

  // Convert Date objects to ISO strings
  if (normalized.created instanceof Date) {
    normalized.created = normalized.created.toISOString();
  }
  if (normalized.updated instanceof Date) {
    normalized.updated = normalized.updated.toISOString();
  }
  if (normalized.date instanceof Date) {
    normalized.date = normalized.date.toISOString();
  }

  // Normalize source: if it's a string (old format), convert to object
  if (normalized.source) {
    if (typeof normalized.source === 'string') {
      normalized.source = {
        reference: normalized.source,
      };
    } else if (typeof normalized.source === 'object') {
      normalized.source = normalizeDatesInObject(normalized.source);
    }
  }

  // Recursively normalize nested objects (e.g., metadata fields)
  if (normalized.metadata && typeof normalized.metadata === 'object') {
    normalized.metadata = normalizeDatesInObject(normalized.metadata);
  }

  return normalized;
}

/**
 * Recursively convert Date objects to ISO strings in an object.
 */
export function normalizeDatesInObject(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (obj instanceof Date) {
    return obj.toISOString();
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => normalizeDatesInObject(item));
  }

  if (typeof obj === 'object') {
    const normalized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      normalized[key] = normalizeDatesInObject(value);
    }
    return normalized;
  }

  return obj;
}
