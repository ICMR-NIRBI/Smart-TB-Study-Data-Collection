import { randomBytes, randomUUID } from 'node:crypto';
import { hashPassword, hashToken } from './passwords';
import { ApiError } from './errors';
import { isDuplicateKey } from './mongo/client';
import type { Reads, Tx } from './mongo/tx';
import { roleLabel, isRoleKey } from '../data/roles';
import { cleanRole, customRoleLabels } from './roles';
import { assertAdmin, cleanName, newUserDoc, type AdminActor } from './staff';
import { EMAIL_RE, passwordProblem } from '../utils/accountRules';
import type { StaffInvite } from '../types/invites';
import type { SetupLink } from '../types/staff';

const INVITE_HOURS = 72;
const GONE = 'This invitation link has expired or was already used. Ask the study administrator for a new one.';

interface InviteDoc {
  _id: string;
  token_hash: string;
  role: string;
  is_admin: boolean;
  created_by: string;
  created_at: Date;
  expires_at: Date;
  used_at: Date | null;
  revoked_at: Date | null;
}

/** Makes a one-time link for a role. The person who opens it fills in their own name, email and password. */
export async function createInvite(tx: Tx, admin: AdminActor, body: Record<string, unknown>): Promise<{ invite: StaffInvite; link: SetupLink }> {
  assertAdmin(admin);
  const role = await cleanRole(tx, body.role);
  const isAdmin = body.isAdmin === true;
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + INVITE_HOURS * 3600 * 1000);
  const id = randomUUID();
  await tx.insertOne('staff_invites', {
    _id: id,
    token_hash: hashToken(token),
    role,
    is_admin: isAdmin,
    created_by: admin.id,
    created_at: new Date(),
    expires_at: expiresAt,
    used_at: null,
    revoked_at: null,
    revoked_by: null,
    user_id: null,
  });
  const invite = (await listInvites(tx)).find((i) => i.id === id);
  if (!invite) throw new ApiError(500, 'Could not create the invitation');
  return { invite, link: { token, expiresAt: expiresAt.toISOString() } };
}

/** Invitations that can still be used, newest first. */
export async function listInvites(q: Reads): Promise<StaffInvite[]> {
  const custom = await customRoleLabels(q);
  const rows = await q.find<InviteDoc>('staff_invites', { used_at: null, revoked_at: null, expires_at: { $gt: new Date() } }, { sort: { created_at: -1 } });
  const ids = [...new Set(rows.map((r) => r.created_by))];
  const people = ids.length ? await q.find<{ _id: string; display_name: string }>('app_users', { _id: { $in: ids } as never }, { projection: { display_name: 1 } }) : [];
  const nameOf = new Map(people.map((p) => [p._id, p.display_name]));
  return rows.map((r) => ({
    id: r._id,
    role: r.role,
    roleLabel: roleLabel(r.role, custom),
    isAdmin: r.is_admin,
    createdAt: r.created_at.toISOString(),
    expiresAt: r.expires_at.toISOString(),
    createdBy: nameOf.get(r.created_by) ?? '',
  }));
}

/** Withdraws an invitation before anyone has used it. */
export async function revokeInvite(tx: Tx, admin: AdminActor, id: string): Promise<void> {
  assertAdmin(admin);
  const revoked = await tx.updateOne(
    'staff_invites',
    { _id: id as never, used_at: null, revoked_at: null, expires_at: { $gt: new Date() } },
    { $set: { revoked_at: new Date(), revoked_by: admin.id } },
  );
  if (!revoked) throw new ApiError(404, 'This invitation is no longer open');
}

/** Whether a role can still be given out: a built-in one always, a custom one until it is removed. */
async function roleIsLive(q: Reads, role: string): Promise<boolean> {
  return isRoleKey(role) || (await q.findOne('roles', { _id: role as never, deleted_at: null }, { projection: { _id: 1 } })) !== null;
}

/** The role a link is for, so the page can say what the person is joining as. */
export async function describeInvite(q: Reads, token: string): Promise<{ roleLabel: string } | null> {
  const invite = await q.findOne<InviteDoc>('staff_invites', { token_hash: hashToken(token), used_at: null, revoked_at: null, expires_at: { $gt: new Date() } });
  if (!invite || !(await roleIsLive(q, invite.role))) return null;
  return { roleLabel: roleLabel(invite.role, await customRoleLabels(q)) };
}

/** Creates the account from a link: the person gives their own name, email and password. The link works once. */
export async function acceptInvite(tx: Tx, token: string, body: Record<string, unknown>): Promise<void> {
  const id = randomUUID();
  tx.setActor(id);
  tx.setReason('Joined with an invitation link');

  // Using the link is the first write, and it only matches an unused link: two people opening it at the same moment
  // cannot both succeed (the loser starts over and finds it used). Everything after it is rolled back if refused.
  const invite = await tx.updateOne(
    'staff_invites',
    { token_hash: hashToken(token), used_at: null, revoked_at: null, expires_at: { $gt: new Date() } },
    { $set: { used_at: new Date(), user_id: id } },
  );
  if (!invite || !(await roleIsLive(tx, String(invite.role)))) throw new ApiError(410, GONE);

  const name = cleanName(body.name);
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(email)) throw new ApiError(400, 'Enter a valid email address');
  const password = typeof body.password === 'string' ? body.password : '';
  const problem = passwordProblem(password, email);
  if (problem) throw new ApiError(400, problem);

  try {
    await tx.insertOne('app_users', newUserDoc({ id, email, name, role: String(invite.role), isAdmin: invite.is_admin === true, passwordHash: await hashPassword(password) }));
  } catch (err) {
    if (isDuplicateKey(err)) {
      throw new ApiError(409, 'An account with this email already exists. If it is yours, log in. Otherwise ask the study administrator.');
    }
    throw err;
  }
  await tx.deleteMany('login_attempts', { _id: email as never });
}
