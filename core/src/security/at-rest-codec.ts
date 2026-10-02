// Symmetric at-rest encryption for columns that hold what an operator should
// not read off a database file: AES-256-GCM under a key derived from the
// instance secret (`SecretsManager.deriveKey`), one random nonce per value.
//
// Values carry a marker so a column can hold both encrypted and plain rows
// while an instance migrates: anything without the marker is returned as it
// is. That is what lets `encrypt_sensitive_data` be switched on over an
// inbox that already has rows.
import * as crypto from 'crypto';

export const AT_REST_MARKER = 'enc:v1:';
const ALGORITHM = 'aes-256-gcm';
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

export class AtRestCodec {
  constructor(private readonly key: Buffer) {
    if (key.length !== 32) {
      throw new Error(
        `[AtRestCodec] key must be 32 bytes for ${ALGORITHM}, got ${key.length}`
      );
    }
  }

  static isEncrypted(value: string | null | undefined): boolean {
    return typeof value === 'string' && value.startsWith(AT_REST_MARKER);
  }

  /** `enc:v1:` + base64(nonce ‖ tag ‖ ciphertext). */
  encrypt(plain: string): string {
    const nonce = crypto.randomBytes(NONCE_BYTES);
    const cipher = crypto.createCipheriv(ALGORITHM, this.key, nonce);
    const ciphertext = Buffer.concat([
      cipher.update(plain, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return (
      AT_REST_MARKER +
      Buffer.concat([nonce, tag, ciphertext]).toString('base64')
    );
  }

  /**
   * The plaintext of an encrypted value. A value without the marker is
   * returned unchanged (a row from before encryption was switched on). A
   * marked value that does not authenticate throws — it was altered, or
   * written under another instance secret.
   */
  decrypt(value: string): string {
    if (!AtRestCodec.isEncrypted(value)) return value;
    const payload = Buffer.from(value.slice(AT_REST_MARKER.length), 'base64');
    if (payload.length < NONCE_BYTES + TAG_BYTES) {
      throw new Error(
        '[AtRestCodec] value is too short to be a sealed payload'
      );
    }
    const nonce = payload.subarray(0, NONCE_BYTES);
    const tag = payload.subarray(NONCE_BYTES, NONCE_BYTES + TAG_BYTES);
    const ciphertext = payload.subarray(NONCE_BYTES + TAG_BYTES);
    const decipher = crypto.createDecipheriv(ALGORITHM, this.key, nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');
  }
}
