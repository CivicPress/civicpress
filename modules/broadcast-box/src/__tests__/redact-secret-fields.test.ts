/**
 * FA-BB-009 — credential fields must never reach logs or the persisted
 * `device_events` audit trail.
 */

import { describe, it, expect } from 'vitest';
import { redactSecretFields } from '../services/device-command-service.js';

describe('redactSecretFields (FA-BB-009)', () => {
  it('redacts the RTMP stream_key from a stream.configure payload', () => {
    const payload = {
      url: 'rtmp://live.example.com/app',
      stream_key: 'sk-super-secret',
      platform: 'generic',
    };

    expect(redactSecretFields(payload)).toEqual({
      url: 'rtmp://live.example.com/app',
      stream_key: '[REDACTED]',
      platform: 'generic',
    });
    // Input is not mutated.
    expect(payload.stream_key).toBe('sk-super-secret');
  });

  it('redacts nested and variant secret keys', () => {
    const input = {
      config: {
        streamKey: 'abc',
        token: 't',
        password: 'p',
        quality: '1080p',
      },
      list: [{ secret: 's', ok: 1 }],
    };

    expect(redactSecretFields(input)).toEqual({
      config: {
        streamKey: '[REDACTED]',
        token: '[REDACTED]',
        password: '[REDACTED]',
        quality: '1080p',
      },
      list: [{ secret: '[REDACTED]', ok: 1 }],
    });
  });

  it('passes primitives and null/undefined through', () => {
    expect(redactSecretFields(undefined)).toBeUndefined();
    expect(redactSecretFields(null)).toBeNull();
    expect(redactSecretFields('x')).toBe('x');
    expect(redactSecretFields(42)).toBe(42);
  });
});
