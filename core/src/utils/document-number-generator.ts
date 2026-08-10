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
 * The database surface numbering needs: what has been issued, and the atomic
 * claim. Narrow on purpose — it is satisfied by `DatabaseService` and by a
 * hand-rolled fake in tests, so the numbering rules stay testable without a
 * database while the uniqueness guarantee stays in the one place that can
 * actually enforce it.
 */
export interface DocumentNumberReserver {
  getDocumentNumbers(recordType: string): Promise<string[]>;
  getReservedDocumentNumbers(recordType: string): Promise<string[]>;
  reserveDocumentNumber(
    documentNumber: string,
    recordType: string,
    year: number,
    recordId: string
  ): Promise<boolean>;
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
      logger.warn(
        'Failed to load document number format from config, using default',
        error
      );
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
    const yearStr =
      format.yearFormat === 'short'
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
   * @param recordType - Optional record type to check the format against
   * @returns True if valid, false otherwise
   *
   * With a record type this asks the only question worth asking — "is this a
   * number THIS type's configured format would have produced?" — rather than
   * the older "does `parse()` recognise it and does its prefix equal the
   * BUILT-IN default?". That comparison used `getDefaultPrefix`, so on any
   * instance that configures `document_number_formats` the validator rejected
   * precisely the numbers the generator itself emits. Same class of bug as the
   * one `matchSequence` was written to fix, in the sibling function.
   */
  static validate(documentNumber: string, recordType?: string): boolean {
    if (recordType) {
      return this.matchesFormat(documentNumber, recordType);
    }
    return this.parse(documentNumber) !== null;
  }

  /**
   * Is `documentNumber` shaped like one this type's configured format emits,
   * for any year? Used to vet a caller-supplied number before it is stored.
   */
  static matchesFormat(documentNumber: string, recordType: string): boolean {
    const format = this.getFormat(recordType);
    const yearPattern = format.yearFormat === 'short' ? '\\d{2}' : '\\d{4}';
    return this.buildPattern(format, yearPattern).test(documentNumber);
  }

  /**
   * Reserve and return the next document number for a type/year.
   *
   * The sequence is computed and then CLAIMED, and a lost claim is retried
   * rather than trusted — which is the whole difference from the old
   * read-then-write. Two concurrent creates of the same type and year both
   * compute the same next sequence; the database lets exactly one of them
   * insert it, and the other comes back around, recomputes against a set that
   * now includes the winner, and takes the number after it.
   *
   * The retry bound exists so a pathological loop (a reserver that always
   * returns false) fails loudly instead of spinning forever.
   */
  static async assign(
    recordType: string,
    year: number,
    recordId: string,
    db: DocumentNumberReserver,
    maxAttempts = 25
  ): Promise<string> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const issued = await this.issuedNumbers(recordType, db);
      const sequence = this.nextSequenceFrom(issued, recordType, year);
      const candidate = this.generate(recordType, year, sequence);

      const won = await db.reserveDocumentNumber(
        candidate,
        recordType,
        year,
        recordId
      );
      if (won) return candidate;
    }

    throw new Error(
      `Could not reserve a document number for '${recordType}' ${year} after ${maxAttempts} attempts`
    );
  }

  /**
   * Claim a caller-supplied number for this record. False if it is taken.
   *
   * Two sources of "taken", and they need different treatment. A number
   * already written into some record's metadata is spoken for outright: this
   * runs on CREATE paths, where the record being numbered does not exist yet,
   * so the holder is necessarily somebody else — including on a database that
   * predates the reservation table and has no rows in it at all. A number
   * merely RESERVED is settled by the insert itself, which answers true only
   * for the winner or for a re-run by the same record id.
   */
  static async claim(
    documentNumber: string,
    recordType: string,
    year: number,
    recordId: string,
    db: DocumentNumberReserver
  ): Promise<boolean> {
    const stored = await db.getDocumentNumbers(recordType);
    if (stored.includes(documentNumber)) {
      return false;
    }

    return db.reserveDocumentNumber(documentNumber, recordType, year, recordId);
  }

  /**
   * Every number this type has already put into circulation — written into a
   * record's metadata, or reserved and not yet written.
   */
  private static async issuedNumbers(
    recordType: string,
    db: DocumentNumberReserver
  ): Promise<string[]> {
    const [stored, reserved] = await Promise.all([
      db.getDocumentNumbers(recordType),
      db.getReservedDocumentNumbers(recordType),
    ]);
    return [...stored, ...reserved];
  }

  /**
   * The next sequence number given the numbers already issued.
   *
   * Pure: the caller supplies the existing document numbers, so the parsing
   * rule is testable without a database. Only numbers whose prefix matches
   * this type's configured prefix AND whose year matches are considered —
   * sequences restart each year, and two types can share a year without
   * colliding.
   */
  static nextSequenceFrom(
    existingNumbers: readonly string[],
    recordType: string,
    year?: number
  ): number {
    const targetYear = year || new Date().getFullYear();
    const format = this.getFormat(recordType);

    let highest = 0;
    for (const documentNumber of existingNumbers) {
      const sequence = this.matchSequence(documentNumber, format, targetYear);
      if (sequence !== null && sequence > highest) highest = sequence;
    }

    return highest + 1;
  }

  /**
   * The sequence in `documentNumber` if it is one THIS format would have
   * produced for `targetYear`, else null.
   *
   * Matching is built from the record type's own configured format rather than
   * the loose `parse()` regex. `parse()` only recognises `[A-Z]+` prefixes and
   * `-` or `/` separators, so any other configured `document_number_formats`
   * entry — a prefix containing a digit (`BY2`), a lowercase prefix, or a
   * separator like `.` or `_` — matched nothing, every lookup came back empty,
   * and the sequence silently restarted at 1 for every record: exactly the
   * duplicate-numbering bug this was meant to fix, just narrowed to
   * non-default configs.
   *
   * Comparing the year in the SAME representation `generate()` emits also makes
   * the `short` format round-trip for any century — `parse()` hard-codes a
   * 2-digit year to `2000 + n`, so a backfilled `BYL-98-001` was read as 2098
   * and never matched a 1998 target.
   */
  private static matchSequence(
    documentNumber: string,
    format: DocumentNumberFormat,
    targetYear: number
  ): number | null {
    const yearStr =
      format.yearFormat === 'short'
        ? String(targetYear).slice(-2)
        : String(targetYear);

    const match = documentNumber.match(
      this.buildPattern(format, this.escapeRegex(yearStr))
    );
    if (!match) return null;

    const sequence = parseInt(match[1], 10);
    return Number.isFinite(sequence) ? sequence : null;
  }

  /**
   * `<prefix><sep><yearPattern><sep>(<sequence>)`, anchored — the shape
   * `generate()` emits, with the year left as a caller-supplied sub-pattern so
   * one builder serves both "this exact year" (sequence lookup) and "any year"
   * (format validation).
   */
  private static buildPattern(
    format: DocumentNumberFormat,
    yearPattern: string
  ): RegExp {
    const separator = this.escapeRegex(format.separator || '-');
    const prefix = this.escapeRegex(format.prefix);
    return new RegExp(
      `^${prefix}${separator}${yearPattern}${separator}(\\d+)$`
    );
  }

  private static escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Next sequence number for a record type and year, from what the database
   * has already issued.
   *
   * This used to be a stub that logged a warning and returned `1` — so EVERY
   * bylaw/ordinance/policy/proclamation/resolution was created as
   * `<PREFIX>-<YEAR>-001`. For legal registers, where the document number is
   * the citable identity of the record, that meant silent duplicates.
   *
   * `db` is optional so existing direct callers keep working; without it there
   * is nothing to count against and the answer is the first sequence.
   */
  static async getNextSequence(
    recordType: string,
    year?: number,
    db?: { getDocumentNumbers(recordType: string): Promise<string[]> }
  ): Promise<number> {
    if (!db) {
      return 1;
    }

    try {
      const existing = await db.getDocumentNumbers(recordType);
      return this.nextSequenceFrom(existing, recordType, year);
    } catch (error) {
      // A numbering lookup must not block record creation; fall back to the
      // first sequence and make the reason visible rather than silent.
      logger.warn(
        `Could not read existing document numbers for '${recordType}'; defaulting to sequence 1`,
        error
      );
      return 1;
    }
  }
}
