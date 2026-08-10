import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveDocumentNumber } from '../document-numbering.js';
import { CentralConfigManager } from '../../config/central-config.js';
import type { DocumentNumberReserver } from '../../utils/document-number-generator.js';
import { ConflictError, ValidationError } from '../../errors/index.js';

afterEach(() => vi.restoreAllMocks());

/**
 * The rules, without a database. Uniqueness under concurrency is enforced by
 * the reservation table's PRIMARY KEY and is pinned against real SQLite in
 * `database/__tests__/document-numbers.test.ts` — what is checked here is the
 * decision layer: who gets numbered, what a supplied number has to satisfy,
 * and which paths are exempt.
 */

/** In-memory stand-in for the store, with the same win-once semantics. */
function fakeReserver(
  storedNumbers: string[] = []
): DocumentNumberReserver & { reserved: Map<string, string> } {
  const reserved = new Map<string, string>();

  return {
    reserved,
    async getDocumentNumbers() {
      return [...storedNumbers];
    },
    async getReservedDocumentNumbers() {
      return [...reserved.keys()];
    },
    async reserveDocumentNumber(documentNumber, _type, _year, recordId) {
      const holder = reserved.get(documentNumber);
      if (holder !== undefined) return holder === recordId;
      reserved.set(documentNumber, recordId);
      return true;
    },
  };
}

describe('resolveDocumentNumber — assignment', () => {
  it('numbers a legal record that arrives without one', async () => {
    const number = await resolveDocumentNumber({
      recordId: 'r1',
      recordType: 'bylaw',
      createdAt: '2026-03-04T00:00:00.000Z',
      db: fakeReserver(),
    });

    expect(number).toBe('BYL-2026-001');
  });

  it('leaves a non-legal record unnumbered', async () => {
    const number = await resolveDocumentNumber({
      recordId: 'r1',
      recordType: 'meeting',
      createdAt: '2026-03-04T00:00:00.000Z',
      db: fakeReserver(),
    });

    expect(number).toBeUndefined();
  });

  it('numbers into the record’s own year, not today’s', async () => {
    // A record backdated to 2024 belongs in the 2024 sequence.
    const number = await resolveDocumentNumber({
      recordId: 'r1',
      recordType: 'bylaw',
      createdAt: '2024-11-02T00:00:00.000Z',
      db: fakeReserver(['BYL-2026-001', 'BYL-2026-002']),
    });

    expect(number).toBe('BYL-2024-001');
  });

  it('falls back to the fallback date, then to now', async () => {
    const fromFallback = await resolveDocumentNumber({
      recordId: 'r1',
      recordType: 'bylaw',
      fallbackDate: new Date('2023-06-01T00:00:00.000Z'),
      db: fakeReserver(),
    });
    expect(fromFallback).toBe('BYL-2023-001');

    const fromNow = await resolveDocumentNumber({
      recordId: 'r2',
      recordType: 'bylaw',
      createdAt: 'not-a-date',
      db: fakeReserver(),
    });
    expect(fromNow).toBe(`BYL-${new Date().getFullYear()}-001`);
  });

  it('continues the sequence past what is already issued', async () => {
    const number = await resolveDocumentNumber({
      recordId: 'r1',
      recordType: 'bylaw',
      createdAt: '2026-03-04T00:00:00.000Z',
      db: fakeReserver(['BYL-2026-001', 'BYL-2026-002']),
    });

    expect(number).toBe('BYL-2026-003');
  });

  it('reserves what it assigns, so the next caller cannot repeat it', async () => {
    const db = fakeReserver();

    const first = await resolveDocumentNumber({
      recordId: 'r1',
      recordType: 'bylaw',
      createdAt: '2026-03-04T00:00:00.000Z',
      db,
    });
    const second = await resolveDocumentNumber({
      recordId: 'r2',
      recordType: 'bylaw',
      createdAt: '2026-03-04T00:00:00.000Z',
      db,
    });

    // Note that NOTHING has been written to a record yet — the fake's stored
    // numbers are still empty. Only the reservation separates these two.
    expect([first, second]).toEqual(['BYL-2026-001', 'BYL-2026-002']);
  });

  it('still numbers with no database, as it did before', async () => {
    const number = await resolveDocumentNumber({
      recordId: 'r1',
      recordType: 'bylaw',
      createdAt: '2026-03-04T00:00:00.000Z',
    });

    expect(number).toBe('BYL-2026-001');
  });
});

describe('resolveDocumentNumber — a supplied number is checked, not trusted', () => {
  it('accepts a well-formed one and reserves it', async () => {
    const db = fakeReserver();

    const number = await resolveDocumentNumber({
      recordId: 'r1',
      recordType: 'bylaw',
      supplied: 'BYL-2026-042',
      createdAt: '2026-03-04T00:00:00.000Z',
      db,
    });

    expect(number).toBe('BYL-2026-042');
    expect(db.reserved.get('BYL-2026-042')).toBe('r1');
  });

  it('rejects one that is not this type’s format', async () => {
    await expect(
      resolveDocumentNumber({
        recordId: 'r1',
        recordType: 'bylaw',
        supplied: 'whatever-i-like',
        createdAt: '2026-03-04T00:00:00.000Z',
        db: fakeReserver(),
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects another type’s number', async () => {
    await expect(
      resolveDocumentNumber({
        recordId: 'r1',
        recordType: 'bylaw',
        supplied: 'ORD-2026-001',
        createdAt: '2026-03-04T00:00:00.000Z',
        db: fakeReserver(),
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects one already carried by a record', async () => {
    await expect(
      resolveDocumentNumber({
        recordId: 'r2',
        recordType: 'bylaw',
        supplied: 'BYL-2026-001',
        createdAt: '2026-03-04T00:00:00.000Z',
        db: fakeReserver(['BYL-2026-001']),
      })
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects one another record has reserved but not yet written', async () => {
    const db = fakeReserver();
    await db.reserveDocumentNumber('BYL-2026-001', 'bylaw', 2026, 'r1');

    await expect(
      resolveDocumentNumber({
        recordId: 'r2',
        recordType: 'bylaw',
        supplied: 'BYL-2026-001',
        createdAt: '2026-03-04T00:00:00.000Z',
        db,
      })
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('does not police numbers on non-legal types', async () => {
    // No configured format governs these, so a locally-meaningful identifier
    // is none of numbering's business.
    const number = await resolveDocumentNumber({
      recordId: 'r1',
      recordType: 'meeting',
      supplied: 'minutes/2026-03-04',
      createdAt: '2026-03-04T00:00:00.000Z',
      db: fakeReserver(),
    });

    expect(number).toBe('minutes/2026-03-04');
  });

  it('judges a supplied number against the CONFIGURED format', async () => {
    // The old validate() compared against the built-in prefix, so on an
    // instance like this one it rejected exactly what generate() emits.
    vi.spyOn(CentralConfigManager, 'getDocumentNumberFormats').mockReturnValue({
      bylaw: {
        prefix: 'BY2',
        year_format: 'short',
        separator: '.',
        sequence_padding: 2,
      },
    } as unknown as ReturnType<
      typeof CentralConfigManager.getDocumentNumberFormats
    >);

    const number = await resolveDocumentNumber({
      recordId: 'r1',
      recordType: 'bylaw',
      supplied: 'BY2.26.07',
      createdAt: '2026-03-04T00:00:00.000Z',
      db: fakeReserver(),
    });
    expect(number).toBe('BY2.26.07');

    await expect(
      resolveDocumentNumber({
        recordId: 'r2',
        recordType: 'bylaw',
        supplied: 'BYL-2026-001',
        createdAt: '2026-03-04T00:00:00.000Z',
        db: fakeReserver(),
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('resolveDocumentNumber — the sync exemption', () => {
  it('adopts what the file says, without validating or reserving', async () => {
    const db = fakeReserver(['BYL-2026-001']);

    const number = await resolveDocumentNumber({
      recordId: 'r1',
      recordType: 'bylaw',
      supplied: 'not-even-close',
      createdAt: '2026-03-04T00:00:00.000Z',
      db,
      skip: true,
    });

    expect(number).toBe('not-even-close');
    expect(db.reserved.size).toBe(0);
  });

  it('does not invent a number for an unnumbered file', async () => {
    // Assigning here would write a number to the database that the file on
    // disk does not have, and the next re-index would lose it.
    const number = await resolveDocumentNumber({
      recordId: 'r1',
      recordType: 'bylaw',
      createdAt: '2026-03-04T00:00:00.000Z',
      db: fakeReserver(),
      skip: true,
    });

    expect(number).toBeUndefined();
  });
});
