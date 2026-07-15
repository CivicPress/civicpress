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
import * as crypto from 'node:crypto';
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

function makeHandler(sessionController?: any, device: any = {}) {
  // logger + sessionController + deviceManager (for the FA-BB-001 signing-key
  // lookup) matter for manifest handling; the rest of the config is unused.
  const deviceManager = {
    getDevice: vi.fn().mockResolvedValue(device),
  };
  return createDeviceRoomHandler({
    logger,
    sessionController,
    deviceManager,
  } as any);
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

describe('DeviceRoomHandler session.manifest signing (FA-BB-001 residual)', () => {
  const { generateKeyPairSync, sign } = crypto;
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey
    .export({ type: 'spki', format: 'pem' })
    .toString();

  function signedPayload(sessionId: string, captureBlock: any) {
    const manifest = JSON.stringify({
      session_id: sessionId,
      capture: captureBlock,
      signed_at: new Date().toISOString(),
    });
    return {
      session_id: sessionId,
      manifest,
      signature: sign(null, Buffer.from(manifest, 'utf8'), privateKey).toString(
        'base64'
      ),
      alg: 'ed25519',
    };
  }

  it('accepts a correctly signed manifest from a keyed device', async () => {
    const controller = makeController({ owner: 'bb-001' });
    const handler = makeHandler(controller, { publicKey: publicKeyPem });

    await (handler as any).handleManifestMessage(
      { type: 'session.manifest', payload: signedPayload('pv-1', capture) },
      deviceAuth
    );

    expect(controller.applySessionManifest).toHaveBeenCalledWith(
      'pv-1',
      capture
    );
  });

  it('drops an UNSIGNED manifest once the device has a registered key', async () => {
    const controller = makeController({ owner: 'bb-001' });
    const handler = makeHandler(controller, { publicKey: publicKeyPem });

    await (handler as any).handleManifestMessage(
      { type: 'session.manifest', payload: { session_id: 'pv-1', capture } },
      deviceAuth
    );

    expect(controller.applySessionManifest).not.toHaveBeenCalled();
  });

  it('drops a manifest signed by a DIFFERENT key', async () => {
    const other = generateKeyPairSync('ed25519');
    const payload = signedPayload('pv-1', capture);
    payload.signature = sign(
      null,
      Buffer.from(payload.manifest, 'utf8'),
      other.privateKey
    ).toString('base64');

    const controller = makeController({ owner: 'bb-001' });
    const handler = makeHandler(controller, { publicKey: publicKeyPem });

    await (handler as any).handleManifestMessage(
      { type: 'session.manifest', payload },
      deviceAuth
    );

    expect(controller.applySessionManifest).not.toHaveBeenCalled();
  });

  it('drops a validly signed manifest replayed against another session', async () => {
    // Signature is valid, but the SIGNED content names pv-1 while the
    // envelope targets pv-2 — a cross-session replay.
    const payload = { ...signedPayload('pv-1', capture), session_id: 'pv-2' };
    const controller = makeController({ owner: 'bb-001' });
    const handler = makeHandler(controller, { publicKey: publicKeyPem });

    await (handler as any).handleManifestMessage(
      { type: 'session.manifest', payload },
      deviceAuth
    );

    expect(controller.applySessionManifest).not.toHaveBeenCalled();
  });

  it('still accepts unsigned manifests from a LEGACY device (no key on record)', async () => {
    const controller = makeController({ owner: 'bb-001' });
    const handler = makeHandler(controller, { publicKey: undefined });

    await (handler as any).handleManifestMessage(
      { type: 'session.manifest', payload: { session_id: 'pv-1', capture } },
      deviceAuth
    );

    expect(controller.applySessionManifest).toHaveBeenCalledWith(
      'pv-1',
      capture
    );
  });
});
