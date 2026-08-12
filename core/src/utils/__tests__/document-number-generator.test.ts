import { describe, it, expect, vi, afterEach } from 'vitest';
import { DocumentNumberGenerator } from '../document-number-generator.js';
import { CentralConfigManager } from '../../config/central-config.js';

afterEach(() => vi.restoreAllMocks());

/**
 * getNextSequence was a stub that logged a warning and returned 1, so every
 * legal-type record created through its two call sites came out as
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

  it('ignores a number the configured format would never have produced', () => {
    // Default format is year_format: 'full', so `BYL-26-004` is a foreign /
    // legacy shape, not this register's 2026 numbering. It must not be counted
    // (and cannot collide: this format emits `BYL-2026-…`). The permissive
    // regex in parse() used to read the `26` as 2026 and count it.
    expect(DocumentNumberFor(['BYL-26-004'], 'bylaw', 2026)).toBe(1);
    // A number this format DID produce is still counted.
    expect(DocumentNumberFor(['BYL-2026-004'], 'bylaw', 2026)).toBe(5);
  });

  /**
   * Matching used to go through parse(), whose regex only accepts `[A-Z]+`
   * prefixes and `-`/`/` separators. Every other configured
   * `document_number_formats` entry matched nothing, so the lookup came back
   * empty and the sequence restarted at 1 on every record — the duplicate bug,
   * narrowed to non-default configs. Matching is now built from the type's own
   * format, so whatever generate() emits is what gets recognised.
   */
  describe('configured formats round-trip (generate -> match)', () => {
    const CASES = [
      {
        label: 'default',
        format: {
          prefix: 'BYL',
          year_format: 'full',
          separator: '-',
          sequence_padding: 3,
        },
      },
      {
        label: 'digit in prefix',
        format: {
          prefix: 'BY2',
          year_format: 'full',
          separator: '-',
          sequence_padding: 3,
        },
      },
      {
        label: 'dot separator',
        format: {
          prefix: 'BYL',
          year_format: 'full',
          separator: '.',
          sequence_padding: 3,
        },
      },
      {
        label: 'slash separator',
        format: {
          prefix: 'BYL',
          year_format: 'full',
          separator: '/',
          sequence_padding: 3,
        },
      },
      {
        label: 'underscore separator',
        format: {
          prefix: 'BYL',
          year_format: 'full',
          separator: '_',
          sequence_padding: 4,
        },
      },
      {
        label: 'short year',
        format: {
          prefix: 'BYL',
          year_format: 'short',
          separator: '-',
          sequence_padding: 3,
        },
      },
    ];

    for (const { label, format } of CASES) {
      it(`continues the sequence for a ${label} format`, () => {
        vi.spyOn(
          CentralConfigManager,
          'getDocumentNumberFormats'
        ).mockReturnValue({ bylaw: format } as any);

        const first = DocumentNumberGenerator.generate('bylaw', 2026, 1);
        const second = DocumentNumberGenerator.generate('bylaw', 2026, 2);

        // The numbers this very format produced must be recognised by it.
        expect(
          DocumentNumberGenerator.nextSequenceFrom(
            [first, second],
            'bylaw',
            2026
          )
        ).toBe(3);

        // ...and a different year must not be counted.
        expect(
          DocumentNumberGenerator.nextSequenceFrom(
            [first, second],
            'bylaw',
            2027
          )
        ).toBe(1);
      });
    }

    it('round-trips a short year outside the 2000s (backfilled history)', () => {
      vi.spyOn(
        CentralConfigManager,
        'getDocumentNumberFormats'
      ).mockReturnValue({
        bylaw: {
          prefix: 'BYL',
          year_format: 'short',
          separator: '-',
          sequence_padding: 3,
        },
      } as any);

      // parse() reads a 2-digit year as 2000+n, so BYL-98-001 was seen as 2098
      // and never matched a 1998 target — every 1998 bylaw got sequence 1.
      const issued = DocumentNumberGenerator.generate('bylaw', 1998, 1);
      expect(issued).toBe('BYL-98-001');
      expect(
        DocumentNumberGenerator.nextSequenceFrom([issued], 'bylaw', 1998)
      ).toBe(2);
    });

    it('does not match another type-s prefix under a custom format', () => {
      vi.spyOn(
        CentralConfigManager,
        'getDocumentNumberFormats'
      ).mockReturnValue({
        bylaw: {
          prefix: 'BY2',
          year_format: 'full',
          separator: '.',
          sequence_padding: 3,
        },
        ordinance: {
          prefix: 'OR2',
          year_format: 'full',
          separator: '.',
          sequence_padding: 3,
        },
      } as any);

      const ordinanceNumber = DocumentNumberGenerator.generate(
        'ordinance',
        2026,
        7
      );
      expect(
        DocumentNumberGenerator.nextSequenceFrom(
          [ordinanceNumber],
          'bylaw',
          2026
        )
      ).toBe(1);
      expect(
        DocumentNumberGenerator.nextSequenceFrom(
          [ordinanceNumber],
          'ordinance',
          2026
        )
      ).toBe(8);
    });
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
