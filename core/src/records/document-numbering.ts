/**
 * Legal document numbering — the one place that decides whether a record gets
 * an official number, and which one.
 *
 * This exists because the rule was written out three times and reached two
 * places. `RecordManager.createRecord` and `create-record-saga` each carried
 * their own copy of the legal-type list and the generate-if-absent block;
 * `RecordManager.createRecordWithId` — the method the draft → publish saga
 * uses, which is the PRIMARY editor path — carried neither, so records created
 * the way the editor creates them landed with no `document_number` at all:
 * permanently unnumbered, and invisible to `getDocumentNumbers()` and so to
 * the sequence of every record numbered after them.
 *
 * Three rules, in one function, so a fourth create path cannot quietly miss
 * one of them:
 *
 *  1. A legal record with no number gets the next one for its type and year.
 *  2. A caller-supplied number is checked, not trusted — right shape for the
 *     type, and not already in circulation.
 *  3. Whichever way the number is arrived at, it is RESERVED before it is
 *     handed back, so concurrent creates cannot be issued the same one.
 *
 * @module records/document-numbering
 */

import { CentralConfigManager } from '../config/central-config.js';
import { ConflictError, ValidationError } from '../errors/index.js';
import {
  DocumentNumberGenerator,
  type DocumentNumberReserver,
} from '../utils/document-number-generator.js';

/**
 * Record types that carry an official document number by default, with no
 * configuration at all.
 */
export const LEGAL_RECORD_TYPES: readonly string[] = [
  'bylaw',
  'ordinance',
  'policy',
  'proclamation',
  'resolution',
];

/**
 * Does this type get an official document number?
 *
 * The built-in legal types, OR any type the instance has given a
 * `document_number_formats` entry. Configuring a format used to be a silent
 * no-op — membership in the hard-coded list was the only trigger, so an
 * instance could define a perfectly good format for `meeting` or `permit` and
 * never see a single number issued, with nothing anywhere saying why. Writing
 * the format down is now the way you ask for numbering.
 *
 * ⚠️ This is a behaviour change for any instance that already configures a
 * format for a non-legal type: those records begin receiving numbers at their
 * next create. Records already stored are untouched — nothing backfills — so
 * such a type starts its sequence at 001 from the day of the upgrade.
 */
export function isNumberedRecordType(recordType: string): boolean {
  if (LEGAL_RECORD_TYPES.includes(recordType)) return true;

  return hasUsablePrefix(configuredFormat(recordType));
}

/**
 * The configured format entry for a type, or undefined.
 *
 * Config access is deliberately non-fatal here, matching
 * `DocumentNumberGenerator.getFormat`: an unreadable or malformed config
 * should leave the built-in types numbering exactly as they always did, not
 * fail every record creation on the instance.
 */
function configuredFormat(recordType: string): unknown {
  try {
    return CentralConfigManager.getDocumentNumberFormats()?.[recordType];
  } catch {
    return undefined;
  }
}

/**
 * A format entry only counts if it can actually produce a number. `getFormat`
 * copies `prefix` straight through, so an entry missing one would mint
 * `undefined-2026-001` — a citable identity built from a typo. Better to leave
 * the type unnumbered and let config validation report the entry.
 */
function hasUsablePrefix(format: unknown): boolean {
  if (!format || typeof format !== 'object') return false;

  const prefix = (format as { prefix?: unknown }).prefix;
  return typeof prefix === 'string' && prefix.trim().length > 0;
}

export interface ResolveDocumentNumberParams {
  /** Id the number is being reserved for. */
  recordId: string;
  recordType: string;
  /** Number the caller supplied in `metadata.document_number`, if any. */
  supplied?: unknown;
  /** The record's creation timestamp, which decides the numbering year. */
  createdAt?: string;
  /** Used when `createdAt` is absent or unparseable. */
  fallbackDate?: Date;
  db?: DocumentNumberReserver;
  /**
   * Adopt `supplied` verbatim: no assignment, no validation, no reservation.
   * For the index-sync path, which is not creating records but re-reading ones
   * that already exist on disk — where the number in the frontmatter is the
   * fact, and rejecting it would fail the sync of a corpus that predates any
   * of these rules.
   */
  skip?: boolean;
}

/**
 * The `document_number` a record should be created with, or undefined.
 */
export async function resolveDocumentNumber(
  params: ResolveDocumentNumberParams
): Promise<string | undefined> {
  const { recordId, recordType, supplied, db, skip } = params;
  const suppliedNumber = typeof supplied === 'string' ? supplied.trim() : '';

  if (skip) {
    return suppliedNumber || undefined;
  }

  const year = numberingYear(params);

  if (suppliedNumber) {
    // Only a numbered type has a format to be judged against — `getFormat`
    // would answer 'DOC' for anything else, and rejecting a
    // locally-meaningful identifier on an unnumbered record is not this
    // function's business.
    if (!isNumberedRecordType(recordType)) {
      return suppliedNumber;
    }

    if (!DocumentNumberGenerator.matchesFormat(suppliedNumber, recordType)) {
      throw new ValidationError(
        `'${suppliedNumber}' is not a valid document number for a ${recordType}. ` +
          `Expected the configured format, e.g. ${DocumentNumberGenerator.generate(recordType, year, 1)}.`,
        { document_number: suppliedNumber, recordType }
      );
    }

    if (!db) {
      // Nothing to check uniqueness against; the format check is all that can
      // be honoured here.
      return suppliedNumber;
    }

    const claimYear =
      DocumentNumberGenerator.parse(suppliedNumber)?.year ?? year;
    const won = await DocumentNumberGenerator.claim(
      suppliedNumber,
      recordType,
      claimYear,
      recordId,
      db
    );
    if (!won) {
      throw new ConflictError(
        `Document number '${suppliedNumber}' is already assigned to another ${recordType}.`,
        suppliedNumber
      );
    }

    return suppliedNumber;
  }

  if (!isNumberedRecordType(recordType)) {
    return undefined;
  }

  if (!db) {
    // Preserves the pre-existing no-database behaviour: still numbered, from
    // the first sequence, rather than left unnumbered.
    return DocumentNumberGenerator.generate(recordType, year, 1);
  }

  return DocumentNumberGenerator.assign(recordType, year, recordId, db);
}

/**
 * Numbering year: the record's creation year where that is knowable, since a
 * record backdated to last year belongs in last year's sequence.
 */
function numberingYear(params: ResolveDocumentNumberParams): number {
  const { createdAt, fallbackDate } = params;
  const candidate = createdAt ? new Date(createdAt) : fallbackDate;

  if (!candidate || Number.isNaN(candidate.getTime())) {
    return new Date().getFullYear();
  }

  return candidate.getFullYear();
}
