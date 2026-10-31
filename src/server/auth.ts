import { randomBytes } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { ApiError } from './errors';
import { hashPassword, hashToken, verifyPassword } from './passwords';
import { reader, withTransaction } from './mongo/tx';
import { LOGIN_LOCKOUT_MS, MAX_LOGIN_ATTEMPTS, passwordProblem } from '../utils/accountRules';
import { roleLabel, type Actor } from '../data/roles';
import { customRoleLabels, roleAccess } from './roles';
import type { ModuleId } from '../types/crf';

/*
 * Local stand-in for sign-in until Google Identity Platform is connected. The rest of the server only
 * depends on `getSessionUser()`, so swapping the identity provider later does not touch the data layer.
 */

export const SESSION_COOKIE = 'smarttb_session';
export const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_SESSION_MS = 12 * 60 * 60 * 1000;
const TOUCH_EVERY_MS = 60 * 1000;
const MAX_ATTEMPTS = MAX_LOGIN_ATTEMPTS;
const LOCKOUT_MS = LOGIN_LOCKOUT_MS;

export interface SessionUser extends Actor {
  id: string;
  email: string;
  name: string;
  roleLabel: string;
  /** Signed in with a temporary password: the only thing allowed is choosing a new one. */
  mustChangePassword: boolean;
}

// ---------------------------------------------------------------------------
// Sessions (random token in an httpOnly cookie; only its hash is stored)
// ---------------------------------------------------------------------------

/** An account as stored (`_id` is the account id). */
interface UserDoc {
  _id: string;
  email: string;
  display_name: string;
  role: string;
  is_admin: boolean;
  password_hash: string | null;
  active: boolean;
  must_change_password: boolean;
}

interface SessionDoc {
  _id: string;
  user_id: string;
  created_at: Date;
  last_active_at: Date;
}

interface AttemptDoc {
  _id: string;
  fails: number;
  locked_until: Date | null;
}

/** Today as YYYY-MM-DD (UTC), the form delegation end dates are stored in. */
const todayISO = () => new Date().toISOString().slice(0, 10);

async function loadDelegations(userId: string): Promise<ModuleId[]> {
  const rows = await reader.find<{ module_id: number }>(
    'module_delegations',
    { user_id: userId, $or: [{ expires_at: null }, { expires_at: { $gte: todayISO() } }] },
    { sort: { module_id: 1 }, projection: { module_id: 1 } },
  );
  return rows.map((r) => r.module_id as ModuleId);
}

async function toSessionUser(row: UserDoc): Promise<SessionUser> {
  const access = await roleAccess(reader, row.role);
  return {
    id: row._id,
    email: row.email,
    name: row.display_name,
    role: row.role,
    roleLabel: access.label,
    entryModules: access.modules,
    isAdmin: row.is_admin,
    delegations: await loadDelegations(row._id),
    mustChangePassword: row.must_change_password === true,
  };
}

export type SignInOutcome =
  | { ok: true; user: SessionUser }
  | { ok: false; error: string; locked?: boolean; lockedForMs?: number };

/** Counts one more wrong attempt for an email (kept even though the request then fails), locking it at the limit. */
async function recordFailure(email: string): Promise<{ locked: boolean; left: number }> {
  return withTransaction({}, async (tx) => {
    const attempt = await tx.findOne<AttemptDoc>('login_attempts', { _id: email as never });
    const lockedUntil = attempt?.locked_until?.getTime() ?? 0;
    const fails = (lockedUntil ? 0 : (attempt?.fails ?? 0)) + 1;
    const locked = fails >= MAX_ATTEMPTS;
    await tx.updateOne(
      'login_attempts',
      { _id: email as never },
      { $set: { fails, locked_until: locked ? new Date(Date.now() + LOCKOUT_MS) : null } },
      { upsert: true },
    );
    return { locked, left: MAX_ATTEMPTS - fails };
  });
}

export async function signIn(emailRaw: string, password: string): Promise<SignInOutcome> {
  const email = emailRaw.trim().toLowerCase();

  const attempt = await reader.findOne<AttemptDoc>('login_attempts', { _id: email as never });
  const lockedUntil = attempt?.locked_until?.getTime() ?? 0;
  if (lockedUntil > Date.now()) {
    const ms = lockedUntil - Date.now();
    const mins = Math.ceil(ms / 60000);
    return { ok: false, locked: true, lockedForMs: ms, error: `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.` };
  }

  const row = await reader.findOne<UserDoc>('app_users', { email });
  const valid = await verifyPassword(password, row?.password_hash ?? null);

  if (!row || !row.active || !valid) {
    const { locked, left } = await recordFailure(email);
    if (locked) return { ok: false, locked: true, lockedForMs: LOCKOUT_MS, error: 'Too many failed attempts. Sign-in is locked for 5 minutes.' };
    return { ok: false, error: `Incorrect email or password. ${left} attempt${left === 1 ? '' : 's'} remaining.` };
  }

  return { ok: true, user: await startSession(row, email, 'SIGN_IN') };
}

async function startSession(row: UserDoc, email: string, action: 'SIGN_IN' | 'TEST_SIGN_IN'): Promise<SessionUser> {
  const token = randomBytes(32).toString('base64url');
  const userAgent = (await headers()).get('user-agent')?.slice(0, 300) ?? null;
  await withTransaction({ userId: row._id }, async (tx) => {
    const now = new Date();
    await tx.deleteMany('login_attempts', { _id: email as never });
    await tx.updateOne('app_users', { _id: row._id as never }, { $set: { last_sign_in_at: now } });
    await tx.insertOne('sessions', { _id: hashToken(token), user_id: row._id, created_at: now, last_active_at: now, user_agent: userAgent });
    await tx.record('sessions', row._id, action);
  });

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    // HTTPS-only cookie in production. COOKIE_SECURE=false allows testing over plain http by IP before a domain exists.
    secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_SESSION_MS / 1000,
  });
  return toSessionUser(row);
}

// ---------------------------------------------------------------------------
// Testing phase only: one-tap sign-in to the test accounts, without a password
// ---------------------------------------------------------------------------

/** Test accounts use this email domain; one-tap sign-in never works for anyone else. */
const TEST_ACCOUNT_DOMAIN = '@smarttb.study';

/** Switched on by ALLOW_TEST_LOGIN=true. Must be off before any real participant data is entered. */
export function testLoginEnabled(): boolean {
  return process.env.ALLOW_TEST_LOGIN === 'true';
}

export async function listTestAccounts(): Promise<{ email: string; name: string; roleLabel: string; isAdmin: boolean }[]> {
  if (!testLoginEnabled()) return [];
  const rows = await reader.find<UserDoc>(
    'app_users',
    { active: true, email: { $regex: `${TEST_ACCOUNT_DOMAIN.replace('.', '\\.')}$` } },
    { sort: { is_admin: -1, email: 1 } },
  );
  const custom = await customRoleLabels(reader);
  return rows.map((r) => ({
    email: r.email,
    name: r.display_name,
    roleLabel: roleLabel(r.role, custom),
    isAdmin: r.is_admin,
  }));
}

export async function signInAsTestAccount(emailRaw: string): Promise<SignInOutcome> {
  const email = emailRaw.trim().toLowerCase();
  if (!testLoginEnabled() || !email.endsWith(TEST_ACCOUNT_DOMAIN)) return { ok: false, error: 'Test sign-in is not available' };
  const row = await reader.findOne<UserDoc>('app_users', { email, active: true });
  if (!row) return { ok: false, error: 'Test account not found' };
  return { ok: true, user: await startSession(row, email, 'TEST_SIGN_IN') };
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await withTransaction({}, async (tx) => {
      const session = await tx.deleteOne('sessions', { _id: hashToken(token) as never });
      if (session) await tx.record('sessions', String(session.user_id), 'SIGN_OUT', [], { actor: String(session.user_id) });
    });
  }
  jar.delete(SESSION_COOKIE);
}

/**
 * The signed-in person chooses a new password. Needs the current one, so a borrowed session cannot change it.
 * Wrong current passwords count towards the same lockout as sign-in. Other sessions for the account end.
 */
export async function changeOwnPassword(user: SessionUser, currentPassword: string, newPassword: string): Promise<void> {
  const lock = await reader.findOne<AttemptDoc>('login_attempts', { _id: user.email as never });
  const lockedUntil = lock?.locked_until?.getTime() ?? 0;
  if (lockedUntil > Date.now()) {
    const mins = Math.ceil((lockedUntil - Date.now()) / 60000);
    throw new ApiError(429, `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`);
  }

  const row = await reader.findOne<UserDoc>('app_users', { _id: user.id as never }, { projection: { password_hash: 1 } });
  if (!(await verifyPassword(currentPassword, row?.password_hash ?? null))) {
    await recordFailure(user.email);
    throw new ApiError(400, 'The current password is not correct');
  }
  const problem = passwordProblem(newPassword, user.email);
  if (problem) throw new ApiError(400, problem);
  if (newPassword === currentPassword) throw new ApiError(400, 'Choose a password different from the current one');

  const keep = hashToken((await cookies()).get(SESSION_COOKIE)?.value ?? '');
  const hash = await hashPassword(newPassword);
  await withTransaction({ userId: user.id, reason: 'Password changed by the user' }, async (tx) => {
    await tx.updateOne('app_users', { _id: user.id as never }, { $set: { password_hash: hash, must_change_password: false, updated_at: new Date() } });
    await tx.deleteMany('sessions', { user_id: user.id, _id: { $ne: keep } as never });
    await tx.deleteMany('login_attempts', { _id: user.email as never });
    await tx.record('app_users', user.id, 'PASSWORD_CHANGED');
  });
}

/** The signed-in user for this request, or null when signed out, idle too long, or deactivated. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const tokenHash = hashToken(token);
  const session = await reader.findOne<SessionDoc>('sessions', { _id: tokenHash as never });
  if (!session) return null;
  const row = await reader.findOne<UserDoc>('app_users', { _id: session.user_id as never });
  if (!row) return null;

  const now = Date.now();
  const expired = !row.active || now - session.last_active_at.getTime() > IDLE_TIMEOUT_MS || now - session.created_at.getTime() > MAX_SESSION_MS;
  if (expired) {
    await withTransaction({}, (tx) => tx.deleteMany('sessions', { _id: tokenHash as never }));
    return null;
  }
  if (now - session.last_active_at.getTime() > TOUCH_EVERY_MS) {
    await withTransaction({}, (tx) => tx.updateOne('sessions', { _id: tokenHash as never }, { $set: { last_active_at: new Date() } }));
  }
  return toSessionUser(row);
}

/** Rejects cross-site form posts: state-changing requests must come from this app's own origin. */
export async function isSameOrigin(): Promise<boolean> {
  const h = await headers();
  const origin = h.get('origin');
  if (!origin) return true; // same-origin fetches from some browsers omit it; the SameSite=strict cookie still applies
  try {
    return new URL(origin).host === h.get('host');
  } catch {
    return false;
  }
}
