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
});
