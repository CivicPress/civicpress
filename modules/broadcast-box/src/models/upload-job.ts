/**
 * Upload Job Model
 *
 * Manages upload job data and database operations
 */

import type { DatabaseService, Logger } from '@civicpress/core';
import type { UploadJob, UploadStatus } from '../types/index.js';

export class UploadJobModel {
  constructor(
    private db: DatabaseService,
    private logger: Logger
  ) {}

  /**
   * Create a new upload job
   */
  async create(
    upload: Omit<UploadJob, 'createdAt' | 'updatedAt'>
  ): Promise<UploadJob> {
    const now = new Date();
    const createdAt = now;
    const updatedAt = now;

    await this.db.getAdapter().execute(
      `INSERT INTO broadcast_uploads (
        id, session_id, device_id, file_path, file_name, file_size,
        file_hash, mime_type, status, progress_percent, storage_location,
        error, started_at, completed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        upload.id,
        upload.sessionId,
        upload.deviceId,
        upload.filePath,
        upload.fileName,
        upload.fileSize,
        upload.fileHash,
        upload.mimeType,
        upload.status,
        upload.progressPercent,
        upload.storageLocation || null,
        upload.error || null,
        upload.startedAt ? upload.startedAt.toISOString() : null,
        upload.completedAt ? upload.completedAt.toISOString() : null,
        createdAt.toISOString(),
        updatedAt.toISOString(),
      ]
    );

    return {
      ...upload,
      createdAt,
      updatedAt,
    };
  }

  /**
   * Get upload job by ID
   */
  async getById(id: string): Promise<UploadJob | null> {
    const rows = await this.db
      .getAdapter()
      .query<Record<string, any>>(`SELECT * FROM broadcast_uploads WHERE id = ?`, [id]);

    if (rows.length === 0) {
      return null;
    }

    return this.mapRowToUpload(rows[0]);
  }

  /**
   * Get upload job by session ID
   */
  async getBySessionId(sessionId: string): Promise<UploadJob | null> {
    const rows = await this.db
      .getAdapter()
      .query<Record<string, any>>(
        `SELECT * FROM broadcast_uploads WHERE session_id = ? ORDER BY created_at DESC LIMIT 1`,
        [sessionId]
      );

    if (rows.length === 0) {
      return null;
    }

    return this.mapRowToUpload(rows[0]);
  }

  /**
   * List upload jobs with optional filters
   */
  async list(filters?: {
    sessionId?: string;
    deviceId?: string;
    status?: UploadStatus;
    limit?: number;
    offset?: number;
  }): Promise<UploadJob[]> {
    let query = 'SELECT * FROM broadcast_uploads WHERE 1=1';
    const params: any[] = [];

    if (filters?.sessionId) {
      query += ' AND session_id = ?';
      params.push(filters.sessionId);
    }

    if (filters?.deviceId) {
      query += ' AND device_id = ?';
      params.push(filters.deviceId);
    }

    if (filters?.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }

    query += ' ORDER BY created_at DESC';

    if (filters?.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }

    if (filters?.offset) {
      query += ' OFFSET ?';
      params.push(filters.offset);
    }

    const rows = await this.db.getAdapter().query<Record<string, any>>(query, params);
    return rows.map((row) => this.mapRowToUpload(row));
  }

  /**
   * Update upload job
   */
  async update(
    id: string,
    updates: Partial<{
      status: UploadStatus;
      progressPercent: number;
      storageLocation: string;
      error: string;
      startedAt: Date;
      completedAt: Date;
    }>
  ): Promise<UploadJob> {
    const setClauses: string[] = [];
    const params: any[] = [];

    if (updates.status !== undefined) {
      setClauses.push('status = ?');
      params.push(updates.status);
    }

    if (updates.progressPercent !== undefined) {
      setClauses.push('progress_percent = ?');
      params.push(updates.progressPercent);
    }

    if (updates.storageLocation !== undefined) {
      setClauses.push('storage_location = ?');
      params.push(updates.storageLocation || null);
    }

    if (updates.error !== undefined) {
      setClauses.push('error = ?');
      params.push(updates.error || null);
    }

    if (updates.startedAt !== undefined) {
      setClauses.push('started_at = ?');
      params.push(updates.startedAt ? updates.startedAt.toISOString() : null);
    }

    if (updates.completedAt !== undefined) {
      setClauses.push('completed_at = ?');
      params.push(
        updates.completedAt ? updates.completedAt.toISOString() : null
      );
    }

    if (setClauses.length === 0) {
      // No updates, just return existing upload
      const upload = await this.getById(id);
      if (!upload) {
        throw new Error(`Upload job not found: ${id}`);
      }
      return upload;
    }

    setClauses.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(id);

    await this.db
      .getAdapter()
      .execute(
        `UPDATE broadcast_uploads SET ${setClauses.join(', ')} WHERE id = ?`,
        params
      );

    const updated = await this.getById(id);
    if (!updated) {
      throw new Error(`Upload job not found after update: ${id}`);
    }

    return updated;
  }

  /**
   * Delete upload job
   */
  async delete(id: string): Promise<void> {
    await this.db
      .getAdapter()
      .execute(`DELETE FROM broadcast_uploads WHERE id = ?`, [id]);
  }

  /**
   * Map database row to UploadJob object
   */
  private mapRowToUpload(row: Record<string, any>): UploadJob {
    return {
      id: row.id,
      sessionId: row.session_id,
      deviceId: row.device_id,
      filePath: row.file_path,
      fileName: row.file_name,
      fileSize: row.file_size,
      fileHash: row.file_hash,
      mimeType: row.mime_type,
      status: row.status as UploadStatus,
      progressPercent: row.progress_percent || 0,
      storageLocation: row.storage_location || undefined,
      error: row.error || undefined,
      startedAt: row.started_at ? new Date(row.started_at) : undefined,
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
