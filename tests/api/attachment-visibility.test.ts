import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'fs-extra';
import path from 'path';
import {
  createAPITestContext,
  cleanupAPITestContext,
  setupGlobalTestEnvironment,
} from '../fixtures/test-setup';

await setupGlobalTestEnvironment();

/**
 * Attachment visibility follows the RECORD, not the upload.
 *
 * Editor uploads land in the `attachments` folder, configured
 * `access: authenticated` so a draft's attachments are staff-only. Publishing a
 * record that references the file makes it citizen-readable — without moving
 * the bytes — via the published-record override in `checkFileReadAccess`.
 *
 * The override is the one path in the storage gate that turns a deny into a
 * serve, so the negative cases below matter as much as the positive one:
 * `private` folders are never opened by publishing (FA-BB-002: recordings_raw
 * holds unredacted closed-session A/V), and enumeration stays authenticated
 * (FA-STOR-001).
 */
describe('Attachment visibility — published records open their attachments', () => {
  let context: any;
  let adminToken: string;
  let testFilePath: string;
  let privateFilePath: string;

  // The `private` folder's allowed_types are document formats only, so the
  // fixture file has to match the folder under test.
  const uploadTo = async (folder: string) => {
    const source = folder === 'private' ? privateFilePath : testFilePath;
    const response = await request(context.api.getApp())
      .post('/api/v1/storage/files')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', source)
      .field('folder', folder);
    expect(response.status).toBe(200);
    return response.body.data.id as string;
  };

  /** Insert a record straight into the index — this is what the gate reads. */
  const seedRecord = async (
    opts: { status: string } & (
      | { attachedFileId: string }
      | { content: string }
    )
  ) => {
    const db = context.civic.getDatabaseService();
    await db.createRecord({
      id: `rec-${Math.round(performance.now() * 1000)}-${opts.status}`,
      title: 'Attachment visibility fixture',
      type: 'bylaw',
      status: opts.status,
      content: 'content' in opts ? opts.content : 'body',
      attached_files:
        'attachedFileId' in opts
          ? JSON.stringify([
              { id: opts.attachedFileId, original_name: 'test-file.txt' },
            ])
          : undefined,
      author: 'admin',
    });
  };

  const anonymousGet = (url: string) => request(context.api.getApp()).get(url);

  beforeEach(async () => {
    context = await createAPITestContext();

    const adminResponse = await request(context.api.getApp())
      .post('/api/v1/auth/simulated')
      .send({ username: 'admin', role: 'admin' });
    adminToken = adminResponse.body.data.session.token;

    testFilePath = path.join(context.testDir, 'test-file.txt');
    await fs.writeFile(testFilePath, 'attachment bytes');
    privateFilePath = path.join(context.testDir, 'confidential.pdf');
    await fs.writeFile(privateFilePath, '%PDF-1.4 confidential bytes');
  });

  afterEach(async () => {
    const { resetStorageServices } =
      await import('../../modules/api/src/routes/uuid-storage.js');
    resetStorageServices();
    await cleanupAPITestContext(context);
  });

  it('keeps a draft record’s attachment unreadable anonymously', async () => {
    const fileId = await uploadTo('attachments');
    await seedRecord({ status: 'draft', attachedFileId: fileId });

    expect((await anonymousGet(`/api/v1/storage/files/${fileId}`)).status).toBe(
      401
    );
    expect(
      (await anonymousGet(`/api/v1/storage/files/${fileId}/info`)).status
    ).toBe(401);
  });

  it('serves an attachment anonymously once a record referencing it is published', async () => {
    const fileId = await uploadTo('attachments');
    await seedRecord({ status: 'published', attachedFileId: fileId });

    const download = await anonymousGet(`/api/v1/storage/files/${fileId}`);
    expect(download.status).toBe(200);

    const info = await anonymousGet(`/api/v1/storage/files/${fileId}/info`);
    expect(info.status).toBe(200);
    expect(info.body.data.folder).toBe('attachments');
  });

  // Images dragged into the editor body are stored as a bare UUID in the
  // Markdown, not in attached_files — they must open on publish too.
  it('counts a UUID embedded in published Markdown as a reference', async () => {
    const fileId = await uploadTo('attachments');
    await seedRecord({
      status: 'published',
      content: `Intro text\n\n![diagram](${fileId})\n`,
    });

    expect((await anonymousGet(`/api/v1/storage/files/${fileId}`)).status).toBe(
      200
    );
  });

  it('leaves an unreferenced upload closed to anonymous readers', async () => {
    const fileId = await uploadTo('attachments');

    expect((await anonymousGet(`/api/v1/storage/files/${fileId}`)).status).toBe(
      401
    );
  });

  // The critical negative: publishing a record must never reach into a
  // confidential folder. Raw BroadcastBox originals live there (FA-BB-002).
  it('never opens a PRIVATE folder file, even from a published record', async () => {
    const fileId = await uploadTo('private');
    await seedRecord({ status: 'published', attachedFileId: fileId });

    const download = await anonymousGet(`/api/v1/storage/files/${fileId}`);
    expect(download.status).toBe(401);

    // And an authenticated user without storage:read_private stays out too.
    const clerk = await request(context.api.getApp())
      .post('/api/v1/auth/simulated')
      .send({ username: 'clerk', role: 'clerk' });
    const clerkToken = clerk.body.data.session.token;

    const asClerk = await request(context.api.getApp())
      .get(`/api/v1/storage/files/${fileId}`)
      .set('Authorization', `Bearer ${clerkToken}`);
    expect(asClerk.status).toBe(403);
  });

  // FA-STOR-001: the override is per-file only. Publishing one attachment must
  // not turn the folder into an anonymously enumerable index.
  it('does not open folder LISTING to anonymous callers', async () => {
    const fileId = await uploadTo('attachments');
    await seedRecord({ status: 'published', attachedFileId: fileId });

    const listing = await anonymousGet(
      '/api/v1/storage/folders/attachments/files'
    );
    expect([401, 403]).toContain(listing.status);
  });
});
