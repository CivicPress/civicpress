/**
 * session.manifest signature verification (FA-BB-001 residual).
 *
 * The FA-BB-001 ownership check ties a manifest to the AUTHENTICATED device
 * (bearer token). This adds the cryptographic layer: a device that registered
 * an Ed25519 public key at enrollment signs every manifest with the matching
 * private key (which never leaves the device), so a stolen/leaked bearer
 * token alone can no longer forge capture segments — the visibility labels
 * the redaction + transcription pipelines trust.
 *
 * Wire format (signed):
 *   payload = {
 *     session_id: string,
 *     manifest:   string,   // the EXACT JSON string the device signed:
 *                           //   {"session_id":…,"capture":{…},"signed_at":"ISO"}
 *     signature:  string,   // base64 Ed25519 signature over utf8(manifest)
 *     alg:        'ed25519',
 *   }
 *
 * Signing the byte-string the device sent (instead of re-canonicalizing a
 * parsed object) removes every cross-language canonicalization pitfall
 * (float formatting, key order). The parsed manifest's own session_id must
 * match the envelope's, and `signed_at` must be fresh (anti-replay).
 *
 * Legacy form ({ session_id, capture }) is accepted ONLY for devices with no
 * registered key — once a key is on record, unsigned manifests are dropped.
 */

import * as crypto from 'node:crypto';

/** Reject manifests signed longer ago than this (replay containment). */
const MAX_SIGNATURE_AGE_MS = 15 * 60 * 1000;
/** Tolerate modest device clock skew ahead of the server. */
const MAX_CLOCK_SKEW_AHEAD_MS = 2 * 60 * 1000;

export interface ManifestCaptureResult {
  ok: boolean;
  /** The capture block to apply (only when ok). */
  capture?: Record<string, unknown>;
  /** True when a valid device signature covered the capture. */
  verified: boolean;
  reason?: string;
}

/** Validate a PEM/SPKI Ed25519 public key (used at registration time). */
export function isValidEd25519PublicKeyPem(pem: string): boolean {
  try {
    const key = crypto.createPublicKey(pem);
    return key.asymmetricKeyType === 'ed25519';
  } catch {
    return false;
  }
}

/**
 * Resolve (and, when a key is registered, verify) the capture block of a
 * `session.manifest` payload.
 *
 * @param payload          The message payload as received.
 * @param expectedSessionId The CivicPress session record id the envelope names.
 * @param publicKeyPem     The device's registered key, or null/undefined.
 */
export function resolveManifestCapture(
  payload: Record<string, any>,
  expectedSessionId: string,
  publicKeyPem: string | null | undefined,
  nowMs: number = Date.now()
): ManifestCaptureResult {
  const signed =
    typeof payload?.manifest === 'string' &&
    typeof payload?.signature === 'string';

  if (!publicKeyPem) {
    // No key on record: legacy devices. Accept the unsigned capture (or the
    // inner capture of a signed envelope we cannot verify) — the FA-BB-001
    // ownership check still applies upstream.
    if (signed) {
      const parsed = parseManifest(payload.manifest, expectedSessionId, nowMs);
      if (!parsed.ok) return { ok: false, verified: false, reason: parsed.reason };
      return { ok: true, capture: parsed.capture, verified: false };
    }
    if (payload?.capture && typeof payload.capture === 'object') {
      return { ok: true, capture: payload.capture, verified: false };
    }
    return { ok: false, verified: false, reason: 'no capture in payload' };
  }

  // Key on record → the signature is MANDATORY.
  if (!signed) {
    return {
      ok: false,
      verified: false,
      reason: 'device has a registered signing key but the manifest is unsigned',
    };
  }
  if (payload.alg !== 'ed25519') {
    return { ok: false, verified: false, reason: `unsupported alg '${payload.alg}'` };
  }

  let signatureOk = false;
  try {
    signatureOk = crypto.verify(
      null,
      Buffer.from(payload.manifest, 'utf8'),
      crypto.createPublicKey(publicKeyPem),
      Buffer.from(payload.signature, 'base64')
    );
  } catch (error) {
    return {
      ok: false,
      verified: false,
      reason: `signature verification errored: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
  if (!signatureOk) {
    return { ok: false, verified: false, reason: 'invalid signature' };
  }

  const parsed = parseManifest(payload.manifest, expectedSessionId, nowMs);
  if (!parsed.ok) return { ok: false, verified: false, reason: parsed.reason };
  return { ok: true, capture: parsed.capture, verified: true };
}

function parseManifest(
  manifestJson: string,
  expectedSessionId: string,
  nowMs: number
):
  | { ok: true; capture: Record<string, unknown> }
  | { ok: false; reason: string } {
  let manifest: Record<string, any>;
  try {
    manifest = JSON.parse(manifestJson);
  } catch {
    return { ok: false, reason: 'manifest is not valid JSON' };
  }
  if (manifest?.session_id !== expectedSessionId) {
    // The signed content must name the SAME session as the envelope — else a
    // valid signature for session A could be replayed against session B.
    return { ok: false, reason: 'signed session_id does not match envelope' };
  }
  if (!manifest?.capture || typeof manifest.capture !== 'object') {
    return { ok: false, reason: 'signed manifest has no capture block' };
  }
  const signedAtMs = Date.parse(manifest?.signed_at ?? '');
  if (!Number.isFinite(signedAtMs)) {
    return { ok: false, reason: 'signed manifest has no valid signed_at' };
  }
  if (nowMs - signedAtMs > MAX_SIGNATURE_AGE_MS) {
    return { ok: false, reason: 'signed manifest is stale (possible replay)' };
  }
  if (signedAtMs - nowMs > MAX_CLOCK_SKEW_AHEAD_MS) {
    return { ok: false, reason: 'signed_at is in the future' };
  }
  return { ok: true, capture: manifest.capture };
}
