/**
 * Enrollment Code Model
 *
 * Manages Broadcast Box enrollment code data and database operations
 */

import type { DatabaseService, Logger } from '@civicpress/core';

export interface EnrollmentCode {
  id: string;
  deviceUuid: string;
  enrollmentCodeHash: string;
  createdAt: Date;
  expiresAt: Date;
  usedAt: Date | null;
  createdByUserId: number | null;
  ipAddress: string | null;
  registrationIp: string | null;
}

export interface CreateEnrollmentCodeData {
  id: string;
  deviceUuid: string;
  enrollmentCodeHash: string;
  expiresAt: Date;
  createdByUserId?: number | null;
  ipAddress?: string | null;
}

export class EnrollmentCodeModel {
  constructor(
    private db: DatabaseService,
    private logger: Logger
  ) {}

  /**
   * Create a new enrollment code
   */
  async create(data: CreateEnrollmentCodeData): Promise<EnrollmentCode> {
    const now = new Date();

    await this.db.getAdapter().execute(
      `INSERT INTO broadcast_enrollment_codes (
        id, device_uuid, enrollment_code_hash, created_at, expires_at,
        used_at, created_by_user_id, ip_address, registration_ip
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.id,
        data.deviceUuid,
        data.enrollmentCodeHash,
        now.toISOString(),
        data.expiresAt.toISOString(),
        null, // used_at
        data.createdByUserId || null,
        data.ipAddress || null,
        null, // registration_ip
      ]
    );

    return {
      id: data.id,
      deviceUuid: data.deviceUuid,
      enrollmentCodeHash: data.enrollmentCodeHash,
      createdAt: now,
      expiresAt: data.expiresAt,
      usedAt: null,
      createdByUserId: data.createdByUserId || null,
      ipAddress: data.ipAddress || null,
      registrationIp: null,
    };
  }

  /**
   * Find enrollment code by hash
   */
  async findByCodeHash(codeHash: string): Promise<EnrollmentCode | null> {
    const rows = await this.db
      .getAdapter()
      .query(
        `SELECT * FROM broadcast_enrollment_codes WHERE enrollment_code_hash = ?`,
        [codeHash]
      );

    if (rows.length === 0) {
      return null;
    }

    return this.mapRowToEnrollmentCode(rows[0]);
  }

  /**
   * Find an active (unused, non-expired) enrollment code by matching the plaintext code
   * against stored bcrypt hashes. Returns the first match.
   */
  async findByCode(code: string): Promise<EnrollmentCode | null> {
    const bcrypt = await import('bcrypt');
    const normalizedCode = code.trim().toUpperCase();

    // Get recent unused enrollment codes (created within the last 24 hours)
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const rows = await this.db
      .getAdapter()
      .query(
        `SELECT * FROM broadcast_enrollment_codes WHERE used_at IS NULL AND created_at > ? ORDER BY created_at DESC`,
        [cutoff]
      );

    for (const row of rows) {
      const entry = this.mapRowToEnrollmentCode(row);
      const isMatch = await bcrypt.compare(
        normalizedCode,
        entry.enrollmentCodeHash
      );
      if (isMatch) {
        return entry;
      }
    }

    return null;
  }

  /**
   * Find enrollment code by device UUID
   */
  async findByDeviceUuid(deviceUuid: string): Promise<EnrollmentCode | null> {
    const rows = await this.db
      .getAdapter()
      .query(
        `SELECT * FROM broadcast_enrollment_codes WHERE device_uuid = ? ORDER BY created_at DESC LIMIT 1`,
        [deviceUuid]
      );

    if (rows.length === 0) {
      return null;
    }

    return this.mapRowToEnrollmentCode(rows[0]);
  }

  /**
   * Mark enrollment code as used
   */
  async markAsUsed(id: string, registrationIp: string | null): Promise<void> {
    await this.db.getAdapter().execute(
      `UPDATE broadcast_enrollment_codes 
       SET used_at = ?, registration_ip = ? 
       WHERE id = ?`,
      [new Date().toISOString(), registrationIp || null, id]
    );
  }

  /**
   * Delete expired enrollment codes (cleanup job)
   * Returns count of deleted codes
   */
  async deleteExpired(): Promise<number> {
    const now = new Date().toISOString();

    // First, count how many will be deleted
    const countRows = await this.db.getAdapter().query(
      `SELECT COUNT(*) as count FROM broadcast_enrollment_codes 
       WHERE expires_at < ? AND used_at IS NULL`,
      [now]
    );

    const count = countRows[0]?.count || 0;
    const numericCount =
      typeof count === 'number' ? count : parseInt(String(count), 10);

    // Only delete if there are codes to delete
    if (numericCount > 0) {
      await this.db.getAdapter().execute(
        `DELETE FROM broadcast_enrollment_codes 
         WHERE expires_at < ? AND used_at IS NULL`,
        [now]
      );
    }

    return numericCount;
  }

  /**
   * Delete unused enrollment codes for a specific device UUID
   * This is used when regenerating enrollment codes for existing devices
   * Returns count of deleted codes
   */
  async deleteUnusedByDeviceUuid(deviceUuid: string): Promise<number> {
    // First, count how many will be deleted
    const countRows = await this.db.getAdapter().query(
      `SELECT COUNT(*) as count FROM broadcast_enrollment_codes 
       WHERE device_uuid = ? AND used_at IS NULL`,
      [deviceUuid]
    );

    const count = countRows[0]?.count || 0;
    const numericCount =
      typeof count === 'number' ? count : parseInt(String(count), 10);

    // Only delete if there are codes to delete
    if (numericCount > 0) {
      await this.db.getAdapter().execute(
        `DELETE FROM broadcast_enrollment_codes 
         WHERE device_uuid = ? AND used_at IS NULL`,
        [deviceUuid]
      );
    }

    return numericCount;
  }

  /**
   * Delete ALL enrollment codes for a specific device UUID (used and unused)
   * This is used when regenerating enrollment codes for existing devices
   * when the database has a UNIQUE constraint on device_uuid
   * Returns count of deleted codes
   */
  async deleteAllByDeviceUuid(deviceUuid: string): Promise<number> {
    // First, count how many will be deleted
    const countRows = await this.db.getAdapter().query(
      `SELECT COUNT(*) as count FROM broadcast_enrollment_codes 
       WHERE device_uuid = ?`,
      [deviceUuid]
    );

    const count = countRows[0]?.count || 0;
    const numericCount =
      typeof count === 'number' ? count : parseInt(String(count), 10);

    // Always execute delete (even if count is 0, to ensure clean state)
    // This ensures we don't have any orphaned records
    await this.db.getAdapter().execute(
      `DELETE FROM broadcast_enrollment_codes 
       WHERE device_uuid = ?`,
      [deviceUuid]
    );

    return numericCount;
  }

  /**
   * Check if enrollment code is expired
   */
  isExpired(enrollmentCode: EnrollmentCode): boolean {
    return new Date() > enrollmentCode.expiresAt;
  }

  /**
   * Check if enrollment code is used
   */
  isUsed(enrollmentCode: EnrollmentCode): boolean {
    return enrollmentCode.usedAt !== null;
  }

  /**
   * Map database row to EnrollmentCode object
   */
  private mapRowToEnrollmentCode(row: Record<string, any>): EnrollmentCode {
    return {
      id: row.id,
      deviceUuid: row.device_uuid,
      enrollmentCodeHash: row.enrollment_code_hash,
      createdAt: new Date(row.created_at),
      expiresAt: new Date(row.expires_at),
      usedAt: row.used_at ? new Date(row.used_at) : null,
      createdByUserId: row.created_by_user_id || null,
      ipAddress: row.ip_address || null,
      registrationIp: row.registration_ip || null,
    };
  }
}
