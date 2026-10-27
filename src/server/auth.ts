import { randomBytes } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { getPool, withTransaction } from './db';
import { hashPassword, hashToken, verifyPassword } from './passwords';
import { ApiError } from './participants';
import { LOGIN_LOCKOUT_MS, MAX_LOGIN_ATTEMPTS, passwordProblem } from '../utils/accountRules';
import { ROLE_LABELS, isRoleKey, type Actor, type RoleKey } from '../data/roles';
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


interface UserRow {
  id: string;
  email: string;
  display_name: string;
  role: string;
  is_admin: boolean;
  password_hash: string | null;
  active: boolean;
  must_change_password: boolean;
}

async function loadDelegations(userId: string): Promise<ModuleId[]> {
  const { rows } = await getPool().query<{ module_id: number }>(
    'select module_id from module_delegations where user_id = $1 and (expires_at is null or expires_at >= current_date) order by module_id',
    [userId],
  );
  return rows.map((r) => r.module_id as ModuleId);
}

async function toSessionUser(row: UserRow): Promise<SessionUser> {
  const role: RoleKey = isRoleKey(row.role) ? row.role : 'research_officer';
  return {
    id: row.id,
    email: row.email,
    name: row.display_name,
    role,
    roleLabel: ROLE_LABELS[role],
    isAdmin: row.is_admin,
    delegations: await loadDelegations(row.id),
    mustChangePassword: row.must_change_password,
  };
}

export type SignInOutcome =
  | { ok: true; user: SessionUser }
  | { ok: false; error: string; locked?: boolean; lockedForMs?: number };

export async function signIn(emailRaw: string, password: string): Promise<SignInOutcome> {
  const email = emailRaw.trim().toLowerCase();
  const pool = getPool();

  const attempt = await pool.query<{ fails: number; locked_until: Date | null }>(
    'select fails, locked_until from login_attempts where email = $1',
    [email],
  );
  const lockedUntil = attempt.rows[0]?.locked_until?.getTime() ?? 0;
  if (lockedUntil > Date.now()) {
    const ms = lockedUntil - Date.now();
    const mins = Math.ceil(ms / 60000);
    return { ok: false, locked: true, lockedForMs: ms, error: `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.` };
  }

  const { rows } = await pool.query<UserRow>('select * from app_users where email = $1', [email]);
  const row = rows[0];
  const valid = await verifyPassword(password, row?.password_hash ?? null);

  if (!row || !row.active || !valid) {
    const prevFails = lockedUntil ? 0 : (attempt.rows[0]?.fails ?? 0);
    const fails = prevFails + 1;
    const locked = fails >= MAX_ATTEMPTS;
    await pool.query(
      `insert into login_attempts (email, fails, locked_until) values ($1, $2, $3)
       on conflict (email) do update set fails = excluded.fails, locked_until = excluded.locked_until`,
      [email, fails, locked ? new Date(Date.now() + LOCKOUT_MS) : null],
    );
    if (locked) return { ok: false, locked: true, lockedForMs: LOCKOUT_MS, error: 'Too many failed attempts. Sign-in is locked for 5 minutes.' };
    const left = MAX_ATTEMPTS - fails;
    return { ok: false, error: `Incorrect email or password. ${left} attempt${left === 1 ? '' : 's'} remaining.` };
  }

  return { ok: true, user: await startSession(row, email, 'SIGN_IN') };
}

async function startSession(row: UserRow, email: string, action: 'SIGN_IN' | 'TEST_SIGN_IN'): Promise<SessionUser> {
  const token = randomBytes(32).toString('base64url');
  const userAgent = (await headers()).get('user-agent')?.slice(0, 300) ?? null;
  await withTransaction({ userId: row.id }, async (c) => {
    await c.query('delete from login_attempts where email = $1', [email]);
    await c.query('update app_users set last_sign_in_at = now() where id = $1', [row.id]);
    await c.query('insert into sessions (token_hash, user_id, user_agent) values ($1, $2, $3)', [hashToken(token), row.id, userAgent]);
    await c.query(
      `insert into audit_log (user_id, table_name, row_key, action, changes) values ($1::uuid, 'sessions', $1::text, $2, '{}'::jsonb)`,
      [row.id, action],
    );
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
  const { rows } = await getPool().query<UserRow>(
    "select * from app_users where active and email like '%' || $1 order by is_admin desc, email",
    [TEST_ACCOUNT_DOMAIN],
  );
  return rows.map((r) => ({
    email: r.email,
    name: r.display_name,
    roleLabel: isRoleKey(r.role) ? ROLE_LABELS[r.role] : r.role,
    isAdmin: r.is_admin,
  }));
}

export async function signInAsTestAccount(emailRaw: string): Promise<SignInOutcome> {
  const email = emailRaw.trim().toLowerCase();
  if (!testLoginEnabled() || !email.endsWith(TEST_ACCOUNT_DOMAIN)) return { ok: false, error: 'Test sign-in is not available' };
  const { rows } = await getPool().query<UserRow>('select * from app_users where email = $1 and active', [email]);
  if (!rows[0]) return { ok: false, error: 'Test account not found' };
  return { ok: true, user: await startSession(rows[0], email, 'TEST_SIGN_IN') };
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const { rows } = await getPool().query<{ user_id: string }>('delete from sessions where token_hash = $1 returning user_id', [
      hashToken(token),
    ]);
    if (rows[0]) {
      await getPool().query(
        `insert into audit_log (user_id, table_name, row_key, action, changes) values ($1::uuid, 'sessions', $1::text, 'SIGN_OUT', '{}'::jsonb)`,
        [rows[0].user_id],
      );
    }
  }
  jar.delete(SESSION_COOKIE);
}

/**
 * The signed-in person chooses a new password. Needs the current one, so a borrowed session cannot change it.
 * Wrong current passwords count towards the same lockout as sign-in. Other sessions for the account end.
 */
export async function changeOwnPassword(user: SessionUser, currentPassword: string, newPassword: string): Promise<void> {
  const pool = getPool();
  const lock = await pool.query<{ fails: number; locked_until: Date | null }>('select fails, locked_until from login_attempts where email = $1', [user.email]);
  const lockedUntil = lock.rows[0]?.locked_until?.getTime() ?? 0;
  if (lockedUntil > Date.now()) {
    const mins = Math.ceil((lockedUntil - Date.now()) / 60000);
    throw new ApiError(429, `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`);
  }

  const { rows } = await pool.query<{ password_hash: string | null }>('select password_hash from app_users where id = $1', [user.id]);
  if (!(await verifyPassword(currentPassword, rows[0]?.password_hash ?? null))) {
    const fails = (lockedUntil ? 0 : (lock.rows[0]?.fails ?? 0)) + 1;
    await pool.query(
      `insert into login_attempts (email, fails, locked_until) values ($1, $2, $3)
       on conflict (email) do update set fails = excluded.fails, locked_until = excluded.locked_until`,
      [user.email, fails, fails >= MAX_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MS) : null],
    );
    throw new ApiError(400, 'The current password is not correct');
  }
  const problem = passwordProblem(newPassword, user.email);
  if (problem) throw new ApiError(400, problem);
  if (newPassword === currentPassword) throw new ApiError(400, 'Choose a password different from the current one');

  const keep = hashToken((await cookies()).get(SESSION_COOKIE)?.value ?? '');
  const hash = await hashPassword(newPassword);
  await withTransaction({ userId: user.id, reason: 'Password changed by the user' }, async (c) => {
    await c.query('update app_users set password_hash = $2, must_change_password = false, updated_at = now() where id = $1', [user.id, hash]);
    await c.query('delete from sessions where user_id = $1 and token_hash <> $2', [user.id, keep]);
    await c.query('delete from login_attempts where email = $1', [user.email]);
    await c.query(
      `insert into audit_log (user_id, table_name, row_key, action, changes) values ($1::uuid, 'app_users', $1::text, 'PASSWORD_CHANGED', '{}'::jsonb)`,
      [user.id],
    );
  });
}

/** The signed-in user for this request, or null when signed out, idle too long, or deactivated. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const tokenHash = hashToken(token);
  const pool = getPool();
  const { rows } = await pool.query<UserRow & { created_at: Date; last_active_at: Date }>(
    `select u.*, s.created_at, s.last_active_at
       from sessions s join app_users u on u.id = s.user_id
      where s.token_hash = $1`,
    [tokenHash],
  );
  const row = rows[0];
  if (!row) return null;

  const now = Date.now();
  const expired =
    !row.active || now - row.last_active_at.getTime() > IDLE_TIMEOUT_MS || now - row.created_at.getTime() > MAX_SESSION_MS;
  if (expired) {
    await pool.query('delete from sessions where token_hash = $1', [tokenHash]);
    return null;
  }
  if (now - row.last_active_at.getTime() > TOUCH_EVERY_MS) {
    await pool.query('update sessions set last_active_at = now() where token_hash = $1', [tokenHash]);
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
