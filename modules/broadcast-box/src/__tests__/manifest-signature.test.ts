/**
 * resolveManifestCapture (FA-BB-001 residual) — the signature/freshness matrix.
 */

import { describe, it, expect } from 'vitest';
import * as crypto from 'node:crypto';
import {
  isValidEd25519PublicKeyPem,
  resolveManifestCapture,
} from '../services/manifest-signature.js';

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const PEM = publicKey.export({ type: 'spki', format: 'pem' }).toString();

const CAPTURE = {
  device: 'bb-001',
  duration_s: 90,
  segments: [{ start: 0, end: 90, visibility: 'public' }],
};

function signedPayload(
  sessionId = 'pv-1',
  signedAt = new Date().toISOString(),
  key: crypto.KeyObject = privateKey
) {
  const manifest = JSON.stringify({
    session_id: sessionId,
    capture: CAPTURE,
    signed_at: signedAt,
  });
  return {
    session_id: sessionId,
    manifest,
    signature: crypto
      .sign(null, Buffer.from(manifest, 'utf8'), key)
      .toString('base64'),
    alg: 'ed25519',
  };
}

describe('isValidEd25519PublicKeyPem', () => {
  it('accepts a real Ed25519 SPKI PEM and rejects garbage/RSA', () => {
    expect(isValidEd25519PublicKeyPem(PEM)).toBe(true);
    expect(isValidEd25519PublicKeyPem('not a key')).toBe(false);
    const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    expect(
      isValidEd25519PublicKeyPem(
        rsa.publicKey.export({ type: 'spki', format: 'pem' }).toString()
      )
    ).toBe(false);
  });
});

describe('resolveManifestCapture', () => {
  it('verifies a valid signed manifest', () => {
    const result = resolveManifestCapture(signedPayload(), 'pv-1', PEM);
    expect(result.ok).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.capture).toEqual(CAPTURE);
  });

  it('key on record + unsigned payload → rejected', () => {
    const result = resolveManifestCapture(
      { session_id: 'pv-1', capture: CAPTURE },
      'pv-1',
      PEM
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/unsigned/);
  });

  it('tampered manifest bytes → rejected', () => {
    const payload = signedPayload();
    // Relabel the segment as public AFTER signing.
    payload.manifest = payload.manifest.replace('"public"', '"in_camera"');
    const result = resolveManifestCapture(payload, 'pv-1', PEM);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/invalid signature/);
  });

  it('wrong signer → rejected', () => {
    const other = crypto.generateKeyPairSync('ed25519');
    const result = resolveManifestCapture(
      signedPayload('pv-1', new Date().toISOString(), other.privateKey),
      'pv-1',
      PEM
    );
    expect(result.ok).toBe(false);
  });

  it('stale signed_at (replay) → rejected', () => {
    const old = new Date(Date.now() - 16 * 60 * 1000).toISOString();
    const result = resolveManifestCapture(signedPayload('pv-1', old), 'pv-1', PEM);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/stale/);
  });

  it('signed_at too far in the future → rejected', () => {
    const future = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const result = resolveManifestCapture(
      signedPayload('pv-1', future),
      'pv-1',
      PEM
    );
    expect(result.ok).toBe(false);
  });

  it('cross-session replay (signed pv-1, envelope pv-2) → rejected', () => {
    const result = resolveManifestCapture(signedPayload('pv-1'), 'pv-2', PEM);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/session_id/);
  });

  it('unsupported alg → rejected', () => {
    const payload = { ...signedPayload(), alg: 'none' };
    const result = resolveManifestCapture(payload, 'pv-1', PEM);
    expect(result.ok).toBe(false);
  });

  it('no key on record: unsigned capture accepted UNVERIFIED', () => {
    const result = resolveManifestCapture(
      { session_id: 'pv-1', capture: CAPTURE },
      'pv-1',
      null
    );
    expect(result.ok).toBe(true);
    expect(result.verified).toBe(false);
    expect(result.capture).toEqual(CAPTURE);
  });

  it('no key on record: signed envelope is parsed (still unverified)', () => {
    const result = resolveManifestCapture(signedPayload(), 'pv-1', null);
    expect(result.ok).toBe(true);
    expect(result.verified).toBe(false);
    expect(result.capture).toEqual(CAPTURE);
  });

  it('no capture anywhere → rejected', () => {
    const result = resolveManifestCapture({ session_id: 'pv-1' }, 'pv-1', null);
    expect(result.ok).toBe(false);
  });
});
