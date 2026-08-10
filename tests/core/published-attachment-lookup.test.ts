import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseService } from '../../core/src/database/database-service.js';
import { CivicPress } from '../../core/src/civic-core.js';
import {
  createTestDirectory,
  createRolesConfig,
  cleanupTestDirectory,
} from '../fixtures/test-setup';

/**
 * `isFileReferencedByPublishedRecord` is the lookup behind the storage read
 * gate's published-record override — the one thing that can turn a denied file
 * read into a served one — so its edges are pinned here rather than only
 * through the API.
 */
describe('RecordStore.isFileReferencedByPublishedRecord', () => {
  let testConfig: any;
  let civicPress: CivicPress;
  let db: DatabaseService;
  let counter = 0;

  const uuid = (n: number) =>
    `0000${n}000-0000-4000-8000-00000000000${n}`.slice(-36);

  const seed = async (opts: {
    status: string;
    attachedFileId?: string;
    content?: string;
  }) => {
    counter++;
    await db.createRecord({
      id: `rec-${counter}`,
      title: `Record ${counter}`,
      type: 'bylaw',
      status: opts.status,
      content: opts.content ?? 'body',
      attached_files: opts.attachedFileId
        ? JSON.stringify([{ id: opts.attachedFileId }])
        : undefined,
      author: 'tester',
    });
  };

  beforeEach(async () => {
    counter = 0;
    testConfig = createTestDirectory('published-attachment-lookup');
    createRolesConfig(testConfig);
    civicPress = new CivicPress({ dataDir: testConfig.dataDir });
    await civicPress.initialize();
    db = civicPress.getDatabaseService();
  });

  afterEach(async () => {
    await cleanupTestDirectory(testConfig);
  });

  it('finds a file listed in a published record’s attached_files', async () => {
    const id = uuid(1);
    await seed({ status: 'published', attachedFileId: id });
    expect(await db.isFileReferencedByPublishedRecord(id)).toBe(true);
  });

  it('finds a file embedded as a bare UUID in published content', async () => {
    const id = uuid(2);
    await seed({ status: 'published', content: `text ![x](${id}) more` });
    expect(await db.isFileReferencedByPublishedRecord(id)).toBe(true);
  });

  it('does not match while the only referencing record is a draft', async () => {
    const id = uuid(3);
    await seed({ status: 'draft', attachedFileId: id });
    expect(await db.isFileReferencedByPublishedRecord(id)).toBe(false);
  });

  it('does not match an unreferenced file', async () => {
    await seed({ status: 'published', attachedFileId: uuid(4) });
    expect(await db.isFileReferencedByPublishedRecord(uuid(5))).toBe(false);
  });

  // The id is interpolated into a LIKE pattern, so a non-UUID must be refused
  // rather than matched: '%' or an empty string would otherwise match every
  // published row and open every attachment at once.
  it.each(['', '%', '_', '%-%-%-%-%', 'not-a-uuid'])(
    'refuses the non-UUID id %j instead of pattern-matching it',
    async (bogus) => {
      await seed({ status: 'published', attachedFileId: uuid(6) });
      expect(await db.isFileReferencedByPublishedRecord(bogus)).toBe(false);
    }
  );
});
