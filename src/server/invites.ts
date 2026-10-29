import { randomBytes, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { hashPassword, hashToken } from './passwords';
import { ApiError } from './participants';
import { roleLabel } from '../data/roles';
import { cleanRole, customRoleLabels } from './roles';
import { assertAdmin, cleanName, type AdminActor } from './staff';
import { EMAIL_RE, passwordProblem } from '../utils/accountRules';
import type { StaffInvite } from '../types/invites';
import type { SetupLink } from '../types/staff';

type Queryable = Pick<PoolClient, 'query'>;

const INVITE_HOURS = 72;
const GONE = 'This invitation link has expired or was already used. Ask the study administrator for a new one.';

/** Makes a one-time link for a role. The person who opens it fills in their own name, email and password. */
export async function createInvite(q: Queryable, admin: AdminActor, body: Record<string, unknown>): Promise<{ invite: StaffInvite; link: SetupLink }> {
  assertAdmin(admin);
  const role = await cleanRole(q, body.role);
  const isAdmin = body.isAdmin === true;
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + INVITE_HOURS * 3600 * 1000);
  const { rows } = await q.query<{ id: string }>(
    'insert into staff_invites (token_hash, role, is_admin, created_by, expires_at) values ($1, $2, $3, $4, $5) returning id',
    [hashToken(token), role, isAdmin, admin.id, expiresAt],
  );
  const invite = (await listInvites(q)).find((i) => i.id === rows[0].id);
  if (!invite) throw new ApiError(500, 'Could not create the invitation');
  return { invite, link: { token, expiresAt: expiresAt.toISOString() } };
}

/** Invitations that can still be used, newest first. */
export async function listInvites(q: Queryable): Promise<StaffInvite[]> {
  const custom = await customRoleLabels(q);
  const { rows } = await q.query<{ id: string; role: string; is_admin: boolean; created_at: Date; expires_at: Date; created_by_name: string }>(
    `select i.id, i.role, i.is_admin, i.created_at, i.expires_at, u.display_name as created_by_name
       from staff_invites i join app_users u on u.id = i.created_by
      where i.used_at is null and i.revoked_at is null and i.expires_at > now()
      order by i.created_at desc`,
  );
  return rows.map((r) => ({
    id: r.id,
    role: r.role,
    roleLabel: roleLabel(r.role, custom),
    isAdmin: r.is_admin,
    createdAt: r.created_at.toISOString(),
    expiresAt: r.expires_at.toISOString(),
    createdBy: r.created_by_name,
  }));
}

/** Withdraws an invitation before anyone has used it. */
export async function revokeInvite(q: Queryable, admin: AdminActor, id: string): Promise<void> {
  assertAdmin(admin);
  const { rowCount } = await q.query(
    'update staff_invites set revoked_at = now(), revoked_by = $2 where id = $1 and used_at is null and revoked_at is null and expires_at > now()',
    [id, admin.id],
  );
  if (!rowCount) throw new ApiError(404, 'This invitation is no longer open');
}

/** The role a link is for, so the page can say what the person is joining as. */
export async function describeInvite(q: Queryable, token: string): Promise<{ roleLabel: string } | null> {
  const custom = await customRoleLabels(q);
  const { rows } = await q.query<{ role: string }>(
    `select i.role from staff_invites i join roles r on r.key = i.role and r.deleted_at is null
      where i.token_hash = $1 and i.used_at is null and i.revoked_at is null and i.expires_at > now()`,
    [hashToken(token)],
  );
  return rows[0] ? { roleLabel: roleLabel(rows[0].role, custom) } : null;
}

/** Creates the account from a link: the person gives their own name, email and password. The link works once. */
export async function acceptInvite(q: Queryable, token: string, body: Record<string, unknown>): Promise<void> {
  const { rows } = await q.query<{ id: string; role: string; is_admin: boolean }>(
    `select i.id, i.role, i.is_admin from staff_invites i join roles r on r.key = i.role and r.deleted_at is null
      where i.token_hash = $1 and i.used_at is null and i.revoked_at is null and i.expires_at > now()
      for update of i`,
    [hashToken(token)],
  );
  const invite = rows[0];
  if (!invite) throw new ApiError(410, GONE);

  const name = cleanName(body.name);
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(email)) throw new ApiError(400, 'Enter a valid email address');
  const password = typeof body.password === 'string' ? body.password : '';
  const problem = passwordProblem(password, email);
  if (problem) throw new ApiError(400, problem);

  const id = randomUUID();
  await q.query("select set_config('app.user_id', $1, true), set_config('app.reason', $2, true)", [id, 'Joined with an invitation link']);
  try {
    await q.query(
      'insert into app_users (id, email, display_name, role, is_admin, password_hash, must_change_password) values ($1, $2, $3, $4, $5, $6, false)',
      [id, email, name, invite.role, invite.is_admin, await hashPassword(password)],
    );
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      throw new ApiError(409, 'An account with this email already exists. If it is yours, log in. Otherwise ask the study administrator.');
    }
    throw err;
  }
  await q.query('update staff_invites set used_at = now(), user_id = $2 where id = $1', [invite.id, id]);
  await q.query('delete from login_attempts where email = $1', [email]);
}
