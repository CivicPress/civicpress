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

import { ConflictError, ValidationError } from '../errors/index.js';
import {
  DocumentNumberGenerator,
  type DocumentNumberReserver,
} from '../utils/document-number-generator.js';

/**
 * Record types that carry an official document number.
 *
 * Kept exactly as the two copies of this list had it. Note what it means: a
 * municipality that configures `document_number_formats` for some OTHER type
 * gets no numbers for it, because membership here — not the presence of a
 * configured format — is what triggers numbering. Arguably wrong, but it is
 * long-standing behaviour and changing which types get numbered is a decision
 * about a legal register, not a refactor; see the backlog entry.
 */
export const LEGAL_RECORD_TYPES: readonly string[] = [
  'bylaw',
  'ordinance',
  'policy',
  'proclamation',
  'resolution',
];

export function isLegalRecordType(recordType: string): boolean {
  return LEGAL_RECORD_TYPES.includes(recordType);
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
    // Only legal types have a format to be judged against — `getFormat` would
    // answer 'DOC' for anything else, and rejecting a locally-meaningful
    // identifier on a non-legal record is not this function's business.
    if (!isLegalRecordType(recordType)) {
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

  if (!isLegalRecordType(recordType)) {
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
