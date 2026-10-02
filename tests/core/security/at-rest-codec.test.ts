import { describe, it, expect } from 'vitest';
import { randomBytes } from 'crypto';
import {
  AtRestCodec,
  AT_REST_MARKER,
} from '../../../core/src/security/at-rest-codec.js';

// `security.encrypt_sensitive_data` — the operator inbox's body and data are
// sealed at rest with this.

const key = randomBytes(32);

describe('AtRestCodec', () => {
  it('seals and unseals a value, and marks what it sealed', () => {
    const codec = new AtRestCodec(key);
    const sealed = codec.encrypt('reset requested by j@town.example');
    expect(sealed.startsWith(AT_REST_MARKER)).toBe(true);
    expect(sealed).not.toContain('town.example');
    expect(AtRestCodec.isEncrypted(sealed)).toBe(true);
    expect(codec.decrypt(sealed)).toBe('reset requested by j@town.example');
  });

  it('uses a fresh nonce every time, so equal values do not look equal', () => {
    const codec = new AtRestCodec(key);
    expect(codec.encrypt('same')).not.toBe(codec.encrypt('same'));
  });

  it('returns a value without the marker as it is — a row from before encryption', () => {
    const codec = new AtRestCodec(key);
    expect(codec.decrypt('plain text from 2026-08')).toBe(
      'plain text from 2026-08'
    );
    expect(AtRestCodec.isEncrypted('plain text')).toBe(false);
    expect(AtRestCodec.isEncrypted(null)).toBe(false);
  });

  it('refuses a sealed value that was altered or sealed under another secret', () => {
    const codec = new AtRestCodec(key);
    const sealed = codec.encrypt('body');
    const tampered =
      sealed.slice(0, -4) + (sealed.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    expect(() => codec.decrypt(tampered)).toThrow();
    expect(() => new AtRestCodec(randomBytes(32)).decrypt(sealed)).toThrow();
    expect(() => codec.decrypt(`${AT_REST_MARKER}c2hvcnQ=`)).toThrow(
      /too short/
    );
  });

  it('needs a 256-bit key', () => {
    expect(() => new AtRestCodec(randomBytes(16))).toThrow(/32 bytes/);
  });
});
