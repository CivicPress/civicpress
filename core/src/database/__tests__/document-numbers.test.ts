import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createDatabaseAdapter, DatabaseAdapter } from '../database-adapter.js';
import { RecordStore } from '../stores/record-store.js';
import { DocumentNumberGenerator } from '../../utils/document-number-generator.js';

/**
 * `document_number` lives inside the metadata JSON blob rather than its own
 * column, so the lookup that feeds legal numbering depends on SQLite's
 * json_extract seeing it. These run against a real database rather than a
 * mock, so a schema or JSON-storage change can't quietly break numbering.
 */
describe('RecordStore.getDocumentNumbers (real SQLite)', () => {
  let dir: string;
  let adapter: DatabaseAdapter;
  let store: RecordStore;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'civic-docnum-'));
    adapter = createDatabaseAdapter({
      type: 'sqlite',
      sqlite: { file: join(dir, 'test.db') },
    });
    await adapter.connect();
    await adapter.initialize();
    store = new RecordStore(adapter);
  });

  afterEach(async () => {
    await adapter.close();
    rmSync(dir, { recursive: true, force: true });
  });

  async function addRecord(
    id: string,
    type: string,
    metadata: Record<string, unknown>
  ): Promise<void> {
    await store.createRecord({
      id,
      title: id,
      type,
      status: 'draft',
      content: '# ' + id,
      metadata: JSON.stringify(metadata),
      path: `records/${type}/${id}.md`,
      author: 'test',
    });
  }

  it('returns the document numbers actually stored in metadata', async () => {
    await addRecord('a', 'bylaw', { document_number: 'BYL-2026-001' });
    await addRecord('b', 'bylaw', { document_number: 'BYL-2026-002' });

    const numbers = await store.getDocumentNumbers('bylaw');

    expect(numbers.sort()).toEqual(['BYL-2026-001', 'BYL-2026-002']);
  });

  it('omits records with no document number', async () => {
    await addRecord('a', 'bylaw', { document_number: 'BYL-2026-001' });
    await addRecord('b', 'bylaw', { some: 'other-metadata' });

    expect(await store.getDocumentNumbers('bylaw')).toEqual(['BYL-2026-001']);
  });

  it('scopes to the requested record type', async () => {
    await addRecord('a', 'bylaw', { document_number: 'BYL-2026-001' });
    await addRecord('b', 'ordinance', { document_number: 'ORD-2026-001' });

    expect(await store.getDocumentNumbers('bylaw')).toEqual(['BYL-2026-001']);
    expect(await store.getDocumentNumbers('ordinance')).toEqual([
      'ORD-2026-001',
    ]);
  });

  it('returns an empty list for a type with no records', async () => {
    expect(await store.getDocumentNumbers('bylaw')).toEqual([]);
  });

  it('feeds a non-colliding next number end to end', async () => {
    await addRecord('a', 'bylaw', { document_number: 'BYL-2026-001' });
    await addRecord('b', 'bylaw', { document_number: 'BYL-2026-002' });

    const sequence = await DocumentNumberGenerator.getNextSequence(
      'bylaw',
      2026,
      store
    );

    expect(DocumentNumberGenerator.generate('bylaw', 2026, sequence)).toBe(
      'BYL-2026-003'
    );
  });

  /**
   * The reservation table is what makes numbering safe under concurrency, so
   * these run against real SQLite too — the guarantee IS the PRIMARY KEY, and
   * a fake reserver would be asserting on the thing under test.
   */
  describe('reservations', () => {
    it('lets exactly one caller win a given number', async () => {
      expect(
        await store.reserveDocumentNumber('BYL-2026-001', 'bylaw', 2026, 'a')
      ).toBe(true);
      expect(
        await store.reserveDocumentNumber('BYL-2026-001', 'bylaw', 2026, 'b')
      ).toBe(false);
    });

    it('is idempotent for the same record — a retry is not a conflict', async () => {
      await store.reserveDocumentNumber('BYL-2026-001', 'bylaw', 2026, 'a');

      expect(
        await store.reserveDocumentNumber('BYL-2026-001', 'bylaw', 2026, 'a')
      ).toBe(true);
    });

    it('reports reserved numbers before any record row exists', async () => {
      await store.reserveDocumentNumber('BYL-2026-001', 'bylaw', 2026, 'a');

      // The whole point: nothing is in `records` yet.
      expect(await store.getDocumentNumbers('bylaw')).toEqual([]);
      expect(await store.getReservedDocumentNumbers('bylaw')).toEqual([
        'BYL-2026-001',
      ]);
    });

    it('scopes reservations to the record type', async () => {
      await store.reserveDocumentNumber('BYL-2026-001', 'bylaw', 2026, 'a');
      await store.reserveDocumentNumber('ORD-2026-001', 'ordinance', 2026, 'b');

      expect(await store.getReservedDocumentNumbers('bylaw')).toEqual([
        'BYL-2026-001',
      ]);
    });

    it('releases a number only to the record holding it', async () => {
      await store.reserveDocumentNumber('BYL-2026-001', 'bylaw', 2026, 'a');

      // A different record cannot release someone else's reservation.
      await store.releaseDocumentNumber('BYL-2026-001', 'b');
      expect(await store.getReservedDocumentNumbers('bylaw')).toEqual([
        'BYL-2026-001',
      ]);

      await store.releaseDocumentNumber('BYL-2026-001', 'a');
      expect(await store.getReservedDocumentNumbers('bylaw')).toEqual([]);
    });
  });

  /**
   * The race this was written to close: assignment used to read the highest
   * issued number and then write, with nothing in between, so two concurrent
   * creates of the same type and year were handed the SAME number. Negative
   * control: replacing `assign` with the old read-then-write shape
   * (getNextSequence + generate, no reservation) makes both of these fail.
   */
  describe('concurrent assignment', () => {
    it('never issues the same number twice', async () => {
      const assignments = await Promise.all(
        Array.from({ length: 12 }, (_, i) =>
          DocumentNumberGenerator.assign('bylaw', 2026, `record-${i}`, store)
        )
      );

      expect(new Set(assignments).size).toBe(assignments.length);
    });

    it('issues a dense sequence, so a race leaves no gaps either', async () => {
      const assignments = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          DocumentNumberGenerator.assign('bylaw', 2026, `record-${i}`, store)
        )
      );

      expect(assignments.sort()).toEqual([
        'BYL-2026-001',
        'BYL-2026-002',
        'BYL-2026-003',
        'BYL-2026-004',
        'BYL-2026-005',
      ]);
    });

    it('continues past numbers that only exist in record metadata', async () => {
      await addRecord('legacy', 'bylaw', { document_number: 'BYL-2026-001' });

      expect(
        await DocumentNumberGenerator.assign('bylaw', 2026, 'new', store)
      ).toBe('BYL-2026-002');
    });
  });
});
