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
export function normalizeFrontmatterForValidation(
  frontmatter: Record<string, unknown>
): Record<string, unknown> {
  const normalized: Record<string, unknown> = { ...frontmatter };

  // Convert Date objects to ISO strings
  for (const key of ['created', 'updated', 'date'] as const) {
    const value = normalized[key];
    if (value instanceof Date) {
      normalized[key] = value.toISOString();
    }
  }

  // Normalize source: if it's a string (old format), convert to object
  const source = normalized.source;
  if (source) {
    if (typeof source === 'string') {
      normalized.source = { reference: source };
    } else if (typeof source === 'object') {
      normalized.source = normalizeDatesInObject(source);
    }
  }

  // Recursively normalize nested objects (e.g., metadata fields)
  const metadata = normalized.metadata;
  if (metadata && typeof metadata === 'object') {
    normalized.metadata = normalizeDatesInObject(metadata);
  }

  return normalized;
}

/**
 * Recursively convert Date objects to ISO strings in an object.
 */
export function normalizeDatesInObject(obj: unknown): unknown {
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
    const normalized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      normalized[key] = normalizeDatesInObject(value);
    }
    return normalized;
  }

  return obj;
}
