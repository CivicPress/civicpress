import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import http from 'http';
import type { AddressInfo } from 'net';
import { DeviceRegistrationRateLimiter } from '../middleware/rate-limiter.js';

/**
 * The limiter on device registration allows 5 attempts per address per 15
 * minutes. It took the address from the FIRST entry of `X-Forwarded-For`,
 * which is whatever the client sent: a proxy appends to that header. Every
 * request that named a new address got a new allowance.
 *
 * These run a real Express application and send real requests, because the
 * question is what address EXPRESS resolves — a hand-built `req` would only
 * prove the test's own assumptions.
 */
describe('DeviceRegistrationRateLimiter', () => {
  const logger = {
    warn: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  } as never;
  const savedEnv = process.env.NODE_ENV;
  let server: http.Server | undefined;
  let limiter: DeviceRegistrationRateLimiter | undefined;

  beforeEach(() => {
    // The middleware steps aside under NODE_ENV=test.
    process.env.NODE_ENV = 'development';
  });

  afterEach(async () => {
    process.env.NODE_ENV = savedEnv;
    (limiter as unknown as { destroy?: () => void })?.destroy?.();
    const interval = (limiter as unknown as { cleanupInterval: NodeJS.Timeout })
      ?.cleanupInterval;
    if (interval) clearInterval(interval);
    await new Promise<void>((resolve) =>
      server ? server.close(() => resolve()) : resolve()
    );
    server = undefined;
  });

  const start = async (trustProxy: boolean) => {
    limiter = new DeviceRegistrationRateLimiter(logger);
    const app = express();
    if (trustProxy) app.set('trust proxy', 1);
    app.use(express.json());
    app.post('/register', limiter.middleware(), (_req, res) => {
      res.json({ success: true });
    });
    server = await new Promise<http.Server>((resolve) => {
      const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    const { port } = server.address() as AddressInfo;

    return async (
      headers: Record<string, string> = {},
      body: Record<string, unknown> = {}
    ) => {
      const response = await fetch(`http://127.0.0.1:${port}/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
      });
      return response.status;
    };
  };

  it('allows five attempts from one address, and refuses the sixth', async () => {
    const send = await start(false);

    const statuses = [];
    for (let i = 0; i < 6; i++) statuses.push(await send());

    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
  });

  it('is not reset by a forwarded-for header the client wrote', async () => {
    // Exposed directly, nothing is trusted: the address is the socket's.
    const send = await start(false);

    const statuses = [];
    for (let i = 0; i < 8; i++) {
      statuses.push(await send({ 'x-forwarded-for': `203.0.113.${i}` }));
    }

    expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(statuses.slice(5)).toEqual([429, 429, 429]);
  });

  it('is not reset by x-real-ip either', async () => {
    const send = await start(false);

    const statuses = [];
    for (let i = 0; i < 6; i++) {
      statuses.push(await send({ 'x-real-ip': `203.0.113.${i}` }));
    }

    expect(statuses[5]).toBe(429);
  });

  it('behind a trusted proxy, counts by the address the PROXY reported', async () => {
    // The proxy appends the address it saw, so with one trusted hop the
    // entry that counts is the LAST one. The client controls the rest.
    const send = await start(true);

    const statuses = [];
    for (let i = 0; i < 6; i++) {
      statuses.push(
        await send({ 'x-forwarded-for': `10.9.9.${i}, 198.51.100.7` })
      );
    }
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);

    // A different client, through the same proxy, has its own allowance.
    expect(await send({ 'x-forwarded-for': '10.9.9.1, 198.51.100.8' })).toBe(
      200
    );
  });

  it('allows three attempts per enrollment code, from any address', async () => {
    const send = await start(true);
    const from = (n: number) => ({ 'x-forwarded-for': `198.51.100.${n}` });
    const code = { enrollmentCode: 'ABCD-EFGH-JKLM' };

    expect(await send(from(1), code)).toBe(200);
    expect(await send(from(2), code)).toBe(200);
    expect(await send(from(3), code)).toBe(200);
    expect(await send(from(4), code)).toBe(429);
  });

  it('does not keep a key as long as the client cares to make it', async () => {
    const send = await start(true);

    await send(
      { 'x-forwarded-for': '198.51.100.1' },
      { enrollmentCode: 'X'.repeat(50_000) }
    );

    const keys = [
      ...(
        limiter as unknown as { codeLimits: Map<string, unknown> }
      ).codeLimits.keys(),
    ];
    expect(keys).toHaveLength(1);
    expect(keys[0].length).toBeLessThan(100);
  });

  it('ignores an enrollment code that is not a string', async () => {
    const send = await start(true);

    const status = await send(
      { 'x-forwarded-for': '198.51.100.1' },
      { enrollmentCode: { $ne: null } }
    );

    expect(status).toBe(200);
    expect(
      (limiter as unknown as { codeLimits: Map<string, unknown> }).codeLimits
        .size
    ).toBe(0);
  });
});
