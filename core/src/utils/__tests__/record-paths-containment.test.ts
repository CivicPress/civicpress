import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { findRecordFileSync, listRecordFilesSync } from '../record-paths.js';

/**
 * `type` reaches these functions from a query string or a request body, and
 * was joined onto the records root unchecked. `type: '../../outside'` made
 * them walk — recursively, synchronously — whatever directory that named, and
 * answer whether a given file existed there.
 *
 * The layout: a data directory, and beside it a directory that is none of the
 * application's business.
 */
describe('record lookups stay inside the records root', () => {
  let root: string;
  let dataDir: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'civic-record-paths-'));
    dataDir = join(root, 'instance', 'data');

    mkdirSync(join(dataDir, 'records', 'bylaw', '2024'), { recursive: true });
    writeFileSync(join(dataDir, 'records', 'bylaw', '2024', 'noise.md'), '#');
    mkdirSync(join(dataDir, 'archive', 'bylaw'), { recursive: true });
    writeFileSync(join(dataDir, 'archive', 'bylaw', 'old.md'), '#');

    mkdirSync(join(root, 'outside', 'sub'), { recursive: true });
    writeFileSync(join(root, 'outside', 'secret.md'), '#');
    writeFileSync(join(root, 'outside', 'sub', 'deeper.md'), '#');
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  // From `<dataDir>/records`: up to data, up to instance, up to root.
  const ESCAPES = [
    '../../../outside',
    '../../../outside/sub',
    '..',
    '../archive/bylaw',
  ];

  describe('listRecordFilesSync', () => {
    it('lists the records of a type', () => {
      expect(listRecordFilesSync(dataDir, { type: 'bylaw' })).toEqual([
        'records/bylaw/2024/noise.md',
      ]);
    });

    it.each(ESCAPES)('lists nothing for the type %j', (type) => {
      expect(listRecordFilesSync(dataDir, { type })).toEqual([]);
      expect(
        listRecordFilesSync(dataDir, { type, includeArchive: true })
      ).toEqual([]);
    });

    it('lists nothing for an absolute path', () => {
      expect(
        listRecordFilesSync(dataDir, { type: join(root, 'outside') })
      ).toEqual([]);
    });

    it('still lists every type when none is given', () => {
      expect(
        listRecordFilesSync(dataDir, { includeArchive: true }).sort()
      ).toEqual(['archive/bylaw/old.md', 'records/bylaw/2024/noise.md']);
    });
  });

  describe('findRecordFileSync', () => {
    it('finds a record by id, with and without its type', () => {
      expect(findRecordFileSync(dataDir, 'noise')).toBe(
        'records/bylaw/2024/noise.md'
      );
      expect(findRecordFileSync(dataDir, 'noise', { type: 'bylaw' })).toBe(
        'records/bylaw/2024/noise.md'
      );
    });

    it.each([
      ['secret', '../../../outside'],
      ['deeper', '../../../outside'],
      ['deeper', '../../../outside/sub'],
    ])('does not find %j through the type %j', (id, type) => {
      // Each of these used to return a path beginning `records/../../..`:
      // an oracle for whether the file exists.
      expect(findRecordFileSync(dataDir, id, { type })).toBeNull();
      expect(
        findRecordFileSync(dataDir, id, { type, includeArchive: true })
      ).toBeNull();
    });

    it.each(['../../../../outside/secret', '../../../../outside/sub/deeper'])(
      'does not find a record through the id %j',
      (id) => {
        expect(findRecordFileSync(dataDir, id, { type: 'bylaw' })).toBeNull();
        expect(findRecordFileSync(dataDir, id)).toBeNull();
      }
    );

    it('answers null, not an exception, when the type names a file', () => {
      // `readdirSync` on a file throws ENOTDIR. Over HTTP that was a 500 where
      // a missing path was a 200 — a second oracle.
      const type = '../../../outside/secret.md';
      expect(() => findRecordFileSync(dataDir, 'x', { type })).not.toThrow();
      expect(findRecordFileSync(dataDir, 'x', { type })).toBeNull();
    });
  });
});
