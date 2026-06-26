/**
 * DeviceRoomHandler — session.manifest routing (BroadcastBox 4c).
 *
 * The device sends `{ type: 'session.manifest', payload: { session_id, capture } }`
 * over its WS room; the handler must delegate to SessionController so the capture
 * block (incl. segment-level visibility) lands on the CivicPress session record.
 * Here we exercise the routing/extraction directly (the full MessageContext +
 * auth path is integration-tested).
 */

import { describe, it, expect, vi } from 'vitest';
import { createDeviceRoomHandler } from '../realtime/device-room-handler.js';

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as any;

const deviceAuth = { deviceId: 'bb-001' } as any;

function makeHandler(sessionController?: any) {
  // Only logger + sessionController matter for manifest handling; the rest of
  // the config is unused on this path.
  return createDeviceRoomHandler({ logger, sessionController } as any);
}

describe('DeviceRoomHandler session.manifest routing', () => {
  it('delegates a valid manifest to SessionController.applySessionManifest', async () => {
    const applySessionManifest = vi.fn().mockResolvedValue(undefined);
    const handler = makeHandler({ applySessionManifest });

    const capture = {
      device: 'bb-001',
      segments: [
        { start: 0, end: 60, visibility: 'public' },
        { start: 60, end: 90, visibility: 'in_camera' },
      ],
    };
    await (handler as any).handleManifestMessage(
      { type: 'session.manifest', payload: { session_id: 'pv-1', capture } },
      deviceAuth
    );

    expect(applySessionManifest).toHaveBeenCalledWith('pv-1', capture);
  });

  it('ignores a manifest missing session_id or capture', async () => {
    const applySessionManifest = vi.fn();
    const handler = makeHandler({ applySessionManifest });

    await (handler as any).handleManifestMessage(
      { type: 'session.manifest', payload: { session_id: 'pv-1' } },
      deviceAuth
    );

    expect(applySessionManifest).not.toHaveBeenCalled();
  });

  it('does not throw when no SessionController is wired', async () => {
    const handler = makeHandler(undefined);
    await expect(
      (handler as any).handleManifestMessage(
        {
          type: 'session.manifest',
          payload: { session_id: 'pv-1', capture: { device: 'bb-001' } },
        },
        deviceAuth
      )
    ).resolves.toBeUndefined();
  });

  it('swallows a SessionController error (a manifest must not drop the connection)', async () => {
    const applySessionManifest = vi
      .fn()
      .mockRejectedValue(new Error('record not found'));
    const handler = makeHandler({ applySessionManifest });

    await expect(
      (handler as any).handleManifestMessage(
        {
          type: 'session.manifest',
          payload: { session_id: 'missing', capture: { device: 'bb-001' } },
        },
        deviceAuth
      )
    ).resolves.toBeUndefined();
    expect(applySessionManifest).toHaveBeenCalled();
  });
});
