/**
 * Device Manager Service
 *
 * Manages Broadcast Box device lifecycle: enrollment, registration, configuration, revocation
 */

import type { Logger, DatabaseService } from '@civicpress/core';
import { coreInfo, coreWarn, coreError } from '@civicpress/core';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { DeviceModel } from '../models/device.js';
import { DeviceEventModel } from '../models/device-event.js';
import { EnrollmentCodeModel } from '../models/enrollment-code.js';
import type {
  BroadcastDevice,
  DeviceStatus,
  DeviceCapabilities,
  DeviceConfig,
  ActiveSources,
  PiPConfiguration,
  CreateDeviceRequest,
  UpdateDeviceRequest,
} from '../types/index.js';

export class DeviceManager {
  private deviceModel: DeviceModel;
  private deviceEventModel: DeviceEventModel;
  private enrollmentCodeModel: EnrollmentCodeModel;

  // Enrollment code expiration (15 minutes)
  private readonly ENROLLMENT_EXPIRY_MINUTES = 15;

  constructor(
    private db: DatabaseService,
    private logger: Logger
  ) {
    this.deviceModel = new DeviceModel(db, logger);
    this.deviceEventModel = new DeviceEventModel(db, logger);
    this.enrollmentCodeModel = new EnrollmentCodeModel(db, logger);
  }

  /**
   * Enroll a new device (generate enrollment code and device UUID)
   * This is the first step before device registration
   */
  async enrollDevice(data: {
    name: string;
    roomLocation?: string;
    organizationId?: string;
    createdByUserId?: number | null;
    ipAddress?: string | null;
  }): Promise<{
    deviceUuid: string;
    enrollmentCode: string;
    expiresAt: Date;
  }> {
    // Generate device UUID (this is what the device will use to identify itself)
    const deviceUuid = uuidv4();

    // Generate enrollment code (short-lived code for initial registration)
    // Format: 12-character alphanumeric code (grouped as XXXX-XXXX-XXXX)
    const enrollmentCode = this.generateEnrollmentCode();

    // Hash the enrollment code before storing
    const bcrypt = await import('bcrypt');
    const saltRounds = 12;
    const enrollmentCodeHash = await bcrypt.hash(enrollmentCode, saltRounds);

    // Calculate expiration time (15 minutes from now)
    const expiresAt = new Date();
    expiresAt.setMinutes(
      expiresAt.getMinutes() + this.ENROLLMENT_EXPIRY_MINUTES
    );

    // Store enrollment code in database
    const enrollmentId = uuidv4();
    await this.enrollmentCodeModel.create({
      id: enrollmentId,
      deviceUuid,
      enrollmentCodeHash,
      expiresAt,
      createdByUserId: data.createdByUserId || null,
      ipAddress: data.ipAddress || null,
    });

    coreInfo('Device enrolled', {
      operation: 'broadcast-box:device:enrolled',
      deviceUuid,
      enrollmentId,
      name: data.name,
      expiresAt: expiresAt.toISOString(),
    });

    return {
      deviceUuid,
      enrollmentCode,
      expiresAt,
    };
  }

  /**
   * Register a device (first connection after enrollment)
   */
  async registerDevice(
    data: CreateDeviceRequest & {
      enrollmentCode: string;
      registrationIp?: string | null;
    }
  ): Promise<BroadcastDevice> {
    // Validate enrollment code
    // First, find the enrollment code by device UUID
    this.logger.debug('Looking up enrollment code for device', {
      operation: 'broadcast-box:device:registration:lookup',
      deviceUuid: data.deviceUuid,
      enrollmentCodeLength: data.enrollmentCode?.length || 0,
      enrollmentCodeFormat: data.enrollmentCode?.substring(0, 20) || 'empty',
    });

    const enrollmentCode = await this.enrollmentCodeModel.findByDeviceUuid(
      data.deviceUuid
    );

    if (!enrollmentCode) {
      this.logger.warn(
        'Device registration failed: enrollment code not found for device UUID',
        {
          operation: 'broadcast-box:device:registration:invalid-code',
          deviceUuid: data.deviceUuid,
          registrationIp: data.registrationIp || 'unknown',
          note: 'No enrollment code found in database for this device UUID. Make sure you enrolled the device first.',
        }
      );
      throw new Error('Invalid enrollment code');
    }

    this.logger.debug('Enrollment code found', {
      operation: 'broadcast-box:device:registration:code-found',
      enrollmentCodeId: enrollmentCode.id,
      deviceUuid: enrollmentCode.deviceUuid,
      expiresAt: enrollmentCode.expiresAt.toISOString(),
      usedAt: enrollmentCode.usedAt?.toISOString() || null,
    });

    // Verify device UUID matches
    if (enrollmentCode.deviceUuid !== data.deviceUuid) {
      coreWarn('Device registration failed: device UUID mismatch', {
        operation: 'broadcast-box:device:registration:uuid-mismatch',
        expectedUuid: enrollmentCode.deviceUuid,
        providedUuid: data.deviceUuid,
        registrationIp: data.registrationIp || 'unknown',
      });
      throw new Error('Device UUID mismatch');
    }

    // Check if device UUID already exists FIRST (before expiration check)
    // This allows recovery for existing devices even with expired codes
    const existing = await this.deviceModel.getByDeviceUuid(data.deviceUuid);

    this.logger.debug('Device lookup result', {
      operation: 'broadcast-box:device:registration:device-lookup',
      deviceUuid: data.deviceUuid,
      deviceExists: !!existing,
      deviceId: existing?.id,
      deviceStatus: existing?.status,
      enrollmentCodeUsed: this.enrollmentCodeModel.isUsed(enrollmentCode),
      enrollmentCodeExpired: this.enrollmentCodeModel.isExpired(enrollmentCode),
      enrollmentCodeUsedAt: enrollmentCode.usedAt?.toISOString() || null,
      enrollmentCodeExpiresAt: enrollmentCode.expiresAt.toISOString(),
    });

    if (existing) {
      // Device already exists - verify the enrollment code is valid for re-registration
      // For existing devices, we allow expired codes (recovery path) but still validate the hash
      // Normalize the enrollment code (remove any whitespace, ensure uppercase)
      const normalizedCode = data.enrollmentCode.trim().toUpperCase();

      // Verify the enrollment code matches the stored hash
      const bcrypt = await import('bcrypt');
      const isValid = await bcrypt.compare(
        normalizedCode,
        enrollmentCode.enrollmentCodeHash
      );

      if (!isValid) {
        this.logger.warn(
          'Re-registration attempt with invalid enrollment code',
          {
            operation: 'broadcast-box:device:registration:invalid-code-reuse',
            deviceId: existing.id,
            deviceUuid: existing.deviceUuid,
            registrationIp: data.registrationIp || 'unknown',
            enrollmentCodeId: enrollmentCode.id,
            enrollmentCodeCreatedAt: enrollmentCode.createdAt.toISOString(),
            enrollmentCodeExpiresAt: enrollmentCode.expiresAt.toISOString(),
            enrollmentCodeUsed: this.enrollmentCodeModel.isUsed(enrollmentCode),
            providedCodeLength: normalizedCode.length,
            note: 'The provided enrollment code does not match the stored hash. This could mean: (1) You are using an old code that was regenerated, (2) The code is for a different device, or (3) There is a typo in the code.',
          }
        );
        throw new Error('Invalid enrollment code');
      }

      // For existing devices, we allow expired codes (recovery mechanism)
      // This allows devices to re-register and get a new token even if their enrollment code expired
      const isExpired = this.enrollmentCodeModel.isExpired(enrollmentCode);
      if (isExpired) {
        coreInfo(
          'Re-registration with expired enrollment code (recovery path)',
          {
            operation:
              'broadcast-box:device:registration:expired-code-recovery',
            deviceId: existing.id,
            deviceUuid: existing.deviceUuid,
            expiresAt: enrollmentCode.expiresAt.toISOString(),
            registrationIp: data.registrationIp || 'unknown',
            note: 'Allowing re-registration for existing device with expired code. This is a recovery mechanism for devices that lost their token.',
          }
        );
      }

      // Code is valid (hash matches) - allow re-registration
      // This handles:
      // 1. Re-registration with a valid (non-expired) code
      // 2. Re-registration with an expired code (recovery path for existing devices)
      // 3. Re-registration with a previously used code (idempotent)
      // 4. Re-registration with a newly generated code (regeneration scenario)

      // Mark the code as used if it hasn't been used yet
      if (!this.enrollmentCodeModel.isUsed(enrollmentCode)) {
        try {
          await this.enrollmentCodeModel.markAsUsed(
            enrollmentCode.id,
            data.registrationIp || null
          );
        } catch (markError: any) {
          // If marking as used fails, log but don't fail registration (non-critical)
          this.logger.warn(
            'Failed to mark enrollment code as used during re-registration (non-critical)',
            {
              operation:
                'broadcast-box:device:registration:mark-used-failed-re-registration',
              enrollmentCodeId: enrollmentCode.id,
              deviceId: existing.id,
              error:
                markError instanceof Error
                  ? markError.message
                  : String(markError),
            }
          );
        }
      }

      coreInfo('Device re-registration with valid enrollment code', {
        operation: 'broadcast-box:device:registration:re-registration',
        deviceId: existing.id,
        deviceUuid: existing.deviceUuid,
        status: existing.status,
        codeWasUsed: this.enrollmentCodeModel.isUsed(enrollmentCode),
        codeExpired: isExpired,
        note: isExpired
          ? 'Generating new token for existing device (recovery with expired code)'
          : 'Generating new token for existing device',
      });
      return existing;
    }

    // For NEW device registrations, enforce expiration check strictly
    // New devices must register within the 15-minute validity window
    if (this.enrollmentCodeModel.isExpired(enrollmentCode)) {
      coreWarn('Device registration failed: enrollment code expired', {
        operation: 'broadcast-box:device:registration:expired',
        deviceUuid: data.deviceUuid,
        expiresAt: enrollmentCode.expiresAt.toISOString(),
        registrationIp: data.registrationIp || 'unknown',
        note: 'New device registration requires a valid (non-expired) enrollment code. Please generate a new enrollment code.',
      });
      throw new Error('Enrollment code expired');
    }

    // For NEW device registrations, verify the provided enrollment code matches the stored hash
    // Normalize the enrollment code (remove any whitespace, ensure uppercase)
    const normalizedCode = data.enrollmentCode.trim().toUpperCase();

    this.logger.debug('Comparing enrollment code for new device registration', {
      operation: 'broadcast-box:device:registration:code-compare',
      providedCodeLength: normalizedCode.length,
      providedCodeFormat: normalizedCode.substring(0, 20),
      hashLength: enrollmentCode.enrollmentCodeHash.length,
    });

    const bcrypt = await import('bcrypt');
    const isValid = await bcrypt.compare(
      normalizedCode,
      enrollmentCode.enrollmentCodeHash
    );

    if (!isValid) {
      this.logger.warn(
        'Device registration failed: enrollment code hash mismatch',
        {
          operation: 'broadcast-box:device:registration:hash-mismatch',
          deviceUuid: data.deviceUuid,
          registrationIp: data.registrationIp || 'unknown',
          providedCodeLength: normalizedCode.length,
          note: 'The provided enrollment code does not match the stored hash. Check that you are using the correct code from the enrollment step.',
        }
      );
      throw new Error('Invalid enrollment code');
    }

    this.logger.debug('Enrollment code hash verified successfully', {
      operation: 'broadcast-box:device:registration:code-verified',
    });

    // Now check if code is already used (only if device doesn't exist)
    // This prevents reusing a code that was used for a different device
    if (this.enrollmentCodeModel.isUsed(enrollmentCode)) {
      coreWarn('Device registration failed: enrollment code already used', {
        operation: 'broadcast-box:device:registration:already-used',
        deviceUuid: data.deviceUuid,
        usedAt: enrollmentCode.usedAt?.toISOString(),
        registrationIp: data.registrationIp || 'unknown',
        note: 'This enrollment code was already used. Generate a new enrollment code.',
      });
      throw new Error('Enrollment code already used');
    }

    // Create device record FIRST
    const deviceId = uuidv4();
    const device: Omit<BroadcastDevice, 'createdAt' | 'updatedAt'> = {
      id: deviceId,
      organizationId: 'default', // TODO: Get from user context or config
      deviceUuid: data.deviceUuid,
      name: data.name,
      roomLocation: data.roomLocation,
      status: 'enrolled',
      capabilities: data.capabilities || {
        videoSources: [],
        audioSources: [],
        pipSupported: false,
        maxResolution: '1080p',
      },
      config: data.config || {},
    };

    let created: BroadcastDevice;
    try {
      created = await this.deviceModel.create(device);
    } catch (createError: any) {
      // If device creation fails, enrollment code remains unused and can be retried
      throw createError;
    }

    // Only mark enrollment code as used AFTER device is successfully created
    // This ensures the code can be reused if device creation fails
    try {
      await this.enrollmentCodeModel.markAsUsed(
        enrollmentCode.id,
        data.registrationIp || null
      );
    } catch (markError: any) {
      // If marking as used fails, log but don't fail registration (device is already created)
      // This is a non-critical operation - the device is registered
      this.logger.warn(
        'Failed to mark enrollment code as used (non-critical)',
        {
          operation: 'broadcast-box:device:registration:mark-used-failed',
          enrollmentCodeId: enrollmentCode.id,
          deviceId: created.id,
          error:
            markError instanceof Error ? markError.message : String(markError),
        }
      );
    }

    // Log device registration event
    await this.deviceEventModel.create({
      id: uuidv4(),
      deviceId: created.id,
      eventType: 'device.registered',
      eventData: {
        name: created.name,
        roomLocation: created.roomLocation,
        enrollmentCodeId: enrollmentCode.id,
      },
    });

    coreInfo('Device registered', {
      operation: 'broadcast-box:device:registered',
      deviceId: created.id,
      deviceUuid: created.deviceUuid,
      enrollmentCodeId: enrollmentCode.id,
    });

    return created;
  }

  /**
   * Activate a device (change status from 'enrolled' to 'active')
   * Only activates if enrollment code is still valid (not expired)
   */
  async activateDevice(deviceId: string): Promise<BroadcastDevice> {
    const device = await this.deviceModel.getById(deviceId);
    if (!device) {
      throw new Error(`Device not found: ${deviceId}`);
    }

    if (device.status !== 'enrolled') {
      throw new Error(
        `Device ${deviceId} cannot be activated. Current status: ${device.status}`
      );
    }

    // Verify enrollment code is still valid (not expired) at activation time
    // This ensures devices connect within the validity window
    const enrollmentCode = await this.enrollmentCodeModel.findByDeviceUuid(
      device.deviceUuid
    );
    if (enrollmentCode) {
      if (this.enrollmentCodeModel.isExpired(enrollmentCode)) {
        coreWarn('Device activation failed: enrollment code expired', {
          operation: 'broadcast-box:device:activation:expired',
          deviceId,
          deviceUuid: device.deviceUuid,
          expiresAt: enrollmentCode.expiresAt.toISOString(),
        });
        throw new Error(
          'Enrollment code expired. Device must connect within the validity window.'
        );
      }
    } else {
      // Enrollment code not found - this shouldn't happen for registered devices
      // but we'll allow activation to proceed (device was already registered)
      this.logger.warn(
        'Enrollment code not found during activation (non-critical)',
        {
          operation: 'broadcast-box:device:activation:code-not-found',
          deviceId,
          deviceUuid: device.deviceUuid,
        }
      );
    }

    const updated = await this.deviceModel.update(deviceId, {
      status: 'active',
    });

    // Log activation event
    await this.deviceEventModel.create({
      id: uuidv4(),
      deviceId: updated.id,
      eventType: 'device.activated',
      eventData: {
        enrollmentCodeExpiresAt:
          enrollmentCode?.expiresAt.toISOString() || null,
        activatedAt: new Date().toISOString(),
      },
    });

    coreInfo('Device activated', {
      operation: 'broadcast-box:device:activated',
      deviceId: updated.id,
      deviceUuid: updated.deviceUuid,
    });

    return updated;
  }

  /**
   * Update device configuration
   */
  async updateDevice(
    deviceId: string,
    updates: UpdateDeviceRequest
  ): Promise<BroadcastDevice> {
    const device = await this.deviceModel.getById(deviceId);
    if (!device) {
      throw new Error(`Device not found: ${deviceId}`);
    }

    const updateData: Partial<{
      name: string;
      roomLocation: string;
      status: DeviceStatus;
      capabilities: DeviceCapabilities;
      config: DeviceConfig;
      activeSources: ActiveSources;
      pipConfig: PiPConfiguration;
    }> = {};

    if (updates.name !== undefined) {
      updateData.name = updates.name;
    }

    if (updates.roomLocation !== undefined) {
      updateData.roomLocation = updates.roomLocation;
    }

    if (updates.status !== undefined) {
      updateData.status = updates.status;
    }

    if (updates.config !== undefined) {
      updateData.config = { ...device.config, ...updates.config };
    }

    if (updates.capabilities !== undefined) {
      updateData.capabilities = {
        ...device.capabilities,
        ...updates.capabilities,
      };
    }

    if (updates.activeSources !== undefined) {
      updateData.activeSources = updates.activeSources;
    }

    if (updates.pipConfig !== undefined) {
      updateData.pipConfig = updates.pipConfig;
    }

    const updated = await this.deviceModel.update(deviceId, updateData);

    // Log update event
    await this.deviceEventModel.create({
      id: uuidv4(),
      deviceId: updated.id,
      eventType: 'device.updated',
      eventData: {
        fields: Object.keys(updates),
      },
    });

    coreInfo('Device updated', {
      operation: 'broadcast-box:device:updated',
      deviceId: updated.id,
    });

    return updated;
  }

  /**
   * Revoke a device (change status to 'revoked')
   */
  async revokeDevice(deviceId: string): Promise<void> {
    const device = await this.deviceModel.getById(deviceId);
    if (!device) {
      throw new Error(`Device not found: ${deviceId}`);
    }

    await this.deviceModel.update(deviceId, {
      status: 'revoked',
    });

    // Log revocation event
    await this.deviceEventModel.create({
      id: uuidv4(),
      deviceId: device.id,
      eventType: 'device.revoked',
      eventData: {},
    });

    coreInfo('Device revoked', {
      operation: 'broadcast-box:device:revoked',
      deviceId: device.id,
    });
  }

  /**
   * Suspend a device (change status to 'suspended')
   */
  async suspendDevice(deviceId: string): Promise<BroadcastDevice> {
    const device = await this.deviceModel.getById(deviceId);
    if (!device) {
      throw new Error(`Device not found: ${deviceId}`);
    }

    const updated = await this.deviceModel.update(deviceId, {
      status: 'suspended',
    });

    // Log suspension event
    await this.deviceEventModel.create({
      id: uuidv4(),
      deviceId: updated.id,
      eventType: 'device.suspended',
      eventData: {},
    });

    coreInfo('Device suspended', {
      operation: 'broadcast-box:device:suspended',
      deviceId: updated.id,
    });

    return updated;
  }

  /**
   * Update device last seen timestamp
   */
  async updateLastSeen(deviceId: string): Promise<void> {
    await this.deviceModel.update(deviceId, {
      lastSeenAt: new Date(),
    });
  }

  /**
   * List devices with optional filters
   */
  async listDevices(filters?: {
    organizationId?: string;
    status?: DeviceStatus;
    limit?: number;
    offset?: number;
  }): Promise<BroadcastDevice[]> {
    return this.deviceModel.list(filters);
  }

  /**
   * Get device by ID
   */
  async getDevice(deviceId: string): Promise<BroadcastDevice | null> {
    return this.deviceModel.getById(deviceId);
  }

  /**
   * Get device by device UUID
   */
  async getDeviceByUuid(deviceUuid: string): Promise<BroadcastDevice | null> {
    return this.deviceModel.getByDeviceUuid(deviceUuid);
  }

  /**
   * Get enrollment code status for a device
   * Returns status information (not the actual code, which is hashed)
   */
  async getEnrollmentCodeStatus(deviceUuid: string): Promise<{
    exists: boolean;
    isExpired: boolean;
    isUsed: boolean;
    expiresAt: Date | null;
    createdAt: Date | null;
    usedAt: Date | null;
  }> {
    const enrollmentCode =
      await this.enrollmentCodeModel.findByDeviceUuid(deviceUuid);

    if (!enrollmentCode) {
      return {
        exists: false,
        isExpired: false,
        isUsed: false,
        expiresAt: null,
        createdAt: null,
        usedAt: null,
      };
    }

    return {
      exists: true,
      isExpired: this.enrollmentCodeModel.isExpired(enrollmentCode),
      isUsed: this.enrollmentCodeModel.isUsed(enrollmentCode),
      expiresAt: enrollmentCode.expiresAt,
      createdAt: enrollmentCode.createdAt,
      usedAt: enrollmentCode.usedAt,
    };
  }

  /**
   * Regenerate enrollment code for an existing device
   * This invalidates any previous unused codes for the device
   */
  async regenerateEnrollmentCode(
    deviceId: string,
    data: {
      createdByUserId?: number | null;
      ipAddress?: string | null;
    }
  ): Promise<{
    deviceUuid: string;
    enrollmentCode: string;
    expiresAt: Date;
  }> {
    // Get the device to ensure it exists and get its UUID
    const device = await this.deviceModel.getById(deviceId);
    if (!device) {
      throw new Error(`Device with ID ${deviceId} not found`);
    }

    // Delete any existing enrollment codes for this device
    // (The database has a UNIQUE constraint on device_uuid, so we must delete all codes)
    const deletedCount = await this.enrollmentCodeModel.deleteAllByDeviceUuid(
      device.deviceUuid
    );
    coreInfo('Deleted existing enrollment codes before regeneration', {
      operation: 'broadcast-box:device:enrollment:delete-before-regenerate',
      deviceId,
      deviceUuid: device.deviceUuid,
      deletedCount,
    });

    // Verify deletion succeeded by checking if any codes still exist
    const existingCode = await this.enrollmentCodeModel.findByDeviceUuid(
      device.deviceUuid
    );
    if (existingCode) {
      coreWarn(
        'Enrollment code still exists after deletion attempt, retrying delete',
        {
          operation: 'broadcast-box:device:enrollment:delete-retry',
          deviceId,
          deviceUuid: device.deviceUuid,
          existingCodeId: existingCode.id,
        }
      );
      // Retry deletion
      await this.enrollmentCodeModel.deleteAllByDeviceUuid(device.deviceUuid);

      // Verify again
      const stillExists = await this.enrollmentCodeModel.findByDeviceUuid(
        device.deviceUuid
      );
      if (stillExists) {
        throw new Error(
          `Failed to delete existing enrollment code for device ${device.deviceUuid}. ` +
            `Code ${stillExists.id} still exists after deletion attempt.`
        );
      }
    }

    // Generate new enrollment code
    const enrollmentCode = this.generateEnrollmentCode();

    // Hash the enrollment code before storing
    const bcrypt = await import('bcrypt');
    const saltRounds = 12;
    const enrollmentCodeHash = await bcrypt.hash(enrollmentCode, saltRounds);

    // Calculate expiration time (15 minutes from now)
    const expiresAt = new Date();
    expiresAt.setMinutes(
      expiresAt.getMinutes() + this.ENROLLMENT_EXPIRY_MINUTES
    );

    // Store enrollment code in database
    const enrollmentId = uuidv4();
    try {
      await this.enrollmentCodeModel.create({
        id: enrollmentId,
        deviceUuid: device.deviceUuid,
        enrollmentCodeHash,
        expiresAt,
        createdByUserId: data.createdByUserId || null,
        ipAddress: data.ipAddress || null,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('UNIQUE constraint')
      ) {
        // Check if a code was created by another process
        const conflictingCode = await this.enrollmentCodeModel.findByDeviceUuid(
          device.deviceUuid
        );
        throw new Error(
          `UNIQUE constraint violation: An enrollment code already exists for device ${device.deviceUuid}. ` +
            `This may indicate a race condition. Existing code ID: ${conflictingCode?.id || 'unknown'}`
        );
      }
      throw error;
    }

    coreInfo('Enrollment code regenerated for existing device', {
      operation: 'broadcast-box:device:enrollment:regenerated',
      deviceId,
      deviceUuid: device.deviceUuid,
      enrollmentId,
      expiresAt: expiresAt.toISOString(),
    });

    return {
      deviceUuid: device.deviceUuid,
      enrollmentCode,
      expiresAt,
    };
  }

  /**
   * Generate enrollment code (12-character alphanumeric, grouped as XXXX-XXXX-XXXX)
   * Uses cryptographically secure random generation
   */
  private generateEnrollmentCode(): string {
    // Exclude confusing characters: 0, O, I, l
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const codeLength = 12;

    // Use crypto.randomBytes for secure random generation
    const randomBytes = crypto.randomBytes(codeLength);
    let code = '';

    for (let i = 0; i < codeLength; i++) {
      const randomIndex = randomBytes[i] % chars.length;
      code += chars[randomIndex];
    }

    // Format as XXXX-XXXX-XXXX for readability
    return `${code.substring(0, 4)}-${code.substring(4, 8)}-${code.substring(8, 12)}`;
  }
}
