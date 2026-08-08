import { describe, it, expect, vi } from 'vitest';
import { DocumentNumberGenerator } from '../document-number-generator.js';

/**
 * getNextSequence was a stub that logged a warning and returned 1, so every
 * bylaw/ordinance/policy/proclamation/resolution was created as
 * `<PREFIX>-<YEAR>-001`. In a legal register the document number IS the
 * citable identity of the record, so that produced silent duplicates.
 */
describe('DocumentNumberGenerator.nextSequenceFrom', () => {
  it('starts at 1 when nothing has been issued', () => {
    expect(DocumentNumberFor([], 'bylaw', 2026)).toBe(1);
  });

  it('continues from the highest issued sequence', () => {
    expect(
      DocumentNumberFor(
        ['BYL-2026-001', 'BYL-2026-002', 'BYL-2026-003'],
        'bylaw',
        2026
      )
    ).toBe(4);
  });

  it('uses the highest, not the count — gaps do not cause reuse', () => {
    // A deleted BYL-2026-002 must not make the next record reuse 003.
    expect(
      DocumentNumberFor(['BYL-2026-001', 'BYL-2026-003'], 'bylaw', 2026)
    ).toBe(4);
  });

  it('is unordered-input safe', () => {
    expect(
      DocumentNumberFor(['BYL-2026-007', 'BYL-2026-002'], 'bylaw', 2026)
    ).toBe(8);
  });

  it('restarts numbering each year', () => {
    const issued = ['BYL-2025-001', 'BYL-2025-002', 'BYL-2025-003'];
    expect(DocumentNumberFor(issued, 'bylaw', 2026)).toBe(1);
    expect(DocumentNumberFor(issued, 'bylaw', 2025)).toBe(4);
  });

  it('does not let one record type consume another type-s sequence', () => {
    const issued = ['ORD-2026-001', 'ORD-2026-002'];
    expect(DocumentNumberFor(issued, 'bylaw', 2026)).toBe(1);
    expect(DocumentNumberFor(issued, 'ordinance', 2026)).toBe(3);
  });

  it('ignores unparseable numbers rather than throwing', () => {
    expect(
      DocumentNumberFor(['not-a-number', '', 'BYL-2026-002'], 'bylaw', 2026)
    ).toBe(3);
  });

  it('treats a 2-digit year as 20XX, matching parse()', () => {
    expect(DocumentNumberFor(['BYL-26-004'], 'bylaw', 2026)).toBe(5);
  });
});

describe('DocumentNumberGenerator.getNextSequence', () => {
  it('reads issued numbers from the database', async () => {
    const db = {
      getDocumentNumbers: vi.fn(async () => ['BYL-2026-001', 'BYL-2026-002']),
    };

    await expect(
      DocumentNumberGenerator.getNextSequence('bylaw', 2026, db)
    ).resolves.toBe(3);
    expect(db.getDocumentNumbers).toHaveBeenCalledWith('bylaw');
  });

  it('produces a non-colliding number end to end', async () => {
    const issued = ['BYL-2026-001'];
    const db = { getDocumentNumbers: async () => issued };

    const sequence = await DocumentNumberGenerator.getNextSequence(
      'bylaw',
      2026,
      db
    );

    const generated = DocumentNumberGenerator.generate('bylaw', 2026, sequence);
    expect(generated).toBe('BYL-2026-002');
    expect(issued).not.toContain(generated);
  });

  it('falls back to 1 when no database is supplied', async () => {
    await expect(
      DocumentNumberGenerator.getNextSequence('bylaw', 2026)
    ).resolves.toBe(1);
  });

  it('does not block record creation when the lookup fails', async () => {
    const db = {
      getDocumentNumbers: async () => {
        throw new Error('db down');
      },
    };

    await expect(
      DocumentNumberGenerator.getNextSequence('bylaw', 2026, db)
    ).resolves.toBe(1);
  });
});

/** Thin alias so the assertions above read as the rule they encode. */
function DocumentNumberFor(
  issued: string[],
  recordType: string,
  year: number
): number {
  return DocumentNumberGenerator.nextSequenceFrom(issued, recordType, year);
}
