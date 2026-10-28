import { randomBytes } from 'node:crypto';
import type { PoolClient } from 'pg';
import { hashPassword, hashToken } from './passwords';
import { ApiError } from './participants';
import { roleLabel } from '../data/roles';
import { cleanRole, customRoleLabels } from './roles';
import { EMAIL_RE, MIN_ADMIN_REASON_LENGTH, passwordProblem } from '../utils/accountRules';
import type { ModuleId } from '../types/crf';
import type { Delegation, SetupLink, StaffHistoryEntry, StaffMember } from '../types/staff';

type Queryable = Pick<PoolClient, 'query'>;

const SETUP_LINK_HOURS = 72;

export interface AdminActor {
  id: string;
  isAdmin: boolean;
}

export function assertAdmin(actor: AdminActor) {
  if (!actor.isAdmin) throw new ApiError(403, 'Only study administrators can manage staff accounts');
}

export function requireReason(raw: unknown): string {
  const reason = typeof raw === 'string' ? raw.trim() : '';
  if (reason.length < MIN_ADMIN_REASON_LENGTH) throw new ApiError(400, `Give a reason (at least ${MIN_ADMIN_REASON_LENGTH} characters)`);
  return reason;
}

export function cleanName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  if (name.length < 2 || name.length > 80) throw new ApiError(400, 'Enter a name between 2 and 80 characters');
  return name;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  role: string;
  is_admin: boolean;
  active: boolean;
  has_password: boolean;
  must_change_password: boolean;
  last_sign_in_at: Date | null;
  created_at: Date;
}

export async function listStaff(q: Queryable): Promise<StaffMember[]> {
  const custom = await customRoleLabels(q);
  const users = await q.query<UserRow>(
    `select id, email, display_name, role, is_admin, active, password_hash is not null as has_password, must_change_password, last_sign_in_at, created_at
       from app_users order by active desc, display_name`,
  );
  const dels = await q.query<{ user_id: string; module_id: number; reason: string; expires_at: string | null; granted_at: Date; granted_by_name: string | null }>(
    `select d.user_id, d.module_id, d.reason, to_char(d.expires_at, 'YYYY-MM-DD') as expires_at, d.granted_at, g.display_name as granted_by_name
       from module_delegations d left join app_users g on g.id = d.granted_by
      order by d.module_id`,
  );
  return users.rows.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.display_name,
    role: u.role,
    roleLabel: roleLabel(u.role, custom),
    isAdmin: u.is_admin,
    status: !u.active ? 'deactivated' : u.has_password ? 'active' : 'invited',
    mustChangePassword: u.must_change_password,
    lastSignInAt: u.last_sign_in_at?.toISOString() ?? '',
    createdAt: u.created_at.toISOString(),
    delegations: dels.rows
      .filter((d) => d.user_id === u.id)
      .map<Delegation>((d) => ({
        moduleId: d.module_id as ModuleId,
        reason: d.reason,
        expiresAt: d.expires_at ?? '',
        grantedAt: d.granted_at.toISOString(),
        grantedBy: d.granted_by_name ?? '',
      })),
  }));
}

async function getStaff(q: Queryable, id: string): Promise<StaffMember> {
  const member = (await listStaff(q)).find((s) => s.id === id);
  if (!member) throw new ApiError(404, 'Staff account not found');
  return member;
}

async function lockUser(q: Queryable, id: string) {
  const { rowCount } = await q.query('select id from app_users where id = $1 for update', [id]);
  if (!rowCount) throw new ApiError(404, 'Staff account not found');
}

/** Stops the last active administrator from being removed or switched off. */
async function assertAnotherAdmin(q: Queryable, exceptId: string) {
  await q.query('select id from app_users where is_admin and active for update');
  const { rows } = await q.query<{ n: number }>('select count(*)::int as n from app_users where is_admin and active and id <> $1', [exceptId]);
  if (rows[0].n < 1) throw new ApiError(409, 'There must always be at least one active administrator');
}

const LABELS: Record<string, string> = {
  display_name: 'Name',
  role: 'Role',
  is_admin: 'Administrator',
  active: 'Account active',
  email: 'Email',
  password_changed: 'Password',
  must_change_password: 'Temporary password',
};

function describe(table: string, action: string, changes: Record<string, { old: unknown; new: unknown }>, rowKey: string, custom: Record<string, string>): string {
  if (action === 'SETUP_LINK') return 'Setup link issued';
  if (action === 'PASSWORD_SET') return 'Password set from setup link';
  if (action === 'PASSWORD_CHANGED') return 'Password changed by the person';
  if (table === 'module_delegations') {
    const moduleId = rowKey.split(':')[1];
    if (action === 'INSERT') return `Delegated Module ${moduleId}${changes.expires_at?.new ? ` until ${changes.expires_at.new}` : ''}`;
    if (action === 'DELETE') return `Removed delegation of Module ${moduleId}`;
    return `Updated delegation of Module ${moduleId}`;
  }
  if (action === 'INSERT') return `Account created as ${roleLabel(String(changes.role?.new ?? ''), custom)}`;
  const fmt = (k: string, v: unknown) =>
    k === 'role' ? roleLabel(String(v ?? ''), custom) : typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v ?? '');
  return Object.entries(changes)
    .filter(([k]) => k in LABELS)
    .map(([k, c]) => (k === 'password_changed' ? 'Password changed' : `${LABELS[k]}: ${fmt(k, c.old)} → ${fmt(k, c.new)}`))
    .join('; ');
}

export async function staffHistory(q: Queryable, id: string): Promise<StaffHistoryEntry[]> {
  const custom = await customRoleLabels(q);
  const { rows } = await q.query<{ at: Date; by: string | null; table_name: string; action: string; changes: Record<string, { old: unknown; new: unknown }>; reason: string | null; row_key: string }>(
    `select a.at, u.display_name as by, a.table_name, a.action, a.changes, a.reason, a.row_key
       from audit_log a left join app_users u on u.id = a.user_id
      where (a.table_name = 'app_users' and a.row_key = $1)
         or (a.table_name = 'module_delegations' and a.row_key like $1 || ':%')
      order by a.at desc, a.id desc
      limit 200`,
    [id],
  );
  return rows
    .map((r) => ({
      at: r.at.toISOString(),
      by: r.by ?? 'System',
      action: r.action,
      summary: describe(r.table_name, r.action, r.changes, r.row_key, custom),
      reason: r.reason ?? '',
    }))
    .filter((e) => e.summary);
}

// ---------------------------------------------------------------------------
// Setup links
// ---------------------------------------------------------------------------

export async function issueSetupLink(q: Queryable, userId: string, createdBy: string | null): Promise<SetupLink> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SETUP_LINK_HOURS * 3600 * 1000);
  // Older unused links stop working as soon as a new one is issued.
  await q.query('update account_setup_tokens set expires_at = now() where user_id = $1 and used_at is null and expires_at > now()', [userId]);
  await q.query('insert into account_setup_tokens (token_hash, user_id, created_by, expires_at) values ($1, $2, $3, $4)', [
    hashToken(token),
    userId,
    createdBy,
    expiresAt,
  ]);
  await q.query(
    `insert into audit_log (user_id, table_name, row_key, action, changes, reason)
     values ($1::uuid, 'app_users', $2::text, 'SETUP_LINK', '{}'::jsonb, nullif(current_setting('app.reason', true), ''))`,
    [createdBy, userId],
  );
  return { token, expiresAt: expiresAt.toISOString() };
}

export async function describeSetupToken(q: Queryable, token: string): Promise<{ name: string; email: string } | null> {
  const { rows } = await q.query<{ display_name: string; email: string }>(
    `select u.display_name, u.email from account_setup_tokens t join app_users u on u.id = t.user_id
      where t.token_hash = $1 and t.used_at is null and t.expires_at > now() and u.active`,
    [hashToken(token)],
  );
  return rows[0] ? { name: rows[0].display_name, email: rows[0].email } : null;
}

/** Sets the password from a setup link. The link works once; all existing sessions for the account end. */
export async function completeSetup(q: Queryable, token: string, password: string): Promise<void> {
  const { rows } = await q.query<{ user_id: string; email: string }>(
    `select t.user_id, u.email from account_setup_tokens t join app_users u on u.id = t.user_id
      where t.token_hash = $1 and t.used_at is null and t.expires_at > now() and u.active
      for update of t`,
    [hashToken(token)],
  );
  const row = rows[0];
  if (!row) throw new ApiError(410, 'This setup link has expired or was already used. Ask the study administrator for a new one.');
  const problem = passwordProblem(password, row.email);
  if (problem) throw new ApiError(400, problem);

  await q.query("select set_config('app.user_id', $1, true)", [row.user_id]);
  await q.query('update account_setup_tokens set used_at = now() where token_hash = $1', [hashToken(token)]);
  await q.query('update app_users set password_hash = $2, must_change_password = false, updated_at = now() where id = $1', [row.user_id, await hashPassword(password)]);
  await q.query('delete from sessions where user_id = $1', [row.user_id]);
  await q.query('delete from login_attempts where email = $1', [row.email]);
  await q.query(
    `insert into audit_log (user_id, table_name, row_key, action, changes) values ($1::uuid, 'app_users', $1::text, 'PASSWORD_SET', '{}'::jsonb)`,
    [row.user_id],
  );
}

// ---------------------------------------------------------------------------
// Admin actions (each runs in a transaction whose audit reason is already set)
// ---------------------------------------------------------------------------

export async function createStaff(q: Queryable, admin: AdminActor, body: Record<string, unknown>): Promise<{ member: StaffMember; link: SetupLink }> {
  assertAdmin(admin);
  const name = cleanName(body.name);
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(email)) throw new ApiError(400, 'Enter a valid email address');
  const role = await cleanRole(q, body.role);
  const isAdmin = body.isAdmin === true;

  let id: string;
  try {
    const { rows } = await q.query<{ id: string }>(
      'insert into app_users (email, display_name, role, is_admin) values ($1, $2, $3, $4) returning id',
      [email, name, role, isAdmin],
    );
    id = rows[0].id;
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      throw new ApiError(409, 'An account with this email already exists. If it was deactivated, reactivate it instead.');
    }
    throw err;
  }
  const link = await issueSetupLink(q, id, admin.id);
  return { member: await getStaff(q, id), link };
}

export async function updateStaff(q: Queryable, admin: AdminActor, id: string, body: Record<string, unknown>): Promise<StaffMember> {
  assertAdmin(admin);
  requireReason(body.reason);
  await lockUser(q, id);
  const current = await getStaff(q, id);
  const self = id === admin.id;

  const name = body.name === undefined ? current.name : cleanName(body.name);
  const role = body.role === undefined ? current.role : await cleanRole(q, body.role);
  const isAdmin = body.isAdmin === undefined ? current.isAdmin : body.isAdmin === true;

  if (self && role !== current.role) throw new ApiError(409, 'Ask the other administrator to change your own role');
  if (self && !isAdmin) throw new ApiError(409, 'You cannot remove your own administrator rights');
  if (current.isAdmin && !isAdmin && current.status !== 'deactivated') await assertAnotherAdmin(q, id);

  await q.query('update app_users set display_name = $2, role = $3, is_admin = $4, updated_at = now(), updated_by = $5 where id = $1', [
    id,
    name,
    role,
    isAdmin,
    admin.id,
  ]);
  return getStaff(q, id);
}

export async function setStaffActive(q: Queryable, admin: AdminActor, id: string, active: boolean): Promise<StaffMember> {
  assertAdmin(admin);
  await lockUser(q, id);
  const current = await getStaff(q, id);
  if (!active) {
    if (id === admin.id) throw new ApiError(409, 'You cannot deactivate your own account');
    if (current.isAdmin) await assertAnotherAdmin(q, id);
  }
  await q.query('update app_users set active = $2, updated_at = now(), updated_by = $3 where id = $1', [id, active, admin.id]);
  if (!active) {
    await q.query('delete from sessions where user_id = $1', [id]);
    await q.query('update account_setup_tokens set expires_at = now() where user_id = $1 and used_at is null and expires_at > now()', [id]);
  }
  return getStaff(q, id);
}

/** Replaces a person's extra modules with the given set. */
export async function setDelegations(q: Queryable, admin: AdminActor, id: string, raw: unknown, reason: string): Promise<StaffMember> {
  assertAdmin(admin);
  await lockUser(q, id);
  if (!Array.isArray(raw)) throw new ApiError(400, 'Invalid delegations');
  const wanted = new Map<ModuleId, string>();
  for (const item of raw) {
    const moduleId = Number((item as { moduleId?: unknown })?.moduleId);
    const expiresAt = String((item as { expiresAt?: unknown })?.expiresAt ?? '');
    if (!Number.isInteger(moduleId) || moduleId < 1 || moduleId > 10) throw new ApiError(400, 'Invalid module');
    if (expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) throw new ApiError(400, 'Invalid end date');
    wanted.set(moduleId as ModuleId, expiresAt);
  }

  const current = await getStaff(q, id);
  for (const d of current.delegations) {
    if (!wanted.has(d.moduleId)) await q.query('delete from module_delegations where user_id = $1 and module_id = $2', [id, d.moduleId]);
  }
  for (const [moduleId, expiresAt] of wanted) {
    const existing = current.delegations.find((d) => d.moduleId === moduleId);
    if (!existing) {
      await q.query(
        'insert into module_delegations (user_id, module_id, granted_by, reason, expires_at) values ($1, $2, $3, $4, $5)',
        [id, moduleId, admin.id, reason, expiresAt || null],
      );
    } else if (existing.expiresAt !== expiresAt) {
      await q.query('update module_delegations set expires_at = $3, reason = $4 where user_id = $1 and module_id = $2', [
        id,
        moduleId,
        expiresAt || null,
        reason,
      ]);
    }
  }
  return getStaff(q, id);
}

/** Password reset: the old password stops working, the person is signed out, and a new setup link is issued. */
export async function resetStaffPassword(q: Queryable, admin: AdminActor, id: string): Promise<{ member: StaffMember; link: SetupLink }> {
  assertAdmin(admin);
  await lockUser(q, id);
  const current = await getStaff(q, id);
  if (current.status === 'deactivated') throw new ApiError(409, 'Reactivate the account before issuing a setup link');
  if (id === admin.id) throw new ApiError(409, 'Ask the other administrator to reset your password');
  await q.query('update app_users set password_hash = null, must_change_password = false, updated_at = now(), updated_by = $2 where id = $1', [id, admin.id]);
  await q.query('delete from sessions where user_id = $1', [id]);
  const link = await issueSetupLink(q, id, admin.id);
  return { member: await getStaff(q, id), link };
}

/**
 * Gives an account a starting password that must be changed at the first sign-in. Any unused setup link is cancelled,
 * the person is signed out everywhere, and failed-attempt counts are cleared. Shared by the admin screen and the command line.
 */
export async function applyTemporaryPassword(q: Queryable, userId: string, password: string, updatedBy: string | null): Promise<void> {
  const { rows } = await q.query<{ email: string }>('select email from app_users where id = $1 and active', [userId]);
  if (!rows[0]) throw new ApiError(404, 'Active staff account not found');
  const problem = passwordProblem(password, rows[0].email);
  if (problem) throw new ApiError(400, problem);
  await q.query('update app_users set password_hash = $2, must_change_password = true, updated_at = now(), updated_by = $3 where id = $1', [
    userId,
    await hashPassword(password),
    updatedBy,
  ]);
  await q.query('update account_setup_tokens set expires_at = now() where user_id = $1 and used_at is null and expires_at > now()', [userId]);
  await q.query('delete from sessions where user_id = $1', [userId]);
  await q.query('delete from login_attempts where email = $1', [rows[0].email]);
}

/** Administrator action: a temporary password the person must replace at their first sign-in. */
export async function setTemporaryPassword(q: Queryable, admin: AdminActor, id: string, password: unknown): Promise<StaffMember> {
  assertAdmin(admin);
  await lockUser(q, id);
  const current = await getStaff(q, id);
  if (current.status === 'deactivated') throw new ApiError(409, 'Reactivate the account first');
  if (id === admin.id) throw new ApiError(409, 'Ask the other administrator to set a temporary password for you');
  if (typeof password !== 'string' || !password) throw new ApiError(400, 'Enter the temporary password');
  await applyTemporaryPassword(q, id, password, admin.id);
  return getStaff(q, id);
}

/** A fresh link for someone who has not set their password yet (the earlier link is cancelled). */
export async function resendInvite(q: Queryable, admin: AdminActor, id: string): Promise<{ member: StaffMember; link: SetupLink }> {
  assertAdmin(admin);
  await lockUser(q, id);
  const current = await getStaff(q, id);
  if (current.status !== 'invited') throw new ApiError(409, 'This person has already set a password; use Reset password instead');
  const link = await issueSetupLink(q, id, admin.id);
  return { member: current, link };
}
