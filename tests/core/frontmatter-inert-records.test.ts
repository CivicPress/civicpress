import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  CivicPress,
  IndexingService,
  RecordParser,
  type RecordData,
} from '@civicpress/core';
import {
  createTestInstance,
  type TestInstance,
} from '../fixtures/test-instance.js';

/**
 * A record file has to be inert no matter how it reached the data directory.
 *
 * Every writer the API owns emits a YAML header it builds itself, so a request
 * cannot choose the front-matter engine. But a file can arrive without passing
 * through those writers — `civic import`, a restored backup, a data repository
 * edited or merged through Git — and the indexer parses whatever it finds, at
 * API startup. With an unguarded `gray-matter` call a file beginning `---js`
 * was handed to `eval` at that moment.
 *
 * These tests plant such a file and drive the real read paths. The payload
 * writes a marker file, so "was it executed?" is answered by the filesystem
 * rather than by anything the parser reports about itself.
 */
describe('a record file with executable front matter', () => {
  let instance: TestInstance;
  let civicPress: CivicPress;
  let marker: string;
  let hostilePath: string;

  const honest: RecordData = {
    id: 'record-1718208000000',
    title: 'Noise Restrictions',
    type: 'bylaw',
    status: 'published',
    content: '# Noise Restrictions\n\nQuiet hours begin at 22:00.',
    author: 'alovelace',
    authors: [{ name: 'Ada Lovelace', username: 'alovelace', role: 'clerk' }],
    created_at: '2025-06-12T10:00:00Z',
    updated_at: '2025-07-01T14:30:00Z',
    metadata: { tags: ['noise'], module: 'legal-register' },
  } as RecordData;

  beforeEach(async () => {
    instance = createTestInstance({ prefix: 'inert-records' });
    marker = join(instance.root, 'EXECUTED');

    civicPress = new CivicPress({
      dataDir: instance.dataDir,
      database: { type: 'sqlite' as const, sqlite: { file: instance.dbFile } },
    });
    await civicPress.initialize();

    mkdirSync(instance.recordsDir, { recursive: true });
    writeFileSync(
      join(instance.recordsDir, 'bylaw-noise-restrictions.md'),
      RecordParser.serializeToMarkdown(honest)
    );

    // Shaped like a real record in every respect but the first line, so the
    // only thing standing between it and the index is the engine refusal.
    hostilePath = join(instance.recordsDir, 'bylaw-hostile.md');
    writeFileSync(
      hostilePath,
      [
        '---js',
        `(require('fs').writeFileSync(${JSON.stringify(marker)}, 'executed'), {`,
        "  id: 'record-1718208000001',",
        "  title: 'Hostile',",
        "  type: 'bylaw',",
        "  status: 'published',",
        "  author: 'mallory',",
        "  created: '2025-06-12T10:00:00Z',",
        "  updated: '2025-06-12T10:00:00Z',",
        '})',
        '---',
        '',
        '# Hostile',
        '',
      ].join('\n')
    );
  });

  afterEach(async () => {
    await civicPress.shutdown();
    instance.cleanup();
  });

  it('is not executed when the indexer scans the data directory', async () => {
    const indexing = new IndexingService(civicPress, instance.dataDir);
    const index = await indexing.generateIndexes();

    expect(existsSync(marker)).toBe(false);

    // It is skipped, not fatal: one bad file must not take the index down, or
    // planting one becomes a way to blank a public site.
    const titles = index.entries.map((entry) => entry.title);
    expect(titles).toContain('Noise Restrictions');
    expect(titles).not.toContain('Hostile');
  });

  it('is not executed when the index is synced into the database', async () => {
    const indexing = new IndexingService(civicPress, instance.dataDir);
    await indexing.generateIndexes({ syncDatabase: true });

    expect(existsSync(marker)).toBe(false);
  });

  it('is refused by the record parser, by name', () => {
    expect(() =>
      RecordParser.parseFromMarkdown(
        `---js\n(require('fs').writeFileSync(${JSON.stringify(marker)}, 'x'), {})\n---\n`,
        hostilePath
      )
    ).toThrow(/JavaScript/);

    expect(existsSync(marker)).toBe(false);
  });
});
