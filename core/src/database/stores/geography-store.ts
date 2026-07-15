/**
 * Geography Store — owns CRUD for `geography_files` (FA-CORE-011).
 *
 * The geography markdown file on disk remains the source of truth; this store
 * maintains a DB mirror so DB-backed consumers (search, linked-records joins)
 * can see geography rows. `bounds` and `metadata` are persisted as JSON TEXT.
 */

import { DatabaseAdapter } from '../database-adapter.js';
import { Logger } from '../../utils/logger.js';

export interface GeographyFileRecord {
  id: string;
  name: string;
  type: string;
  category: string;
  description?: string;
  srid?: number;
  bounds?: unknown;
  metadata?: unknown;
  file_path: string;
}

export class GeographyStore {
  private adapter: DatabaseAdapter;
  private logger: Logger;

  constructor(adapter: DatabaseAdapter, logger?: Logger) {
    this.adapter = adapter;
    this.logger = logger || new Logger();
  }

  /**
   * Insert or replace a geography row (id is the stable UUID). Upsert keeps the
   * DB mirror in sync whether the file is being created or updated.
   */
  async upsertGeographyFile(file: GeographyFileRecord): Promise<void> {
    await this.adapter.execute(
      `INSERT INTO geography_files
         (id, name, type, category, description, srid, bounds, metadata,
          file_path, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         type = excluded.type,
         category = excluded.category,
         description = excluded.description,
         srid = excluded.srid,
         bounds = excluded.bounds,
         metadata = excluded.metadata,
         file_path = excluded.file_path,
         updated_at = CURRENT_TIMESTAMP`,
      [
        file.id,
        file.name,
        file.type,
        file.category,
        file.description ?? null,
        file.srid ?? 4326,
        file.bounds != null ? JSON.stringify(file.bounds) : null,
        file.metadata != null ? JSON.stringify(file.metadata) : null,
        file.file_path,
      ]
    );
  }

  async deleteGeographyFile(id: string): Promise<void> {
    await this.adapter.execute('DELETE FROM geography_files WHERE id = ?', [id]);
  }

  async getGeographyFile(id: string): Promise<Record<string, unknown> | null> {
    const rows = await this.adapter.query(
      'SELECT * FROM geography_files WHERE id = ?',
      [id]
    );
    return rows.length > 0 ? (rows[0] as Record<string, unknown>) : null;
  }

  async listGeographyFiles(): Promise<Record<string, unknown>[]> {
    const rows = await this.adapter.query(
      'SELECT * FROM geography_files ORDER BY name'
    );
    return rows as Record<string, unknown>[];
  }
}
