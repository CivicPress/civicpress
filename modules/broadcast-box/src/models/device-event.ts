/**
 * Device Event Model
 *
 * Manages device event/telemetry data and database operations
 */

import type { DatabaseService, Logger } from '@civicpress/core';

export interface DeviceEvent {
  id: string;
  deviceId: string;
  eventType: string;
  eventData: Record<string, any>;
  createdAt: Date;
}

export class DeviceEventModel {
  constructor(
    private db: DatabaseService,
    private logger: Logger
  ) {}

  /**
   * Create a new device event
   */
  async create(event: Omit<DeviceEvent, 'createdAt'>): Promise<DeviceEvent> {
    const now = new Date();
    const createdAt = now;

    await this.db.getAdapter().execute(
      `INSERT INTO broadcast_device_events (
        id, device_id, event_type, event_data, created_at
      ) VALUES (?, ?, ?, ?, ?)`,
      [
        event.id,
        event.deviceId,
        event.eventType,
        JSON.stringify(event.eventData),
        createdAt.toISOString(),
      ]
    );

    return {
      ...event,
      createdAt,
    };
  }

  /**
   * Get event by ID
   */
  async getById(id: string): Promise<DeviceEvent | null> {
    const rows = await this.db
      .getAdapter()
      .query<Record<string, any>>(`SELECT * FROM broadcast_device_events WHERE id = ?`, [id]);

    if (rows.length === 0) {
      return null;
    }

    return this.mapRowToEvent(rows[0]);
  }

  /**
   * List events with optional filters
   */
  async list(filters?: {
    deviceId?: string;
    eventType?: string;
    limit?: number;
    offset?: number;
    startDate?: Date;
    endDate?: Date;
  }): Promise<DeviceEvent[]> {
    let query = 'SELECT * FROM broadcast_device_events WHERE 1=1';
    const params: any[] = [];

    if (filters?.deviceId) {
      query += ' AND device_id = ?';
      params.push(filters.deviceId);
    }

    if (filters?.eventType) {
      query += ' AND event_type = ?';
      params.push(filters.eventType);
    }

    if (filters?.startDate) {
      query += ' AND created_at >= ?';
      params.push(filters.startDate.toISOString());
    }

    if (filters?.endDate) {
      query += ' AND created_at <= ?';
      params.push(filters.endDate.toISOString());
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
    return rows.map((row) => this.mapRowToEvent(row));
  }

  /**
   * Delete events older than specified date
   */
  async deleteOlderThan(date: Date): Promise<number> {
    const result = await this.db
      .getAdapter()
      .execute(`DELETE FROM broadcast_device_events WHERE created_at < ?`, [
        date.toISOString(),
      ]);

    // Return number of deleted rows (if supported by adapter)
    return (result as any).changes || 0;
  }

  /**
   * Delete events for a specific device
   */
  async deleteByDeviceId(deviceId: string): Promise<void> {
    await this.db
      .getAdapter()
      .execute(`DELETE FROM broadcast_device_events WHERE device_id = ?`, [
        deviceId,
      ]);
  }

  /**
   * Map database row to DeviceEvent object
   */
  private mapRowToEvent(row: Record<string, any>): DeviceEvent {
    return {
      id: row.id,
      deviceId: row.device_id,
      eventType: row.event_type,
      eventData: JSON.parse(row.event_data || '{}'),
      createdAt: new Date(row.created_at),
    };
  }
}
