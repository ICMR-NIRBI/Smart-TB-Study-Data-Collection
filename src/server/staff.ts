import { randomBytes, randomUUID } from 'node:crypto';
import { hashPassword, hashToken } from './passwords';
import { ApiError } from './errors';
import { changesToObject, type AuditChange } from './mongo/audit';
import { isDuplicateKey } from './mongo/client';
import type { Reads, Tx } from './mongo/tx';
import { roleLabel } from '../data/roles';
import { cleanRole, customRoleLabels } from './roles';
import { EMAIL_RE, MIN_ADMIN_REASON_LENGTH, passwordProblem } from '../utils/accountRules';
import type { ModuleId } from '../types/crf';
import type { Delegation, SetupLink, StaffHistoryEntry, StaffMember } from '../types/staff';

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

/** A new account document, with everything PostgreSQL used to fill in by default. */
export function newUserDoc(fields: { id?: string; email: string; name: string; role: string; isAdmin: boolean; passwordHash?: string | null }) {
  const now = new Date();
  return {
    _id: fields.id ?? randomUUID(),
    email: fields.email,
    display_name: fields.name,
    role: fields.role,
    is_admin: fields.isAdmin,
    password_hash: fields.passwordHash ?? null,
    external_uid: null,
    active: true,
    must_change_password: false,
    last_sign_in_at: null,
    created_at: now,
    updated_at: now,
    updated_by: null,
  };
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

interface UserDoc {
  _id: string;
  email: string;
  display_name: string;
  role: string;
  is_admin: boolean;
  active: boolean;
  password_hash: string | null;
  must_change_password: boolean;
  last_sign_in_at: Date | null;
  created_at: Date;
}

interface DelegationDoc {
  _id: string;
  user_id: string;
  module_id: number;
  reason: string;
  expires_at: string | null;
  granted_at: Date;
  granted_by: string | null;
}

/** Active accounts first, then by name. */
export async function listStaff(q: Reads): Promise<StaffMember[]> {
  const custom = await customRoleLabels(q);
  const users = (await q.find<UserDoc>('app_users')).sort((a, b) => Number(b.active) - Number(a.active) || a.display_name.localeCompare(b.display_name) || a.email.localeCompare(b.email));
  const names = new Map(users.map((u) => [u._id, u.display_name]));
  const dels = (await q.find<DelegationDoc>('module_delegations')).sort((a, b) => a.module_id - b.module_id);
  return users.map((u) => ({
    id: u._id,
    email: u.email,
    name: u.display_name,
    role: u.role,
    roleLabel: roleLabel(u.role, custom),
    isAdmin: u.is_admin,
    status: !u.active ? 'deactivated' : u.password_hash ? 'active' : 'invited',
    mustChangePassword: u.must_change_password === true,
    lastSignInAt: u.last_sign_in_at?.toISOString() ?? '',
    createdAt: u.created_at.toISOString(),
    delegations: dels
      .filter((d) => d.user_id === u._id)
      .map<Delegation>((d) => ({
        moduleId: d.module_id as ModuleId,
        reason: d.reason,
        expiresAt: d.expires_at ?? '',
        grantedAt: d.granted_at.toISOString(),
        grantedBy: (d.granted_by && names.get(d.granted_by)) || '',
      })),
  }));
}

async function getStaff(q: Reads, id: string): Promise<StaffMember> {
  const member = (await listStaff(q)).find((s) => s.id === id);
  if (!member) throw new ApiError(404, 'Staff account not found');
  return member;
}

/** Serialises changes to one account (and checks it exists), as `select ... for update` used to. */
async function lockUser(tx: Tx, id: string) {
  await tx.lock(`user:${id}`);
  if (!(await tx.findOne('app_users', { _id: id as never }, { projection: { _id: 1 } }))) throw new ApiError(404, 'Staff account not found');
}

/** Stops the last active administrator from being removed or switched off. */
async function assertAnotherAdmin(tx: Tx, exceptId: string) {
  await tx.lock('admins');
  const n = await tx.count('app_users', { is_admin: true, active: true, _id: { $ne: exceptId } as never });
  if (n < 1) throw new ApiError(409, 'There must always be at least one active administrator');
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

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function staffHistory(q: Reads, id: string): Promise<StaffHistoryEntry[]> {
  const custom = await customRoleLabels(q);
  const rows = await q.find<{ at: Date; user_id: string | null; table_name: string; action: string; changes: AuditChange[]; reason: string | null; row_key: string }>(
    'audit_log',
    { $or: [{ table_name: 'app_users', row_key: id }, { table_name: 'module_delegations', row_key: { $regex: `^${escapeRegex(id)}:` } }] },
    { sort: { at: -1, _id: -1 }, limit: 200 },
  );
  const ids = [...new Set(rows.map((r) => r.user_id).filter((v): v is string => !!v))];
  const people = ids.length ? await q.find<{ _id: string; display_name: string }>('app_users', { _id: { $in: ids } as never }, { projection: { display_name: 1 } }) : [];
  const nameOf = new Map(people.map((p) => [p._id, p.display_name]));
  return rows
    .map((r) => ({
      at: r.at.toISOString(),
      by: (r.user_id && nameOf.get(r.user_id)) || 'System',
      action: r.action,
      summary: describe(r.table_name, r.action, changesToObject(r.changes), r.row_key, custom),
      reason: r.reason ?? '',
    }))
    .filter((e) => e.summary);
}

// ---------------------------------------------------------------------------
// Setup links
// ---------------------------------------------------------------------------

/** Cancels a person's unused setup links. */
async function cancelSetupLinks(tx: Tx, userId: string) {
  const now = new Date();
  await tx.updateMany('account_setup_tokens', { user_id: userId, used_at: null, expires_at: { $gt: now } }, { $set: { expires_at: now } });
}

export async function issueSetupLink(tx: Tx, userId: string, createdBy: string | null): Promise<SetupLink> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SETUP_LINK_HOURS * 3600 * 1000);
  // Older unused links stop working as soon as a new one is issued.
  await cancelSetupLinks(tx, userId);
  await tx.insertOne('account_setup_tokens', { _id: hashToken(token), user_id: userId, created_by: createdBy, created_at: new Date(), expires_at: expiresAt, used_at: null });
  await tx.record('app_users', userId, 'SETUP_LINK', [], { actor: createdBy });
  return { token, expiresAt: expiresAt.toISOString() };
}

interface TokenDoc {
  _id: string;
  user_id: string;
}

/** An unused, unexpired setup token and the active account it belongs to. */
async function openToken(q: Reads, token: string): Promise<{ user: UserDoc; tokenHash: string } | null> {
  const tokenHash = hashToken(token);
  const t = await q.findOne<TokenDoc>('account_setup_tokens', { _id: tokenHash as never, used_at: null, expires_at: { $gt: new Date() } });
  if (!t) return null;
  const user = await q.findOne<UserDoc>('app_users', { _id: t.user_id as never, active: true });
  return user ? { user, tokenHash } : null;
}

export async function describeSetupToken(q: Reads, token: string): Promise<{ name: string; email: string } | null> {
  const open = await openToken(q, token);
  return open ? { name: open.user.display_name, email: open.user.email } : null;
}

/** Sets the password from a setup link. The link works once; all existing sessions for the account end. */
export async function completeSetup(tx: Tx, token: string, password: string): Promise<void> {
  const open = await openToken(tx, token);
  if (!open) throw new ApiError(410, 'This setup link has expired or was already used. Ask the study administrator for a new one.');
  const problem = passwordProblem(password, open.user.email);
  if (problem) throw new ApiError(400, problem);

  tx.setActor(open.user._id);
  // Using the link and setting the password happen together; a second use of the same link conflicts and starts over.
  const used = await tx.updateOne('account_setup_tokens', { _id: open.tokenHash as never, used_at: null }, { $set: { used_at: new Date() } });
  if (!used) throw new ApiError(410, 'This setup link has expired or was already used. Ask the study administrator for a new one.');
  await tx.updateOne('app_users', { _id: open.user._id as never }, { $set: { password_hash: await hashPassword(password), must_change_password: false, updated_at: new Date() } });
  await tx.deleteMany('sessions', { user_id: open.user._id });
  await tx.deleteMany('login_attempts', { _id: open.user.email as never });
  await tx.record('app_users', open.user._id, 'PASSWORD_SET');
}

// ---------------------------------------------------------------------------
// Admin actions (each runs in a transaction whose audit reason is already set)
// ---------------------------------------------------------------------------

export async function createStaff(tx: Tx, admin: AdminActor, body: Record<string, unknown>): Promise<{ member: StaffMember; link: SetupLink }> {
  assertAdmin(admin);
  const name = cleanName(body.name);
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(email)) throw new ApiError(400, 'Enter a valid email address');
  const role = await cleanRole(tx, body.role);
  const isAdmin = body.isAdmin === true;

  const doc = newUserDoc({ email, name, role, isAdmin });
  try {
    await tx.insertOne('app_users', doc);
  } catch (err) {
    if (isDuplicateKey(err)) throw new ApiError(409, 'An account with this email already exists. If it was deactivated, reactivate it instead.');
    throw err;
  }
  const link = await issueSetupLink(tx, doc._id, admin.id);
  return { member: await getStaff(tx, doc._id), link };
}

export async function updateStaff(tx: Tx, admin: AdminActor, id: string, body: Record<string, unknown>): Promise<StaffMember> {
  assertAdmin(admin);
  requireReason(body.reason);
  await lockUser(tx, id);
  const current = await getStaff(tx, id);
  const self = id === admin.id;

  const name = body.name === undefined ? current.name : cleanName(body.name);
  const role = body.role === undefined ? current.role : await cleanRole(tx, body.role);
  const isAdmin = body.isAdmin === undefined ? current.isAdmin : body.isAdmin === true;

  if (self && role !== current.role) throw new ApiError(409, 'Ask the other administrator to change your own role');
  if (self && !isAdmin) throw new ApiError(409, 'You cannot remove your own administrator rights');
  if (current.isAdmin && !isAdmin && current.status !== 'deactivated') await assertAnotherAdmin(tx, id);

  await tx.updateOne('app_users', { _id: id as never }, { $set: { display_name: name, role, is_admin: isAdmin, updated_at: new Date(), updated_by: admin.id } });
  return getStaff(tx, id);
}

export async function setStaffActive(tx: Tx, admin: AdminActor, id: string, active: boolean): Promise<StaffMember> {
  assertAdmin(admin);
  await lockUser(tx, id);
  const current = await getStaff(tx, id);
  if (!active) {
    if (id === admin.id) throw new ApiError(409, 'You cannot deactivate your own account');
    if (current.isAdmin) await assertAnotherAdmin(tx, id);
  }
  await tx.updateOne('app_users', { _id: id as never }, { $set: { active, updated_at: new Date(), updated_by: admin.id } });
  if (!active) {
    await tx.deleteMany('sessions', { user_id: id });
    await cancelSetupLinks(tx, id);
  }
  return getStaff(tx, id);
}

/** Whether anything in the study refers to this account: what PostgreSQL's foreign keys used to guard. */
async function hasRecords(tx: Tx, id: string): Promise<boolean> {
  const counts = await Promise.all([
    tx.count('participants', { created_by: id }),
    tx.count('crf_modules', { $or: [{ completed_by: id }, { updated_by: id }] }),
    tx.count('module_edit_reasons', { user_id: id }),
    tx.count('participant_contacts', { updated_by: id }),
    tx.count('module_delegations', { granted_by: id, user_id: { $ne: id } }),
    tx.count('account_setup_tokens', { created_by: id, user_id: { $ne: id } }),
    tx.count('app_users', { updated_by: id, _id: { $ne: id } as never }),
    tx.count('access_requests', { decided_by: id }),
    tx.count('roles', { $or: [{ created_by: id }, { deleted_by: id }] }),
    tx.count('staff_invites', { $or: [{ created_by: id }, { revoked_by: id }] }),
  ]);
  return counts.some((n) => n > 0);
}

/**
 * Erases an account that nothing refers to. Only the PI and the data manager may; nobody can erase their own
 * account, and only the PI can erase the PI. If the account has entered data or made changes, it is refused and the
 * person is told to deactivate it instead, so the audit trail stays whole.
 */
export async function deleteStaff(tx: Tx, admin: AdminActor & { role: string }, id: string): Promise<void> {
  assertAdmin(admin);
  if (admin.role !== 'pi' && admin.role !== 'data_manager') throw new ApiError(403, 'Only the PI and the data manager can delete accounts');
  if (id === admin.id) throw new ApiError(409, 'You cannot delete your own account');
  await lockUser(tx, id);
  const current = await getStaff(tx, id);
  if (current.role === 'pi' && admin.role !== 'pi') throw new ApiError(403, 'Only the PI can delete the PI account');
  if (current.isAdmin && current.status !== 'deactivated') await assertAnotherAdmin(tx, id);

  if (await hasRecords(tx, id)) {
    throw new ApiError(
      409,
      `${current.name} has entered data or made changes in the study, so the account cannot be erased. Deactivate it instead: they cannot sign in and their name stays on what they entered.`,
    );
  }
  // What went with the account automatically before: its sessions, setup links and delegations; its approved request
  // and invitation keep their record, just without the link to the account.
  await tx.updateMany('access_requests', { user_id: id }, { $set: { user_id: null } });
  await tx.updateMany('staff_invites', { user_id: id }, { $set: { user_id: null } });
  await tx.deleteMany('sessions', { user_id: id });
  await tx.deleteMany('account_setup_tokens', { user_id: id });
  await tx.deleteMany('module_delegations', { user_id: id });
  await tx.deleteOne('app_users', { _id: id as never });
  await tx.deleteMany('login_attempts', { _id: current.email as never });
}

/** Replaces a person's extra modules with the given set. */
export async function setDelegations(tx: Tx, admin: AdminActor, id: string, raw: unknown, reason: string): Promise<StaffMember> {
  assertAdmin(admin);
  await lockUser(tx, id);
  if (!Array.isArray(raw)) throw new ApiError(400, 'Invalid delegations');
  const wanted = new Map<ModuleId, string>();
  for (const item of raw) {
    const moduleId = Number((item as { moduleId?: unknown })?.moduleId);
    const expiresAt = String((item as { expiresAt?: unknown })?.expiresAt ?? '');
    if (!Number.isInteger(moduleId) || moduleId < 1 || moduleId > 10) throw new ApiError(400, 'Invalid module');
    if (expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) throw new ApiError(400, 'Invalid end date');
    wanted.set(moduleId as ModuleId, expiresAt);
  }

  const current = await getStaff(tx, id);
  for (const d of current.delegations) {
    if (!wanted.has(d.moduleId)) await tx.deleteOne('module_delegations', { _id: `${id}:${d.moduleId}` as never });
  }
  for (const [moduleId, expiresAt] of wanted) {
    const existing = current.delegations.find((d) => d.moduleId === moduleId);
    if (!existing) {
      await tx.insertOne('module_delegations', {
        _id: `${id}:${moduleId}`,
        user_id: id,
        module_id: moduleId,
        granted_by: admin.id,
        granted_at: new Date(),
        reason,
        expires_at: expiresAt || null,
      });
    } else if (existing.expiresAt !== expiresAt) {
      await tx.updateOne('module_delegations', { _id: `${id}:${moduleId}` as never }, { $set: { expires_at: expiresAt || null, reason } });
    }
  }
  return getStaff(tx, id);
}

/** Password reset: the old password stops working, the person is signed out, and a new setup link is issued. */
export async function resetStaffPassword(tx: Tx, admin: AdminActor, id: string): Promise<{ member: StaffMember; link: SetupLink }> {
  assertAdmin(admin);
  await lockUser(tx, id);
  const current = await getStaff(tx, id);
  if (current.status === 'deactivated') throw new ApiError(409, 'Reactivate the account before issuing a setup link');
  if (id === admin.id) throw new ApiError(409, 'Ask the other administrator to reset your password');
  await tx.updateOne('app_users', { _id: id as never }, { $set: { password_hash: null, must_change_password: false, updated_at: new Date(), updated_by: admin.id } });
  await tx.deleteMany('sessions', { user_id: id });
  const link = await issueSetupLink(tx, id, admin.id);
  return { member: await getStaff(tx, id), link };
}

/**
 * Gives an account a starting password that must be changed at the first sign-in. Any unused setup link is cancelled,
 * the person is signed out everywhere, and failed-attempt counts are cleared. Shared by the admin screen and the command line.
 */
export async function applyTemporaryPassword(tx: Tx, userId: string, password: string, updatedBy: string | null): Promise<void> {
  const user = await tx.findOne<UserDoc>('app_users', { _id: userId as never, active: true });
  if (!user) throw new ApiError(404, 'Active staff account not found');
  const problem = passwordProblem(password, user.email);
  if (problem) throw new ApiError(400, problem);
  await tx.updateOne('app_users', { _id: userId as never }, { $set: { password_hash: await hashPassword(password), must_change_password: true, updated_at: new Date(), updated_by: updatedBy } });
  await cancelSetupLinks(tx, userId);
  await tx.deleteMany('sessions', { user_id: userId });
  await tx.deleteMany('login_attempts', { _id: user.email as never });
}

/** Administrator action: a temporary password the person must replace at their first sign-in. */
export async function setTemporaryPassword(tx: Tx, admin: AdminActor, id: string, password: unknown): Promise<StaffMember> {
  assertAdmin(admin);
  await lockUser(tx, id);
  const current = await getStaff(tx, id);
  if (current.status === 'deactivated') throw new ApiError(409, 'Reactivate the account first');
  if (id === admin.id) throw new ApiError(409, 'Ask the other administrator to set a temporary password for you');
  if (typeof password !== 'string' || !password) throw new ApiError(400, 'Enter the temporary password');
  await applyTemporaryPassword(tx, id, password, admin.id);
  return getStaff(tx, id);
}

/** A fresh link for someone who has not set their password yet (the earlier link is cancelled). */
export async function resendInvite(tx: Tx, admin: AdminActor, id: string): Promise<{ member: StaffMember; link: SetupLink }> {
  assertAdmin(admin);
  await lockUser(tx, id);
  const current = await getStaff(tx, id);
  if (current.status !== 'invited') throw new ApiError(409, 'This person has already set a password; use Reset password instead');
  const link = await issueSetupLink(tx, id, admin.id);
  return { member: current, link };
}
