/**
 * deviceAuthMiddleware Unit Tests
 *
 * The HTTP device-auth middleware guards the upload routes. It mirrors the WS
 * device-auth path (validate token → load device → status check, via the shared
 * authenticateDeviceToken) and attaches the authenticated device to req.device.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { deviceAuthMiddleware } from '../middleware/device-auth.js';

function makeRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('deviceAuthMiddleware', () => {
  let deviceAuth: any;
  let deviceManager: any;
  let logger: any;
  let mw: (req: any, res: any, next: any) => Promise<void>;

  const activeDevice = {
    id: 'device-1',
    deviceUuid: 'uuid-1',
    organizationId: 'org-1',
    status: 'active',
  };

  beforeEach(() => {
    deviceAuth = { validateToken: vi.fn() };
    deviceManager = { getDeviceByUuid: vi.fn() };
    logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    mw = deviceAuthMiddleware(deviceAuth, deviceManager, logger);
  });

  it('rejects a request with no Authorization header (401 UNAUTHENTICATED)', async () => {
    const res = makeRes();
    const next = vi.fn();
    await mw({ headers: {} }, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'UNAUTHENTICATED' }),
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a non-Bearer scheme (401 INVALID_AUTH_SCHEME)', async () => {
    const res = makeRes();
    const next = vi.fn();
    await mw({ headers: { authorization: 'Basic abc123' } }, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'INVALID_AUTH_SCHEME' }),
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects an invalid token (401)', async () => {
    deviceAuth.validateToken.mockResolvedValue(null);
    const res = makeRes();
    const next = vi.fn();
    await mw({ headers: { authorization: 'Bearer bad' } }, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(deviceManager.getDeviceByUuid).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a valid token for an unknown device (401 DEVICE_NOT_FOUND)', async () => {
    deviceAuth.validateToken.mockResolvedValue({ deviceUuid: 'uuid-x' });
    deviceManager.getDeviceByUuid.mockResolvedValue(null);
    const res = makeRes();
    const next = vi.fn();
    await mw({ headers: { authorization: 'Bearer ok' } }, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'DEVICE_NOT_FOUND' }),
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a device whose status does not allow connections (401 INVALID_STATUS)', async () => {
    deviceAuth.validateToken.mockResolvedValue({ deviceUuid: 'uuid-1' });
    deviceManager.getDeviceByUuid.mockResolvedValue({
      ...activeDevice,
      status: 'revoked',
    });
    const res = makeRes();
    const next = vi.fn();
    await mw({ headers: { authorization: 'Bearer ok' } }, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'INVALID_STATUS' }),
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('authenticates a valid token + active device and attaches req.device', async () => {
    deviceAuth.validateToken.mockResolvedValue({ deviceUuid: 'uuid-1' });
    deviceManager.getDeviceByUuid.mockResolvedValue(activeDevice);
    const req: any = { headers: { authorization: 'Bearer good' } };
    const res = makeRes();
    const next = vi.fn();
    await mw(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(req.device).toEqual({
      deviceId: 'device-1',
      deviceUuid: 'uuid-1',
      organizationId: 'org-1',
    });
  });

  it('accepts an enrolled (not yet active) device', async () => {
    deviceAuth.validateToken.mockResolvedValue({ deviceUuid: 'uuid-1' });
    deviceManager.getDeviceByUuid.mockResolvedValue({
      ...activeDevice,
      status: 'enrolled',
    });
    const req: any = { headers: { authorization: 'Bearer good' } };
    const res = makeRes();
    const next = vi.fn();
    await mw(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.device?.deviceId).toBe('device-1');
  });
});
