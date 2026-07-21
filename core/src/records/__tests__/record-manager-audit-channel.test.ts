/**
 * Audit coverage for the four record lifecycle operations.
 *
 * `RecordManager` holds an `AuditChannel` and a `writeAudit` helper, and
 * `RecordSagas` receives `writeAudit` in its deps — but only create and update
 * ever called it. Archive and publish routed their DB writes through
 * `db.updateRecord(...)` inside their sagas (deliberately, so the saga owns the
 * file/git compensation), which bypasses `RecordManager.updateRecord` and
 * therefore bypassed the audit entirely:
 *
 *   - archiving a record produced NO audit row at all;
 *   - publishing a NEW draft produced only `create_record` (via
 *     `createRecordWithId`), and RE-publishing over an existing record produced
 *     nothing — silently losing the audit trail for every edit-then-republish.
 *
 * These tests assert each of the four writes its own entry.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CivicPress, CivicPressConfig } from '../../civic-core.js';
import { DatabaseService } from '../../database/database-service.js';
import { RecordManager } from '../record-manager.js';
import { AuthUser } from '../../auth/auth-service.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

describe('RecordManager audit channel — create/update/archive/publish', () => {
  let testDir: string;
  let civic: CivicPress;
  let db: DatabaseService;
  let recordManager: RecordManager;
  let testUser: AuthUser;

  /** Audit actions recorded against a given record id. */
  async function auditActionsFor(resourceId: string): Promise<string[]> {
    const rows = await db.query<{ action: string }>(
      'SELECT action FROM audit_logs WHERE resource_id = ? ORDER BY id ASC',
      [resourceId]
    );
    return rows.map((r) => r.action);
  }

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'civicpress-audit-'));
    await fs.mkdir(path.join(testDir, '.system-data'), { recursive: true });
    await fs.mkdir(path.join(testDir, '.civic'), { recursive: true });
    await fs.mkdir(path.join(testDir, 'records'), { recursive: true });

    execSync('git init', { cwd: testDir, stdio: 'ignore' });
    execSync('git config user.name "Test User"', {
      cwd: testDir,
      stdio: 'ignore',
    });
    execSync('git config user.email "test@example.com"', {
      cwd: testDir,
      stdio: 'ignore',
    });

    const config: CivicPressConfig = {
      dataDir: testDir,
      database: {
        type: 'sqlite',
        sqlite: { file: path.join(testDir, '.system-data', 'test.db') },
      },
    };

    civic = new CivicPress(config);
    await civic.initialize();

    db = civic.getDatabaseService();
    recordManager = civic.getRecordManager();

    // A REAL user row: `audit_logs.user_id` has a FK to `users(id)`, and
    // `logAuditEvent` deliberately retries with a NULL user_id when the actor
    // does not exist (so a synthetic actor can't abort the write or lose the
    // row). Attribution can therefore only be asserted against an actor that
    // actually exists.
    await db.execute(
      'INSERT INTO users (id, username, role, email, name) VALUES (?, ?, ?, ?, ?)',
      [1, 'testuser', 'admin', 'test@example.com', 'Test User']
    );

    testUser = {
      id: 1,
      username: 'testuser',
      role: 'admin',
      email: 'test@example.com',
      name: 'Test User',
    };
  }, 60000);

  afterEach(async () => {
    if (civic) {
      try {
        await civic.shutdown();
      } catch {
        // ignore shutdown errors
      }
    }
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it('audits create_record on the PUBLISHED (saga) path', async () => {
    // `createRecord` routes anything not-a-draft to `createRecordSaga`, which
    // inserts via `db.createRecord(...)` — so this never reached the
    // `writeAudit` on RecordManager's legacy branch.
    const record = await recordManager.createRecord(
      {
        title: 'Audited Create',
        type: 'bylaw',
        content: '# Create',
        status: 'published',
        metadata: {},
      },
      testUser
    );

    expect(await auditActionsFor(record.id)).toContain('create_record');
  });

  it('audits update_record on the PUBLISHED (saga) path', async () => {
    // Same shape: a non-draft record is routed to `updateRecordSaga`, which
    // writes through `db.updateRecord(...)`.
    const record = await recordManager.createRecord(
      {
        title: 'Audited Update',
        type: 'bylaw',
        content: '# Before',
        status: 'published',
        metadata: {},
      },
      testUser
    );

    await recordManager.updateRecord(
      record.id,
      { content: '# After' },
      testUser
    );

    expect(await auditActionsFor(record.id)).toContain('update_record');
  });

  it('audits archive_record (previously wrote no audit row at all)', async () => {
    const record = await recordManager.createRecord(
      {
        title: 'Audited Archive',
        type: 'bylaw',
        content: '# Archive me',
        status: 'published',
        metadata: {},
      },
      testUser
    );

    await recordManager.archiveRecord(record.id, testUser);

    const actions = await auditActionsFor(record.id);
    expect(actions).toContain('archive_record');
  });

  it('audits publish_record when the draft becomes a NEW record', async () => {
    const draftId = 'audited-publish-new';
    await db.createDraft({
      id: draftId,
      title: 'Audited Publish New',
      type: 'bylaw',
      status: 'draft',
      markdown_body: '# Draft body',
      metadata: JSON.stringify({ author: 'testuser' }),
      author: 'testuser',
      created_by: 'testuser',
    });

    await recordManager.publishDraft(draftId, testUser, 'published');

    const actions = await auditActionsFor(draftId);
    // The create branch keeps its own create_record entry — the record really
    // was created — but the publish itself is now audited too.
    expect(actions).toContain('create_record');
    expect(actions).toContain('publish_record');
  });

  it('audits publish_record when RE-publishing over an existing record', async () => {
    // This is the branch that previously produced NO audit row whatsoever:
    // PublishDraftSaga takes the `existingRecord` path and writes via
    // `db.updateRecord(...)` directly.
    const draftId = 'audited-publish-existing';

    await recordManager.createRecordWithId(
      draftId,
      {
        title: 'Audited Publish Existing',
        type: 'bylaw',
        content: '# v1',
        status: 'published',
        metadata: {},
      },
      testUser
    );

    await db.createDraft({
      id: draftId,
      title: 'Audited Publish Existing',
      type: 'bylaw',
      status: 'draft',
      markdown_body: '# v2 edited',
      metadata: JSON.stringify({ author: 'testuser' }),
      author: 'testuser',
      created_by: 'testuser',
    });

    await recordManager.publishDraft(draftId, testUser, 'published');

    const actions = await auditActionsFor(draftId);
    expect(actions).toContain('publish_record');
  });

  it('attributes the archive/publish entries to the acting user', async () => {
    const record = await recordManager.createRecord(
      {
        title: 'Audited Attribution',
        type: 'bylaw',
        content: '# Attribute',
        status: 'published',
        metadata: {},
      },
      testUser
    );

    await recordManager.archiveRecord(record.id, testUser);

    const rows = await db.query<{ user_id: number | null; action: string }>(
      'SELECT user_id, action FROM audit_logs WHERE resource_id = ? AND action = ?',
      [record.id, 'archive_record']
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].user_id).toBe(testUser.id);
  });
});
