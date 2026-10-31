import { randomBytes, scryptSync } from 'node:crypto';

/** The same format the app uses: scrypt$<salt>$<key>, both base64. */
export function hashPassword(password) {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('base64')}$${scryptSync(password, salt, 64).toString('base64')}`;
}
