/** Account rules shared by the screens and the server, so both always check the same thing. */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const MIN_PASSWORD_LENGTH = 10;

/** Minimum length of the reason an administrator gives for an account change. */
export const MIN_ADMIN_REASON_LENGTH = 5;

/** Why a new password is not acceptable, or null when it is. */
export function passwordProblem(password: string, email: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters`;
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return 'Use both letters and numbers';
  const local = email.split('@')[0].toLowerCase();
  if (local.length >= 3 && password.toLowerCase().includes(local)) return 'Do not include your email name in the password';
  return null;
}
