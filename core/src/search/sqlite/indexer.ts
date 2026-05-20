/**
 * SQLite search indexer — extracted from sqlite-search-service.ts in
 * Phase 2d W2-T3. Owns the indexRecord + removeRecord paths (DELETE
 * existing + INSERT new into search_index; FTS5 triggers handle the
 * virtual table side).
 */

import type { DatabaseAdapter } from '../../database/database-adapter.js';
import { normalizeText } from './sql-builder.js';

export interface IndexRecordInput {
  recordId: string;
  recordType: string;
  title: string;
  content?: string;
  tags?: string;
  metadata?: any;
}

/**
 * (Re-)index a record: DELETE existing row (by recordId+recordType) and
 * INSERT the new one with derived title_normalized + content_preview +
 * word_count.
 */
export async function indexRecord(
  adapter: DatabaseAdapter,
  record: IndexRecordInput
): Promise<void> {
  const titleNormalized = normalizeText(record.title);
  const contentPreview = record.content?.substring(0, 500) || '';
  const wordCount = record.content?.split(/\s+/).length || 0;
  const metadataJson = record.metadata
    ? JSON.stringify(record.metadata)
    : null;

  await adapter.execute(
    'DELETE FROM search_index WHERE record_id = ? AND record_type = ?',
    [record.recordId, record.recordType]
  );

  await adapter.execute(
    `INSERT INTO search_index (
      record_id, record_type, title, content, tags, metadata,
      title_normalized, content_preview, word_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.recordId,
      record.recordType,
      record.title,
      record.content || null,
      record.tags || null,
      metadataJson,
      titleNormalized,
      contentPreview,
      wordCount,
    ]
  );
}

/**
 * Remove a record from the search index. FTS5 trigger handles the
 * virtual table; caller is responsible for any cache invalidation.
 */
export async function removeRecord(
  adapter: DatabaseAdapter,
  recordId: string,
  recordType: string
): Promise<void> {
  await adapter.execute(
    'DELETE FROM search_index WHERE record_id = ? AND record_type = ?',
    [recordId, recordType]
  );
}
