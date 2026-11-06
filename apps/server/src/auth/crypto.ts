import { createHash, randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

// @node-rs/argon2 defaults to argon2id.
export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/** Opaque session token handed to the browser; only its SHA-256 is stored. */
export function newSessionToken(): { token: string; tokenHash: Buffer } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

let dummyHash: Promise<string> | undefined;
/** Verified against when the email is unknown, so login timing does not reveal accounts. */
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword('not-a-real-password');
  return dummyHash;
}
