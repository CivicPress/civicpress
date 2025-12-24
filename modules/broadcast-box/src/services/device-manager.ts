/**
 * Device Manager Service
 *
 * Manages Broadcast Box device lifecycle: enrollment, registration, configuration, revocation
 */

import type { Logger, DatabaseService } from '@civicpress/core';
import { coreInfo, coreWarn, coreError } from '@civicpress/core';
import { v4 as uuidv4 } from 'uuid';
import { DeviceModel } from '../models/device.js';
import { DeviceEventModel } from '../models/device-event.js';
import type {
  BroadcastDevice,
  DeviceStatus,
  DeviceCapabilities,
  DeviceConfig,
  CreateDeviceRequest,
  UpdateDeviceRequest,
} from '../types/index.js';

export class DeviceManager {
  private deviceModel: DeviceModel;
  private deviceEventModel: DeviceEventModel;

  constructor(
    private db: DatabaseService,
    private logger: Logger
  ) {
    this.deviceModel = new DeviceModel(db, logger);
    this.deviceEventModel = new DeviceEventModel(db, logger);
  }

  /**
   * Enroll a new device (generate enrollment code and device UUID)
   * This is the first step before device registration
   */
  async enrollDevice(data: {
    name: string;
    roomLocation?: string;
    organizationId?: string;
  }): Promise<{
    deviceUuid: string;
    enrollmentCode: string;
  }> {
    // Generate device UUID (this is what the device will use to identify itself)
    const deviceUuid = uuidv4();

    // Generate enrollment code (short-lived code for initial registration)
    // Format: 8-character alphanumeric code
    const enrollmentCode = this.generateEnrollmentCode();

    // Store enrollment code temporarily (in memory or database)
    // For now, we'll just return it - the device must register immediately
    // In production, you might want to store this in a temporary table with expiration

    coreInfo('Device enrolled', {
      operation: 'broadcast-box:device:enrolled',
      deviceUuid,
      name: data.name,
    });

    return {
      deviceUuid,
      enrollmentCode,
    };
  }

  /**
   * Register a device (first connection after enrollment)
   */
  async registerDevice(
    data: CreateDeviceRequest & { enrollmentCode: string }
  ): Promise<BroadcastDevice> {
    // Validate enrollment code (in production, check against stored enrollment codes)
    // For now, we'll accept any enrollment code during development
    // TODO: Implement enrollment code validation

    // Check if device UUID already exists
    const existing = await this.deviceModel.getByDeviceUuid(data.deviceUuid);
    if (existing) {
      throw new Error(`Device with UUID ${data.deviceUuid} already registered`);
    }

    // Create device record
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

    const created = await this.deviceModel.create(device);

    // Log device registration event
    await this.deviceEventModel.create({
      id: uuidv4(),
      deviceId: created.id,
      eventType: 'device.registered',
      eventData: {
        name: created.name,
        roomLocation: created.roomLocation,
      },
    });

    coreInfo('Device registered', {
      operation: 'broadcast-box:device:registered',
      deviceId: created.id,
      deviceUuid: created.deviceUuid,
    });

    return created;
  }

  /**
   * Activate a device (change status from 'enrolled' to 'active')
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

    const updated = await this.deviceModel.update(deviceId, {
      status: 'active',
    });

    // Log activation event
    await this.deviceEventModel.create({
      id: uuidv4(),
      deviceId: updated.id,
      eventType: 'device.activated',
      eventData: {},
    });

    coreInfo('Device activated', {
      operation: 'broadcast-box:device:activated',
      deviceId: updated.id,
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
   * Generate enrollment code (8-character alphanumeric)
   */
  private generateEnrollmentCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing chars
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }
}
