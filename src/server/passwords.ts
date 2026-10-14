import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

/** Session and setup-link tokens are stored only as this hash. */
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** scrypt with a per-user salt, stored as `scrypt$<salt>$<key>`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  // Compare against a dummy hash when the account is missing, so timing doesn't reveal which emails exist.
  const [scheme, saltB64, keyB64] = (stored ?? 'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$').split('$');
  if (scheme !== 'scrypt') return false;
  const expected = Buffer.from(keyB64 ?? '', 'base64');
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), 64);
  return stored !== null && expected.length === actual.length && timingSafeEqual(expected, actual);
}
