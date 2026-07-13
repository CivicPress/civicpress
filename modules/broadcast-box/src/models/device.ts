/**
 * Device Model
 *
 * Manages Broadcast Box device data and database operations
 */

import type { DatabaseService, Logger } from '@civicpress/core';
import type {
  BroadcastDevice,
  DeviceStatus,
  DeviceCapabilities,
  DeviceConfig,
  ActiveSources,
  PiPConfiguration,
} from '../types/index.js';

export class DeviceModel {
  constructor(
    private db: DatabaseService,
    private logger: Logger
  ) {}

  /**
   * Create a new device
   */
  async create(
    device: Omit<BroadcastDevice, 'createdAt' | 'updatedAt'>
  ): Promise<BroadcastDevice> {
    const now = new Date();
    const createdAt = now;
    const updatedAt = now;

    await this.db.getAdapter().execute(
      `INSERT INTO broadcast_devices (
        id, organization_id, device_uuid, name, room_location,
        status, capabilities, config, public_key, active_sources, pip_config,
        last_seen_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        device.id,
        device.organizationId,
        device.deviceUuid,
        device.name,
        device.roomLocation || null,
        device.status,
        JSON.stringify(device.capabilities),
        device.config ? JSON.stringify(device.config) : null,
        device.publicKey || null,
        device.activeSources ? JSON.stringify(device.activeSources) : null,
        device.pipConfig ? JSON.stringify(device.pipConfig) : null,
        device.lastSeenAt ? device.lastSeenAt.toISOString() : null,
        createdAt.toISOString(),
        updatedAt.toISOString(),
      ]
    );

    return {
      ...device,
      createdAt,
      updatedAt,
    };
  }

  /**
   * Get device by ID
   */
  async getById(id: string): Promise<BroadcastDevice | null> {
    const rows = await this.db
      .getAdapter()
      .query<Record<string, any>>(`SELECT * FROM broadcast_devices WHERE id = ?`, [id]);

    if (rows.length === 0) {
      return null;
    }

    return this.mapRowToDevice(rows[0]);
  }

  /**
   * Get device by device UUID
   */
  async getByDeviceUuid(deviceUuid: string): Promise<BroadcastDevice | null> {
    const rows = await this.db
      .getAdapter()
      .query<Record<string, any>>(`SELECT * FROM broadcast_devices WHERE device_uuid = ?`, [
        deviceUuid,
      ]);

    if (rows.length === 0) {
      return null;
    }

    return this.mapRowToDevice(rows[0]);
  }

  /**
   * List devices with optional filters
   */
  async list(filters?: {
    organizationId?: string;
    status?: DeviceStatus;
    limit?: number;
    offset?: number;
  }): Promise<BroadcastDevice[]> {
    let query = 'SELECT * FROM broadcast_devices WHERE 1=1';
    const params: any[] = [];

    if (filters?.organizationId) {
      query += ' AND organization_id = ?';
      params.push(filters.organizationId);
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
    return rows.map((row) => this.mapRowToDevice(row));
  }

  /**
   * Update device
   */
  async update(
    id: string,
    updates: Partial<{
      name: string;
      roomLocation: string;
      status: DeviceStatus;
      capabilities: DeviceCapabilities;
      config: DeviceConfig;
      publicKey: string;
      activeSources: ActiveSources;
      pipConfig: PiPConfiguration;
      lastSeenAt: Date;
    }>
  ): Promise<BroadcastDevice> {
    const setClauses: string[] = [];
    const params: any[] = [];

    if (updates.name !== undefined) {
      setClauses.push('name = ?');
      params.push(updates.name);
    }

    if (updates.publicKey !== undefined) {
      setClauses.push('public_key = ?');
      params.push(updates.publicKey || null);
    }

    if (updates.roomLocation !== undefined) {
      setClauses.push('room_location = ?');
      params.push(updates.roomLocation || null);
    }

    if (updates.status !== undefined) {
      setClauses.push('status = ?');
      params.push(updates.status);
    }

    if (updates.capabilities !== undefined) {
      setClauses.push('capabilities = ?');
      params.push(JSON.stringify(updates.capabilities));
    }

    if (updates.config !== undefined) {
      setClauses.push('config = ?');
      params.push(updates.config ? JSON.stringify(updates.config) : null);
    }

    if (updates.activeSources !== undefined) {
      setClauses.push('active_sources = ?');
      params.push(
        updates.activeSources ? JSON.stringify(updates.activeSources) : null
      );
    }

    if (updates.pipConfig !== undefined) {
      setClauses.push('pip_config = ?');
      params.push(updates.pipConfig ? JSON.stringify(updates.pipConfig) : null);
    }

    if (updates.lastSeenAt !== undefined) {
      setClauses.push('last_seen_at = ?');
      params.push(updates.lastSeenAt ? updates.lastSeenAt.toISOString() : null);
    }

    if (setClauses.length === 0) {
      // No updates, just return existing device
      const device = await this.getById(id);
      if (!device) {
        throw new Error(`Device not found: ${id}`);
      }
      return device;
    }

    setClauses.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(id);

    await this.db
      .getAdapter()
      .execute(
        `UPDATE broadcast_devices SET ${setClauses.join(', ')} WHERE id = ?`,
        params
      );

    const updated = await this.getById(id);
    if (!updated) {
      throw new Error(`Device not found after update: ${id}`);
    }

    return updated;
  }

  /**
   * Delete device
   */
  async delete(id: string): Promise<void> {
    await this.db
      .getAdapter()
      .execute(`DELETE FROM broadcast_devices WHERE id = ?`, [id]);
  }

  /**
   * Map database row to Device object
   */
  private mapRowToDevice(row: Record<string, any>): BroadcastDevice {
    return {
      id: row.id,
      organizationId: row.organization_id,
      deviceUuid: row.device_uuid,
      name: row.name,
      roomLocation: row.room_location || undefined,
      status: row.status as DeviceStatus,
      capabilities: JSON.parse(row.capabilities),
      config: row.config ? JSON.parse(row.config) : {},
      publicKey: row.public_key || undefined,
      activeSources: row.active_sources
        ? JSON.parse(row.active_sources)
        : undefined,
      pipConfig: row.pip_config ? JSON.parse(row.pip_config) : undefined,
      lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
