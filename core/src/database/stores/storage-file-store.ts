/**
 * Storage File Store — owns CRUD for `storage_files`.
 *
 * Extracted from `database-service.ts` as part of Phase 2d W2-T5
 * decomposition. Method bodies are moved verbatim; only the receiver
 * changes (the store owns its own adapter + logger references). The
 * orchestrator delegates one-liners to this store so external
 * consumers see no signature change.
 */

import { DatabaseAdapter, SqlParam } from '../database-adapter.js';
import { Logger } from '../../utils/logger.js';
import type { StorageFileRow } from '../types/row-types.js';

export class StorageFileStore {
  private adapter: DatabaseAdapter;
  private logger: Logger;

  constructor(adapter: DatabaseAdapter, logger?: Logger) {
    this.adapter = adapter;
    this.logger = logger || new Logger();
  }

  // Storage file management
  async createStorageFile(file: {
    id: string;
    original_name: string;
    stored_filename: string;
    folder: string;
    relative_path: string;
    provider_path: string;
    size: number;
    mime_type: string;
    description?: string;
    uploaded_by?: string;
  }): Promise<void> {
    await this.adapter.execute(
      `INSERT INTO storage_files
       (id, original_name, stored_filename, folder, relative_path, provider_path,
        size, mime_type, description, uploaded_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [
        file.id,
        file.original_name,
        file.stored_filename,
        file.folder,
        file.relative_path,
        file.provider_path,
        file.size,
        file.mime_type,
        file.description || null,
        file.uploaded_by || null,
      ]
    );
  }

  /**
   * Upsert (insert or replace) a storage file record.
   * Used during backup restore to handle existing records gracefully.
   */
  async upsertStorageFile(file: {
    id: string;
    original_name: string;
    stored_filename: string;
    folder: string;
    relative_path: string;
    provider_path: string;
    size: number;
    mime_type: string;
    description?: string;
    uploaded_by?: string;
    created_at?: string;
    updated_at?: string;
  }): Promise<void> {
    await this.adapter.execute(
      `INSERT OR REPLACE INTO storage_files
       (id, original_name, stored_filename, folder, relative_path, provider_path,
        size, mime_type, description, uploaded_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')), datetime('now'))`,
      [
        file.id,
        file.original_name,
        file.stored_filename,
        file.folder,
        file.relative_path,
        file.provider_path,
        file.size,
        file.mime_type,
        file.description || null,
        file.uploaded_by || null,
        file.created_at || null,
      ]
    );
  }

  async getStorageFileById(id: string): Promise<StorageFileRow | null> {
    const results = await this.adapter.query<StorageFileRow>(
      'SELECT * FROM storage_files WHERE id = ?',
      [id]
    );
    return results.length > 0 ? results[0] : null;
  }

  async getStorageFilesByFolder(folder: string): Promise<StorageFileRow[]> {
    return await this.adapter.query<StorageFileRow>(
      'SELECT * FROM storage_files WHERE folder = ? ORDER BY created_at DESC',
      [folder]
    );
  }

  async getAllStorageFiles(): Promise<StorageFileRow[]> {
    return await this.adapter.query<StorageFileRow>(
      'SELECT * FROM storage_files ORDER BY created_at DESC'
    );
  }

  async deleteStorageFile(id: string): Promise<boolean> {
    try {
      await this.adapter.execute('DELETE FROM storage_files WHERE id = ?', [
        id,
      ]);
      return true;
    } catch (error) {
      this.logger.error('Failed to delete storage file:', error);
      return false;
    }
  }

  async updateStorageFile(
    id: string,
    updates: {
      description?: string;
      updated_by?: string;
    }
  ): Promise<boolean> {
    try {
      const setParts: string[] = [];
      const params: SqlParam[] = [];

      if (updates.description !== undefined) {
        setParts.push('description = ?');
        params.push(updates.description);
      }

      setParts.push("updated_at = datetime('now')");
      params.push(id);

      if (setParts.length > 1) {
        // More than just updated_at
        await this.adapter.execute(
          `UPDATE storage_files SET ${setParts.join(', ')} WHERE id = ?`,
          params
        );
      }
      return true;
    } catch (error) {
      this.logger.error('Failed to update storage file:', error);
      return false;
    }
  }

  async findStorageFileByPath(
    relativePath: string
  ): Promise<StorageFileRow | null> {
    const results = await this.adapter.query<StorageFileRow>(
      'SELECT * FROM storage_files WHERE relative_path = ?',
      [relativePath]
    );
    return results.length > 0 ? results[0] : null;
  }
}
