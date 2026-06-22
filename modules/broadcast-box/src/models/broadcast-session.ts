/**
 * Broadcast Session Model
 *
 * Manages recording session data and database operations
 */

import type { DatabaseService, Logger } from '@civicpress/core';
import type {
  BroadcastSession,
  SessionStatus,
  SessionMetadata,
} from '../types/index.js';

export class BroadcastSessionModel {
  constructor(
    private db: DatabaseService,
    private logger: Logger
  ) {}

  /**
   * Create a new session
   */
  async create(
    session: Omit<BroadcastSession, 'createdAt' | 'updatedAt'>
  ): Promise<BroadcastSession> {
    const now = new Date();
    const createdAt = now;
    const updatedAt = now;

    await this.db.getAdapter().execute(
      `INSERT INTO broadcast_sessions (
        id, device_id, civicpress_session_id, status,
        started_at, stopped_at, completed_at, error, metadata,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        session.id,
        session.deviceId,
        session.civicpressSessionId,
        session.status,
        session.startedAt ? session.startedAt.toISOString() : null,
        session.stoppedAt ? session.stoppedAt.toISOString() : null,
        session.completedAt ? session.completedAt.toISOString() : null,
        session.error || null,
        JSON.stringify(session.metadata),
        createdAt.toISOString(),
        updatedAt.toISOString(),
      ]
    );

    return {
      ...session,
      createdAt,
      updatedAt,
    };
  }

  /**
   * Get session by ID
   */
  async getById(id: string): Promise<BroadcastSession | null> {
    const rows = await this.db
      .getAdapter()
      .query<Record<string, any>>(`SELECT * FROM broadcast_sessions WHERE id = ?`, [id]);

    if (rows.length === 0) {
      return null;
    }

    return this.mapRowToSession(rows[0]);
  }

  /**
   * Get session by CivicPress session ID
   */
  async getByCivicPressSessionId(
    civicpressSessionId: string
  ): Promise<BroadcastSession | null> {
    const rows = await this.db
      .getAdapter()
      .query<Record<string, any>>(
        `SELECT * FROM broadcast_sessions WHERE civicpress_session_id = ? ORDER BY created_at DESC LIMIT 1`,
        [civicpressSessionId]
      );

    if (rows.length === 0) {
      return null;
    }

    return this.mapRowToSession(rows[0]);
  }

  /**
   * List sessions with optional filters
   */
  async list(filters?: {
    deviceId?: string;
    civicpressSessionId?: string;
    status?: SessionStatus;
    limit?: number;
    offset?: number;
  }): Promise<BroadcastSession[]> {
    let query = 'SELECT * FROM broadcast_sessions WHERE 1=1';
    const params: any[] = [];

    if (filters?.deviceId) {
      query += ' AND device_id = ?';
      params.push(filters.deviceId);
    }

    if (filters?.civicpressSessionId) {
      query += ' AND civicpress_session_id = ?';
      params.push(filters.civicpressSessionId);
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
    return rows.map((row) => this.mapRowToSession(row));
  }

  /**
   * Update session
   */
  async update(
    id: string,
    updates: Partial<{
      status: SessionStatus;
      startedAt: Date;
      stoppedAt: Date;
      completedAt: Date;
      error: string;
      metadata: SessionMetadata;
    }>
  ): Promise<BroadcastSession> {
    const setClauses: string[] = [];
    const params: any[] = [];

    if (updates.status !== undefined) {
      setClauses.push('status = ?');
      params.push(updates.status);
    }

    if (updates.startedAt !== undefined) {
      setClauses.push('started_at = ?');
      params.push(updates.startedAt ? updates.startedAt.toISOString() : null);
    }

    if (updates.stoppedAt !== undefined) {
      setClauses.push('stopped_at = ?');
      params.push(updates.stoppedAt ? updates.stoppedAt.toISOString() : null);
    }

    if (updates.completedAt !== undefined) {
      setClauses.push('completed_at = ?');
      params.push(
        updates.completedAt ? updates.completedAt.toISOString() : null
      );
    }

    if (updates.error !== undefined) {
      setClauses.push('error = ?');
      params.push(updates.error || null);
    }

    if (updates.metadata !== undefined) {
      setClauses.push('metadata = ?');
      params.push(JSON.stringify(updates.metadata));
    }

    if (setClauses.length === 0) {
      // No updates, just return existing session
      const session = await this.getById(id);
      if (!session) {
        throw new Error(`Session not found: ${id}`);
      }
      return session;
    }

    setClauses.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(id);

    await this.db
      .getAdapter()
      .execute(
        `UPDATE broadcast_sessions SET ${setClauses.join(', ')} WHERE id = ?`,
        params
      );

    const updated = await this.getById(id);
    if (!updated) {
      throw new Error(`Session not found after update: ${id}`);
    }

    return updated;
  }

  /**
   * Delete session
   */
  async delete(id: string): Promise<void> {
    await this.db
      .getAdapter()
      .execute(`DELETE FROM broadcast_sessions WHERE id = ?`, [id]);
  }

  /**
   * Map database row to Session object
   */
  private mapRowToSession(row: Record<string, any>): BroadcastSession {
    return {
      id: row.id,
      deviceId: row.device_id,
      civicpressSessionId: row.civicpress_session_id,
      status: row.status as SessionStatus,
      startedAt: row.started_at ? new Date(row.started_at) : undefined,
      stoppedAt: row.stopped_at ? new Date(row.stopped_at) : undefined,
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      error: row.error || undefined,
      metadata: JSON.parse(row.metadata || '{}'),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
