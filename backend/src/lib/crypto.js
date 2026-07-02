/**
 * Symmetric encryption for sensitive values stored in the database.
 *
 * Used to encrypt Plaid access_tokens at rest.
 * Algorithm: AES-256-GCM (authenticated encryption — detects tampering).
 *
 * Env: PLAID_TOKEN_KEY — 32-byte (64 hex chars) random key.
 * Generate one: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_HEX = process.env.PLAID_TOKEN_KEY;

function getKey() {
  if (!KEY_HEX || KEY_HEX.length !== 64) {
    throw new Error('PLAID_TOKEN_KEY must be a 64-character hex string (32 bytes). ' +
      'Generate: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  }
  return Buffer.from(KEY_HEX, 'hex');
}

/**
 * Encrypt a plaintext string.
 * Returns a single base64 string: iv(12 bytes) + authTag(16 bytes) + ciphertext.
 * All three components are needed for decryption.
 */
export function encrypt(plaintext) {
  const key = getKey();
  const iv = randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Pack as: [iv (12)] [authTag (16)] [ciphertext (variable)]
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

/**
 * Decrypt a value produced by encrypt().
 * Throws if the key is wrong or the data has been tampered with (GCM auth tag check).
 */
export function decrypt(encoded) {
  const key = getKey();
  const buf = Buffer.from(encoded, 'base64');
  const iv = buf.slice(0, 12);
  const authTag = buf.slice(12, 28);
  const ciphertext = buf.slice(28);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
