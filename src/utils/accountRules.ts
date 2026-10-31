/** Account rules shared by the screens and the server, so both always check the same thing. */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const MIN_PASSWORD_LENGTH = 10;

/** Wrong passwords allowed before sign-in is locked, and how long the lock lasts. */
export const MAX_LOGIN_ATTEMPTS = 5;
export const LOGIN_LOCKOUT_MS = 5 * 60 * 1000;

/** Minimum length of the reason an administrator gives for an account change. */
export const MIN_ADMIN_REASON_LENGTH = 5;

/** Minimum length of the reason for reopening a locked CRF module (checked on the screen and on the server). */
export const MIN_EDIT_REASON_LENGTH = 10;

/** Why a new password is not acceptable, or null when it is. */
export function passwordProblem(password: string, email: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters`;
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return 'Use both letters and numbers';
  const local = email.split('@')[0].toLowerCase();
  if (local.length >= 3 && password.toLowerCase().includes(local)) return 'Do not include your email name in the password';
  return null;
}

/** A random starting password such as `Kx7m-Qw3p-Rt9z` (letters and numbers, no look-alike characters). */
export function generateTemporaryPassword(): string {
  const letters = 'abcdefghjkmnpqrstuvwxyzACDEFGHJKLMNPQRTUVWXYZ';
  const digits = '346789';
  const pick = (set: string) => set[crypto.getRandomValues(new Uint32Array(1))[0] % set.length];
  const chars = Array.from({ length: 12 }, () => pick(letters + digits));
  chars[crypto.getRandomValues(new Uint32Array(1))[0] % 12] = pick(digits);
  chars[(chars.findIndex((c) => digits.includes(c)) + 1) % 12] = pick(letters);
  return `${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8).join('')}`;
}
