import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { env } from '../config/env.js';

const algorithm = 'aes-256-gcm';
const key = Buffer.from(env.CREDENTIAL_ENCRYPTION_KEY, 'hex');

export type EncryptedSecret = {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
};

export function encryptSecret(plaintext: string, organizationId: string): EncryptedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, key, iv);
  cipher.setAAD(Buffer.from(`org:${organizationId}:v1`, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

  return {
    ciphertext: ciphertext.toString('base64url'),
    iv: iv.toString('base64url'),
    authTag: cipher.getAuthTag().toString('base64url'),
    keyVersion: 1,
  };
}

export function decryptSecret(secret: EncryptedSecret, organizationId: string): string {
  if (secret.keyVersion !== 1) throw new Error('Unsupported credential key version');
  const decipher = createDecipheriv(algorithm, key, Buffer.from(secret.iv, 'base64url'));
  decipher.setAAD(Buffer.from(`org:${organizationId}:v1`, 'utf8'));
  decipher.setAuthTag(Buffer.from(secret.authTag, 'base64url'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(secret.ciphertext, 'base64url')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}
