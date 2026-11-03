import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ObjectId } from 'mongodb';
import { ApiError } from './errors';
import { changesToObject, type AuditChange } from './mongo/audit';
import { getDb } from './mongo/client';
import { SYSTEM_LOG_COLLECTION } from './mongo/schema';
import { reader, withTransaction, type Tx } from './mongo/tx';
import { applyTemporaryPassword, requireReason } from './staff';

/*
 * The system control page: for the person who looks after the whole application. Who that is comes from the server's
 * settings (SYSTEM_ADMIN_EMAILS, a comma-separated list of emails), so nobody can grant it to themselves in the app.
 */

export function isSystemAdmin(email: string): boolean {
  const list = (process.env.SYSTEM_ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.trim().toLowerCase());
}

export function assertSystemAdmin(user: { email: string }) {
  if (!isSystemAdmin(user.email)) throw new ApiError(403, 'Only the system administrator can use this page');
}

// ---------------------------------------------------------------------------
// The system log: failed sign-ins and unexpected server errors (sign-ins and password changes are in the audit trail)
// ---------------------------------------------------------------------------

export type SystemEventKind = 'SIGN_IN_FAILED' | 'SERVER_ERROR' | 'CLIENT_ERROR';

/** Records an event. Never throws: a logging problem must not break sign-in or turn one error into two. */
export async function logEvent(
  kind: SystemEventKind,
  fields: { email?: string; reason?: string; ip?: string | null; userAgent?: string | null; /** The app page it happened on. */ page?: string },
): Promise<void> {
  try {
    await withTransaction({}, (tx) =>
      tx.insertOne(SYSTEM_LOG_COLLECTION, {
        _id: new ObjectId(),
        at: new Date(),
        kind,
        email: fields.email ?? null,
        reason: (fields.reason ?? '').slice(0, 500),
        ip: fields.ip ?? null,
        user_agent: fields.userAgent ?? null,
        page: fields.page ?? null,
      }),
    );
  } catch (err) {
    console.error('[system log]', (err as Error).message);
  }
}

/** A short description of an unexpected error: its message and the first line of our own code it passed through. */
export function describeError(err: unknown): string {
  const e = err instanceof Error ? err : new Error(String(err));
  const where = (e.stack ?? '').split('\n').find((l) => /src[\\/](server|app)/.test(l))?.trim() ?? '';
  return `${e.name}: ${e.message}${where ? ` (${where.replace(/^at\s+/, '').slice(0, 160)})` : ''}`;
}

// ---------------------------------------------------------------------------
// Status and logs for the page
// ---------------------------------------------------------------------------

export interface SystemStatus {
  database: 'ok' | 'error';
  databaseDetail: string;
  accounts: number;
  activeAccounts: number;
  participants: number;
  auditEntries: number;
  lastBackup: { file: string; at: string; bytes: number; count: number } | null;
  backupDetail: string;
  serverTime: string;
}

export interface LogEntry {
  at: string;
  /** What happened, in plain words. */
  event: string;
  /** Whose account it was about. */
  account: string;
  /** Who did it (for changes made by someone else). */
  by: string;
  detail: string;
}

const BACKUP_DIR = () => process.env.SMARTTB_BACKUP_DIR ?? '/opt/smarttb/backups';

function lastBackup(): Pick<SystemStatus, 'lastBackup' | 'backupDetail'> {
  try {
    const files = readdirSync(BACKUP_DIR()).filter((f) => /^smarttb-\d{8}T\d{6}Z\.dump\.enc$/.test(f)).sort();
    if (!files.length) return { lastBackup: null, backupDetail: 'No backup files yet' };
    const newest = files[files.length - 1];
    const st = statSync(join(BACKUP_DIR(), newest));
    return { lastBackup: { file: newest, at: st.mtime.toISOString(), bytes: st.size, count: files.length }, backupDetail: '' };
  } catch {
    return { lastBackup: null, backupDetail: `Backups are not visible from here (${BACKUP_DIR()})` };
  }
}

export async function systemStatus(): Promise<SystemStatus> {
  const base = { ...lastBackup(), serverTime: new Date().toISOString() };
  try {
    await getDb().command({ ping: 1 });
    return {
      database: 'ok',
      databaseDetail: '',
      accounts: await reader.count('app_users'),
      activeAccounts: await reader.count('app_users', { active: true }),
      participants: await reader.count('participants'),
      auditEntries: await reader.count('audit_log'),
      ...base,
    };
  } catch (err) {
    return { database: 'error', databaseDetail: (err as Error).message, accounts: 0, activeAccounts: 0, participants: 0, auditEntries: 0, ...base };
  }
}

interface AuditDoc {
  at: Date;
  user_id: string | null;
  row_key: string;
  action: string;
  changes: AuditChange[];
  reason: string | null;
}

const PASSWORD_EVENTS: Record<string, string> = {
  PASSWORD_CHANGED: 'Changed their own password',
  PASSWORD_SET: 'Set their password from a setup link',
  SETUP_LINK: 'Setup link issued',
  PASSWORD_SET_BY_SYSTEM: 'Password set from the system control page',
  SIGN_IN_UNLOCKED: 'Sign-in unlocked from the system control page',
  SIGNED_OUT_EVERYWHERE: 'Signed out on all devices from the system control page',
};

export interface ErrorGroup {
  source: 'server' | 'browser';
  message: string;
  count: number;
  first: string;
  last: string;
  pages: string[];
  people: string[];
}

export async function systemLogs(limit = 100): Promise<{ signIns: LogEntry[]; failedSignIns: LogEntry[]; passwords: LogEntry[]; errors: LogEntry[]; errorGroups: ErrorGroup[] }> {
  const signInDocs = await reader.find<AuditDoc>('audit_log', { table_name: 'sessions', action: { $in: ['SIGN_IN', 'TEST_SIGN_IN', 'SIGN_OUT'] } }, { sort: { at: -1, _id: -1 }, limit });
  const passwordDocs = await reader.find<AuditDoc>(
    'audit_log',
    { table_name: 'app_users', $or: [{ action: { $in: Object.keys(PASSWORD_EVENTS) } }, { action: 'UPDATE', 'changes.field': 'password_changed' }] },
    { sort: { at: -1, _id: -1 }, limit },
  );
  const ids = [...new Set([...signInDocs, ...passwordDocs].flatMap((d) => [d.user_id, d.row_key]).filter((v): v is string => !!v))];
  const people = ids.length ? await reader.find<{ _id: string; display_name: string; email: string }>('app_users', { _id: { $in: ids } as never }, { projection: { display_name: 1, email: 1 } }) : [];
  const nameOf = (id: string | null) => {
    if (!id) return '';
    const p = people.find((x) => x._id === id);
    return p ? `${p.display_name} (${p.email})` : 'an account that no longer exists';
  };

  const signIns = signInDocs.map<LogEntry>((d) => ({
    at: d.at.toISOString(),
    event: d.action === 'SIGN_OUT' ? 'Signed out' : d.action === 'TEST_SIGN_IN' ? 'Signed in (test account, one tap)' : 'Signed in',
    account: nameOf(d.row_key),
    by: '',
    detail: '',
  }));

  // Password updates the audit trail recorded as a field change: a temporary password, a reset, or setting a password.
  const passwords = passwordDocs
    .filter((d) => !(d.action === 'UPDATE' && passwordDocs.some((o) => o.action === 'PASSWORD_SET_BY_SYSTEM' && o.row_key === d.row_key && Math.abs(o.at.getTime() - d.at.getTime()) < 2000)))
    .map<LogEntry>((d) => {
      const ch = changesToObject(d.changes ?? []);
      const event =
        PASSWORD_EVENTS[d.action] ??
        (ch.must_change_password?.new === true ? 'Temporary password set by an administrator' : d.user_id && d.user_id === d.row_key ? 'Password changed' : 'Password changed or reset by an administrator');
      return { at: d.at.toISOString(), event, account: nameOf(d.row_key), by: d.user_id && d.user_id !== d.row_key ? nameOf(d.user_id) : '', detail: d.reason ?? '' };
    });

  const logDocs = async (kind: SystemEventKind | SystemEventKind[], n = limit) =>
    reader.find<{ at: Date; kind: SystemEventKind; email: string | null; reason: string; ip: string | null; user_agent: string | null; page: string | null }>(
      SYSTEM_LOG_COLLECTION,
      { kind: Array.isArray(kind) ? { $in: kind } : kind },
      { sort: { at: -1, _id: -1 }, limit: n },
    );
  const failedSignIns = (await logDocs('SIGN_IN_FAILED')).map<LogEntry>((d) => ({
    at: d.at.toISOString(),
    event: 'Sign-in refused',
    account: d.email ?? '',
    by: '',
    detail: [d.reason, d.ip ? `from ${d.ip}` : ''].filter(Boolean).join(', '),
  }));
  const errorDocs = await logDocs(['SERVER_ERROR', 'CLIENT_ERROR'], 1000);
  const errors = errorDocs.slice(0, limit).map<LogEntry>((d) => ({
    at: d.at.toISOString(),
    event: d.kind === 'CLIENT_ERROR' ? 'Error in a browser' : 'Server error',
    account: d.email ?? '',
    by: '',
    detail: [d.reason, d.page ? `on ${d.page}` : '', d.kind === 'CLIENT_ERROR' && d.user_agent ? deviceOf(d.user_agent) : ''].filter(Boolean).join(' · '),
  }));
  // The same problem happening again and again is one line, with how often, where and for whom.
  const groups = new Map<string, ErrorGroup>();
  for (const d of errorDocs) {
    const source = d.kind === 'CLIENT_ERROR' ? 'browser' : 'server';
    const key = `${source}|${d.reason.replace(/\d+/g, '#')}`;
    const g = groups.get(key) ?? { source, message: d.reason, count: 0, first: d.at.toISOString(), last: d.at.toISOString(), pages: [], people: [] };
    g.count++;
    g.first = d.at.toISOString(); // newest first, so the last one seen is the oldest
    if (d.page && !g.pages.includes(d.page) && g.pages.length < 5) g.pages.push(d.page);
    if (d.email && !g.people.includes(d.email) && g.people.length < 5) g.people.push(d.email);
    groups.set(key, g);
  }
  const errorGroups = [...groups.values()].sort((a, b) => b.last.localeCompare(a.last));
  return { signIns, failedSignIns, passwords, errors, errorGroups };
}

// ---------------------------------------------------------------------------
// Setting a password for any account
// ---------------------------------------------------------------------------

/**
 * Sets a password for any other account. Temporary by default (the person must choose their own at the next sign-in);
 * they are signed out everywhere and any unused setup link stops working. A reason is required and kept in the audit trail.
 */
export async function setAccountPassword(tx: Tx, actor: { id: string; email: string }, body: Record<string, unknown>): Promise<{ email: string; name: string; mustChange: boolean }> {
  assertSystemAdmin(actor);
  const userId = typeof body.userId === 'string' ? body.userId : '';
  if (!userId) throw new ApiError(400, 'Choose an account');
  if (userId === actor.id) throw new ApiError(409, 'Change your own password from your account menu (it asks for the current one)');
  requireReason(body.reason);
  const password = typeof body.password === 'string' ? body.password : '';
  if (!password) throw new ApiError(400, 'Enter the new password');
  const mustChange = body.mustChange !== false;

  const user = await tx.findOne<{ _id: string; email: string; display_name: string; active: boolean }>('app_users', { _id: userId as never });
  if (!user) throw new ApiError(404, 'Account not found');
  if (!user.active) throw new ApiError(409, 'This account is deactivated. Reactivate it from Staff accounts first.');
  await applyTemporaryPassword(tx, userId, password, actor.id, mustChange);
  await tx.record('app_users', userId, 'PASSWORD_SET_BY_SYSTEM', [{ field: 'must_change_password', old: null, new: mustChange }]);
  return { email: user.email, name: user.display_name, mustChange };
}

/** A short device description from a browser's user agent ("Android phone · Chrome"). */
export function deviceOf(ua: string | null | undefined): string {
  if (!ua) return 'Unknown device';
  const os = /iPhone|iPad/.test(ua)
    ? 'iPhone/iPad'
    : /Android/.test(ua)
      ? /Mobile/.test(ua)
        ? 'Android phone'
        : 'Android tablet'
      : /Windows/.test(ua)
        ? 'Windows computer'
        : /Mac OS X/.test(ua)
          ? 'Mac'
          : /Linux/.test(ua)
            ? 'Linux computer'
            : /curl|node|undici/i.test(ua)
              ? 'Script'
              : 'Other device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  return browser ? `${os} · ${browser}` : os;
}

// ---------------------------------------------------------------------------
// Account rescue: a locked sign-in, and signed-in devices
// ---------------------------------------------------------------------------

export interface AccountAccess {
  id: string;
  name: string;
  email: string;
  lock: { failedAttempts: number; lockedUntil: string | null };
  devices: { started: string; lastActive: string; device: string }[];
}

/** Whether the account's sign-in is locked after wrong passwords, and the devices it is signed in on. */
export async function accountAccess(id: string): Promise<AccountAccess> {
  const user = await reader.findOne<{ _id: string; email: string; display_name: string }>('app_users', { _id: id as never });
  if (!user) throw new ApiError(404, 'Account not found');
  const attempt = await reader.findOne<{ fails: number; locked_until: Date | null }>('login_attempts', { _id: user.email as never });
  const sessions = await reader.find<{ created_at: Date; last_active_at: Date; user_agent: string | null }>('sessions', { user_id: id }, { sort: { last_active_at: -1 } });
  const lockedUntil = attempt?.locked_until && attempt.locked_until.getTime() > Date.now() ? attempt.locked_until.toISOString() : null;
  return {
    id,
    name: user.display_name,
    email: user.email,
    lock: { failedAttempts: attempt?.fails ?? 0, lockedUntil },
    devices: sessions.map((x) => ({ started: x.created_at.toISOString(), lastActive: x.last_active_at.toISOString(), device: deviceOf(x.user_agent) })),
  };
}

/** Unlocks a sign-in locked after wrong passwords, or signs the account out on every device. Reason required. */
export async function rescueAccount(tx: Tx, actor: { id: string; email: string }, body: Record<string, unknown>): Promise<void> {
  assertSystemAdmin(actor);
  const userId = typeof body.userId === 'string' ? body.userId : '';
  if (!userId) throw new ApiError(400, 'Choose an account');
  requireReason(body.reason);
  const user = await tx.findOne<{ _id: string; email: string }>('app_users', { _id: userId as never });
  if (!user) throw new ApiError(404, 'Account not found');
  if (body.action === 'unlock') {
    await tx.deleteMany('login_attempts', { _id: user.email as never });
    await tx.record('app_users', userId, 'SIGN_IN_UNLOCKED');
  } else if (body.action === 'signout') {
    if (userId === actor.id) throw new ApiError(409, 'This would sign you out too. Use Sign out in your account menu instead.');
    await tx.deleteMany('sessions', { user_id: userId });
    await tx.record('app_users', userId, 'SIGNED_OUT_EVERYWHERE');
  } else {
    throw new ApiError(400, 'Unknown action');
  }
}
