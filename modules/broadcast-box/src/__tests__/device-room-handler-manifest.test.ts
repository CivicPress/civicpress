/**
 * DeviceRoomHandler — session.manifest routing (BroadcastBox 4c) + FA-BB-001
 * device-ownership enforcement.
 *
 * The device sends `{ type: 'session.manifest', payload: { session_id, capture } }`
 * over its WS room; the handler must delegate to SessionController so the capture
 * block (incl. segment-level visibility) lands on the CivicPress session record —
 * but ONLY when the calling device owns that session (FA-BB-001). Here we exercise
 * the routing/extraction/ownership directly (the full MessageContext + auth path
 * is integration-tested).
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

/**
 * Build a SessionController mock. `owner` is the deviceId
 * getSessionByCivicPressId resolves to (undefined = no session found).
 */
function makeController(opts: {
  owner?: string | null;
  applySessionManifest?: any;
}) {
  const applySessionManifest =
    opts.applySessionManifest ?? vi.fn().mockResolvedValue(undefined);
  const getSessionByCivicPressId = vi
    .fn()
    .mockResolvedValue(
      opts.owner === undefined ? { deviceId: 'bb-001' } : opts.owner === null ? null : { deviceId: opts.owner }
    );
  return { applySessionManifest, getSessionByCivicPressId };
}

function makeHandler(sessionController?: any) {
  // Only logger + sessionController matter for manifest handling; the rest of
  // the config is unused on this path.
  return createDeviceRoomHandler({ logger, sessionController } as any);
}

const capture = {
  device: 'bb-001',
  segments: [
    { start: 0, end: 60, visibility: 'public' },
    { start: 60, end: 90, visibility: 'in_camera' },
  ],
};

describe('DeviceRoomHandler session.manifest routing', () => {
  it('delegates a valid manifest from the owning device to applySessionManifest', async () => {
    const controller = makeController({ owner: 'bb-001' });
    const handler = makeHandler(controller);

    await (handler as any).handleManifestMessage(
      { type: 'session.manifest', payload: { session_id: 'pv-1', capture } },
      deviceAuth
    );

    expect(controller.getSessionByCivicPressId).toHaveBeenCalledWith('pv-1');
    expect(controller.applySessionManifest).toHaveBeenCalledWith('pv-1', capture);
  });

  it('ignores a manifest missing session_id or capture', async () => {
    const controller = makeController({ owner: 'bb-001' });
    const handler = makeHandler(controller);

    await (handler as any).handleManifestMessage(
      { type: 'session.manifest', payload: { session_id: 'pv-1' } },
      deviceAuth
    );

    expect(controller.applySessionManifest).not.toHaveBeenCalled();
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

  it('FA-BB-001: rejects a manifest for a session owned by a DIFFERENT device', async () => {
    const controller = makeController({ owner: 'bb-999' });
    const handler = makeHandler(controller);

    await (handler as any).handleManifestMessage(
      { type: 'session.manifest', payload: { session_id: 'pv-1', capture } },
      deviceAuth
    );

    expect(controller.getSessionByCivicPressId).toHaveBeenCalledWith('pv-1');
    expect(controller.applySessionManifest).not.toHaveBeenCalled();
  });

  it('FA-BB-001: rejects a manifest when no broadcast session is found', async () => {
    const controller = makeController({ owner: null });
    const handler = makeHandler(controller);

    await (handler as any).handleManifestMessage(
      { type: 'session.manifest', payload: { session_id: 'ghost', capture } },
      deviceAuth
    );

    expect(controller.applySessionManifest).not.toHaveBeenCalled();
  });

  it('swallows a SessionController error (a manifest must not drop the connection)', async () => {
    const controller = makeController({
      owner: 'bb-001',
      applySessionManifest: vi.fn().mockRejectedValue(new Error('record not found')),
    });
    const handler = makeHandler(controller);

    await expect(
      (handler as any).handleManifestMessage(
        {
          type: 'session.manifest',
          payload: { session_id: 'pv-1', capture: { device: 'bb-001' } },
        },
        deviceAuth
      )
    ).resolves.toBeUndefined();
    expect(controller.applySessionManifest).toHaveBeenCalled();
  });
});
