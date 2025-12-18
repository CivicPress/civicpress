/**
 * Record Parser - Standardized Record Format Parser and Serializer
 *
 * This module provides utilities for parsing and serializing CivicPress records
 * according to the official record format standard. It handles:
 * - Parsing markdown files with YAML frontmatter
 * - Converting between frontmatter format (created/updated) and internal format (created_at/updated_at)
 * - Serializing RecordData to properly formatted markdown with section comments
 * - Backward compatibility with old format records
 *
 * @module records/record-parser
 */

import matter from 'gray-matter';
import { stringify } from 'yaml';
import { RecordData } from './record-manager.js';
import { Logger } from '../utils/logger.js';
import { RecordSchemaValidator } from './record-schema-validator.js';
import { RecordValidationError } from '../errors/domain-errors.js';
import { ValidationError } from '../errors/index.js';

const logger = new Logger();

/**
 * Frontmatter structure as it appears in markdown files
 */
interface FrontmatterData {
  // Core Identification (Required)
  id: string;
  title: string;
  type: string;
  status: string;

  // Authorship (Required)
  author: string;
  authors?: Array<{
    name: string;
    username: string;
    role?: string;
    email?: string;
  }>;

  // Timestamps (Required - in frontmatter format)
  created: string;
  updated: string;

  // Classification (Optional)
  tags?: string[];
  module?: string;
  slug?: string;
  version?: string;
  priority?: 'low' | 'medium' | 'high';
  department?: string;

  // Source & Origin (Optional)
  source?: {
    reference: string;
    original_title?: string;
    original_filename?: string;
    url?: string;
    type?: 'legacy' | 'import' | 'external';
    imported_at?: string;
    imported_by?: string;
  };

  // Type-specific fields
  geography_data?: any;
  category?: string;
  session_type?: 'regular' | 'emergency' | 'special';
  date?: string;
  duration?: number;
  location?: string;
  attendees?: any[];
  topics?: any[];
  media?: any;

  // Relationships
  linked_records?: Array<{
    id: string;
    type: string;
    description: string;
    path?: string;
    category?: string;
  }>;
  linked_geography_files?: Array<{
    id: string;
    name: string;
    description?: string;
  }>;

  // File Attachments
  attached_files?: Array<{
    id: string;
    path: string;
    original_name: string;
    description?: string;
    category?:
      | string
      | {
          label: string;
          value: string;
          description: string;
        };
  }>;

  // Metadata (catch-all for other fields)
  [key: string]: any;
}

/**
 * RecordParser - Parse and serialize records according to the standard format
 */
export class RecordParser {
  /**
   * Parse a markdown file string into RecordData
   *
   * @param content - Full markdown file content with frontmatter
   * @param filePath - Optional file path for error reporting
   * @returns Parsed RecordData object
   * @throws Error if required fields are missing
   */
  static parseFromMarkdown(content: string, filePath?: string): RecordData {
    try {
      const { data: frontmatter, content: markdownContent } = matter(content);

      if (!frontmatter || typeof frontmatter !== 'object') {
        throw new ValidationError('Invalid or missing frontmatter', {
          filePath,
        });
      }

      // Normalize old format to new format
      const normalized = this.normalizeFormat(frontmatter);

      // Schema validation (fail fast on schema errors)
      const recordType = normalized.type;
      const schemaValidation = RecordSchemaValidator.validate(
        normalized,
        recordType,
        {
          includeModuleExtensions: true,
          includeTypeExtensions: true,
          strict: false, // Allow additional properties
        }
      );

      if (!schemaValidation.isValid && schemaValidation.errors.length > 0) {
        const errorMessages = schemaValidation.errors
          .map((err) => `${err.field}: ${err.message}`)
          .join('; ');
        throw new RecordValidationError(
          `Schema validation failed for record${filePath ? ` at ${filePath}` : ''}: ${errorMessages}`,
          { filePath, validationErrors: schemaValidation.errors }
        );
      }

      // Validate required fields (backup validation, though schema should catch these)
      this.validateRequiredFields(normalized, filePath);

      // Convert frontmatter format to RecordData format
      const record: RecordData = {
        id: normalized.id,
        title: normalized.title,
        type: normalized.type,
        status: normalized.status,
        content: markdownContent?.trim() || '',

        // Authorship - convert frontmatter format to internal format
        author: normalized.author,
        authors: normalized.authors,

        // Timestamps - convert 'created'/'updated' to 'created_at'/'updated_at'
        created_at: normalized.created,
        updated_at: normalized.updated,

        // Source & Origin
        source: normalized.source,

        // Commit Linkage (populated during export/archive, not normal operations)
        commit_ref: normalized.commit_ref,
        commit_signature: normalized.commit_signature,

        // Geography
        geography: normalized.geography_data
          ? { ...normalized.geography_data }
          : undefined,

        // Linked Records - normalize field name
        linkedRecords: normalized.linked_records || normalized.linkedRecords,

        // Linked Geography Files - normalize field name
        linkedGeographyFiles:
          normalized.linked_geography_files || normalized.linkedGeographyFiles,

        // Attached Files - normalize field name
        attachedFiles: normalized.attached_files || normalized.attachedFiles,

        // Metadata - store optional fields
        metadata: {
          ...(normalized.tags && { tags: normalized.tags }),
          ...(normalized.module && { module: normalized.module }),
          ...(normalized.slug && { slug: normalized.slug }),
          ...(normalized.version && { version: normalized.version }),
          ...(normalized.priority && { priority: normalized.priority }),
          ...(normalized.department && { department: normalized.department }),
          ...(normalized.category && { category: normalized.category }),
          ...(normalized.session_type && {
            session_type: normalized.session_type,
          }),
          ...(normalized.date && { date: normalized.date }),
          ...(normalized.duration && { duration: normalized.duration }),
          ...(normalized.location && { location: normalized.location }),
          ...(normalized.attendees && { attendees: normalized.attendees }),
          ...(normalized.topics && { topics: normalized.topics }),
          ...(normalized.media && { media: normalized.media }),
          // Include any other custom metadata fields
          ...Object.entries(normalized)
            .filter(
              ([key]) =>
                ![
                  'id',
                  'title',
                  'type',
                  'status',
                  'author',
                  'authors',
                  'created',
                  'updated',
                  'source',
                  'commit_ref',
                  'commit_signature',
                  'geography_data',
                  'linked_records',
                  'linkedRecords',
                  'linked_geography_files',
                  'linkedGeographyFiles',
                  'attached_files',
                  'attachedFiles',
                  'tags',
                  'module',
                  'slug',
                  'version',
                  'priority',
                  'department',
                  'category',
                  'session_type',
                  'date',
                  'duration',
                  'location',
                  'attendees',
                  'topics',
                  'media',
                ].includes(key)
            )
            .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {}),
        },
      };

      return record;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error parsing record';
      logger.error(
        `Failed to parse record${filePath ? ` from ${filePath}` : ''}: ${errorMessage}`
      );
      throw new Error(
        `Record parsing failed${filePath ? ` (${filePath})` : ''}: ${errorMessage}`
      );
    }
  }

  /**
   * Serialize RecordData to markdown with properly formatted frontmatter
   *
   * @param record - RecordData object to serialize
   * @returns Formatted markdown string with YAML frontmatter
   */
  static serializeToMarkdown(record: RecordData): string {
    const frontmatter = this.buildFrontmatter(record);
    // Generate YAML with ordered sections (no comment dividers)
    const yamlContent = this.generateOrderedYaml(frontmatter);

    // Return formatted markdown (ensure newline before closing ---)
    return `---
${yamlContent}
---

${record.content || ''}`;
  }

  /**
   * Build a frontmatter-compatible object from RecordData without serializing
   *
   * @param record - RecordData to convert
   * @returns Frontmatter data object ready for schema validation or serialization
   */
  static buildFrontmatter(record: RecordData): FrontmatterData {
    const frontmatter: any = {
      // Core Identification (Required)
      id: record.id,
      title: record.title,
      type: record.type,
      status: record.status, // Legal status - included in YAML
      // Note: workflowState is DB-only and never included in YAML frontmatter

      // Authorship (Required)
      author: record.author,
    };

    // Add authors array if present
    if (record.authors && record.authors.length > 0) {
      frontmatter.authors = record.authors;
    }

    // Timestamps - ensure strings (schema expects string values)
    const created = record.created_at || new Date().toISOString();
    const updated = record.updated_at || new Date().toISOString();
    frontmatter.created =
      typeof created === 'string' ? created : new Date(created).toISOString();
    frontmatter.updated =
      typeof updated === 'string' ? updated : new Date(updated).toISOString();

    // Source & Origin
    if (record.source) {
      const source = { ...record.source };
      if (source.imported_at !== undefined && source.imported_at !== null) {
        const importedAt = source.imported_at;
        source.imported_at =
          typeof importedAt === 'string'
            ? importedAt
            : new Date(importedAt as any).toISOString();
      }
      frontmatter.source = source;
    }

    // Commit Linkage (populated during export/archive, not normal operations)
    if (record.commit_ref) {
      frontmatter.commit_ref = record.commit_ref;
    }
    if (record.commit_signature) {
      frontmatter.commit_signature = record.commit_signature;
    }

    // Classification (from metadata)
    if (record.metadata) {
      if (record.metadata.tags) {
        frontmatter.tags = Array.isArray(record.metadata.tags)
          ? record.metadata.tags
          : [record.metadata.tags];
      }
      if (record.metadata.module) {
        frontmatter.module = record.metadata.module;
      }
      if (record.metadata.slug) {
        frontmatter.slug = record.metadata.slug;
      }
      if (record.metadata.version) {
        frontmatter.version = record.metadata.version;
      }
      if (record.metadata.priority) {
        frontmatter.priority = record.metadata.priority;
      }
      if (record.metadata.department) {
        frontmatter.department = record.metadata.department;
      }
      if (record.metadata.category) {
        frontmatter.category = record.metadata.category;
      }
      // Type-specific fields
      if (record.metadata.session_type) {
        frontmatter.session_type = record.metadata.session_type;
      }
      if (record.metadata.date) {
        frontmatter.date =
          typeof record.metadata.date === 'string'
            ? record.metadata.date
            : new Date(record.metadata.date as any).toISOString();
      }
      if (record.metadata.duration) {
        frontmatter.duration = record.metadata.duration;
      }
      if (record.metadata.location) {
        frontmatter.location = record.metadata.location;
      }
      if (record.metadata.attendees) {
        frontmatter.attendees = record.metadata.attendees;
      }
      if (record.metadata.topics) {
        frontmatter.topics = record.metadata.topics;
      }
      if (record.metadata.media) {
        frontmatter.media = record.metadata.media;
      }
    }

    // Geography
    if (record.geography) {
      frontmatter.geography_data = record.geography;
    }

    // Linked Records
    if (record.linkedRecords && record.linkedRecords.length > 0) {
      frontmatter.linked_records = record.linkedRecords;
    }

    // Linked Geography Files
    if (record.linkedGeographyFiles && record.linkedGeographyFiles.length > 0) {
      frontmatter.linked_geography_files = record.linkedGeographyFiles;
    }

    // Attached Files
    if (record.attachedFiles && record.attachedFiles.length > 0) {
      frontmatter.attached_files = record.attachedFiles;
    }

    // Carry over any additional metadata passthrough fields
    if (record.metadata) {
      const {
        tags,
        module,
        slug,
        version,
        priority,
        department,
        category,
        session_type,
        date,
        duration,
        location,
        attendees,
        topics,
        media,
        ...rest
      } = record.metadata;

      if (Object.keys(rest).length > 0) {
        frontmatter.metadata = {
          ...(frontmatter.metadata || {}),
          ...rest,
        };
      }
    }

    return frontmatter;
  }

  /**
   * Normalize old format frontmatter to new format
   * Handles backward compatibility during transition
   *
   * @param frontmatter - Raw frontmatter object (may be old format)
   * @returns Normalized frontmatter in new format
   */
  private static normalizeFormat(frontmatter: any): FrontmatterData {
    const normalized: any = { ...frontmatter };

    // Normalize author field - ensure it's a string
    if (!normalized.author) {
      // Try to extract from authors array
      if (normalized.authors && Array.isArray(normalized.authors)) {
        const firstAuthor = normalized.authors[0];
        if (typeof firstAuthor === 'string') {
          normalized.author = firstAuthor;
        } else if (firstAuthor?.username) {
          normalized.author = firstAuthor.username;
        } else if (firstAuthor?.name) {
          normalized.author = firstAuthor.name
            .toLowerCase()
            .replace(/\s+/g, '.');
        }
      }
      // Fallback to 'unknown' if nothing found
      if (!normalized.author) {
        normalized.author = 'unknown';
      }
    }

    // Normalize timestamps - handle both formats
    if (!normalized.created && normalized.created_at) {
      normalized.created = normalized.created_at;
    }
    if (!normalized.updated && normalized.updated_at) {
      normalized.updated = normalized.updated_at;
    }

    // Convert Date objects to ISO strings (gray-matter parses ISO dates as Date objects)
    if (normalized.created instanceof Date) {
      normalized.created = normalized.created.toISOString();
    }
    if (normalized.updated instanceof Date) {
      normalized.updated = normalized.updated.toISOString();
    }

    // Normalize field names (old format uses camelCase, new uses snake_case for some)
    if (normalized.linkedRecords && !normalized.linked_records) {
      normalized.linked_records = normalized.linkedRecords;
    }
    if (normalized.linkedGeographyFiles && !normalized.linked_geography_files) {
      normalized.linked_geography_files = normalized.linkedGeographyFiles;
    }
    if (normalized.attachedFiles && !normalized.attached_files) {
      normalized.attached_files = normalized.attachedFiles;
    }

    // Normalize geography field name
    if (normalized.geography && !normalized.geography_data) {
      normalized.geography_data = normalized.geography;
    }

    return this.normalizeDateValues(normalized);
  }

  private static normalizeDateValues(value: any): any {
    if (value === null || value === undefined) {
      return value;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.normalizeDateValues(item));
    }

    if (typeof value === 'object') {
      const result: Record<string, any> = {};
      for (const [key, nestedValue] of Object.entries(value)) {
        result[key] = this.normalizeDateValues(nestedValue);
      }
      return result;
    }

    return value;
  }

  /**
   * Validate that required fields are present
   *
   * @param frontmatter - Frontmatter object to validate
   * @param filePath - Optional file path for error messages
   * @throws Error if required fields are missing
   */
  private static validateRequiredFields(
    frontmatter: any,
    filePath?: string
  ): void {
    const required = [
      'id',
      'title',
      'type',
      'status',
      'author',
      'created',
      'updated',
    ];
    const missing: string[] = [];

    for (const field of required) {
      if (!frontmatter[field] || frontmatter[field] === '') {
        missing.push(field);
      }
    }

    if (missing.length > 0) {
      const errorMsg = `Missing required fields${filePath ? ` in ${filePath}` : ''}: ${missing.join(', ')}`;
      logger.error(errorMsg);
      throw new RecordValidationError(errorMsg, {
        filePath,
        missingFields: missing,
      });
    }
  }

  /**
   * Generate YAML content with ordered sections (without comment dividers)
   *
   * @param frontmatter - Frontmatter data to serialize
   * @returns Formatted YAML string grouped by logical sections
   */
  private static generateOrderedYaml(frontmatter: FrontmatterData): string {
    // Define field order with section headers
    const sections: Array<{ header: string; fields: string[] }> = [
      {
        header: 'CORE IDENTIFICATION (Required)',
        fields: ['id', 'title', 'type', 'status'],
      },
      {
        header: 'AUTHORSHIP & ATTRIBUTION (Required)',
        fields: ['author', 'authors'],
      },
      {
        header: 'TIMESTAMPS (Required)',
        fields: ['created', 'updated'],
      },
      {
        header: 'CLASSIFICATION (Optional but recommended)',
        fields: ['tags', 'module', 'slug', 'version', 'priority', 'department'],
      },
      {
        header: 'SOURCE & ORIGIN (Optional - for imported/legacy documents)',
        fields: ['source'],
      },
      {
        header: 'COMMIT LINKAGE (Optional - populated during export/archive)',
        fields: ['commit_ref', 'commit_signature'],
      },
      {
        header: 'TYPE-SPECIFIC FIELDS (Optional)',
        fields: [
          'geography_data',
          'category',
          'session_type',
          'date',
          'duration',
          'location',
          'attendees',
          'topics',
          'media',
        ],
      },
      {
        header: 'RELATIONSHIPS (Optional)',
        fields: ['linked_records', 'linked_geography_files'],
      },
      {
        header: 'FILE ATTACHMENTS (Optional)',
        fields: ['attached_files'],
      },
    ];

    const lines: string[] = [];
    const processedFields = new Set<string>();

    // Process each section
    let isFirstSection = true;
    for (const section of sections) {
      // Check if section has any fields to output
      const hasFields = section.fields.some(
        (field) =>
          frontmatter[field] !== undefined && frontmatter[field] !== null
      );

      if (hasFields) {
        const sectionLines: string[] = [];
        for (const field of section.fields) {
          if (frontmatter[field] !== undefined && frontmatter[field] !== null) {
            processedFields.add(field);
            const value = frontmatter[field];
            sectionLines.push(this.formatYamlField(field, value));
          }
        }

        if (sectionLines.length > 0) {
          if (
            !isFirstSection &&
            lines.length > 0 &&
            lines[lines.length - 1] !== ''
          ) {
            lines.push('');
          }
          lines.push(...sectionLines);
          lines.push('');
          isFirstSection = false;
        }
      }
    }

    // Output any remaining fields that weren't in our sections
    const remainingFields = Object.keys(frontmatter).filter(
      (key) => !processedFields.has(key) && frontmatter[key] !== undefined
    );

    if (remainingFields.length > 0) {
      if (
        !isFirstSection &&
        lines.length > 0 &&
        lines[lines.length - 1] !== ''
      ) {
        lines.push('');
      }

      for (const field of remainingFields) {
        const value = frontmatter[field];
        lines.push(this.formatYamlField(field, value));
      }
    }

    // Remove trailing empty lines, but ensure we end with a newline
    while (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop();
    }

    // Join lines and ensure trailing newline for proper YAML frontmatter closing
    return lines.join('\n') + '\n';
  }

  /**
   * Format a single YAML field with proper quoting and formatting
   *
   * @param key - Field name
   * @param value - Field value
   * @returns Formatted YAML line
   */
  private static formatYamlField(key: string, value: any): string {
    // Use YAML library to properly format the value
    // This handles arrays, objects, strings, numbers, booleans correctly
    try {
      const yamlDoc = stringify(
        { [key]: value },
        {
          indent: 2,
          lineWidth: 0,
        }
      );

      // Extract just the key-value line(s) from the YAML output
      const lines = yamlDoc
        .split('\n')
        .filter((line: string) => line.trim() !== '');

      if (lines.length === 0) {
        // Fallback for empty values
        return `${key}: null`;
      }

      if (lines.length === 1) {
        // Simple single-line value
        const colonIndex = lines[0].indexOf(':');
        if (colonIndex > 0) {
          // Extract the value part
          const valuePart = lines[0].substring(colonIndex + 1).trim();
          return `${key}: ${valuePart}`;
        }
        return `${key}: ${lines[0]}`;
      } else {
        // Multi-line value (object or array)
        // First line has the key, subsequent lines are indented
        const valueLines = lines.map((line: string, index: number) => {
          if (index === 0) {
            // First line: replace the key with our key
            const colonIndex = line.indexOf(':');
            if (colonIndex > 0) {
              return `${key}:${line.substring(colonIndex + 1)}`;
            }
            return `${key}: ${line}`;
          } else {
            // Subsequent lines: keep as is (already indented)
            return line;
          }
        });
        return valueLines.join('\n');
      }
    } catch (error) {
      // Fallback to simple string representation if YAML formatting fails
      logger.warn(
        `Failed to format YAML field ${key}, using fallback: ${error}`
      );
      return `${key}: ${JSON.stringify(value)}`;
    }
  }
}
