import type { PoolClient } from 'pg';
import { hashPassword } from './passwords';
import { ApiError } from './participants';
import { cleanName, requireReason } from './staff';
import { cleanRole } from './roles';
import { isRoleKey, type RoleKey } from '../data/roles';
import { EMAIL_RE, passwordProblem } from '../utils/accountRules';
import type { AccessRequest, AccessRequestStatus } from '../types/accessRequests';

type Queryable = Pick<PoolClient, 'query'>;

/** Open requests stop being valid after this many days. */
export const REQUEST_VALID_DAYS = 14;
/** Safety cap on open requests, so a flood cannot fill the table. */
const MAX_PENDING = 100;
const MAX_NOTE_LENGTH = 300;
const MIN_NOTE_LENGTH = 5;

export interface PiActor {
  id: string;
  role: RoleKey;
}

/** Only the PI decides who gets an account. */
export function assertPi(actor: PiActor) {
  if (actor.role !== 'pi') throw new ApiError(403, 'Only the PI can review access requests');
}

/** Marks overdue requests expired and discards their stored passwords. Run in its own transaction before a decision. */
export async function expireStale(q: Queryable) {
  await q.query("update access_requests set status = 'expired', password_hash = null where status = 'pending' and expires_at < now()");
}

/**
 * Records a request. The answer is always the same whether or not it was stored (existing account, open request,
 * full queue), so the form cannot be used to find out which emails have accounts.
 */
export async function submitAccessRequest(q: Queryable, body: Record<string, unknown>): Promise<void> {
  const name = cleanName(body.name);
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(email) || email.length > 120) throw new ApiError(400, 'Enter a valid email address');
  // The public form only offers the built-in roles; the PI can give any role when approving.
  if (typeof body.role !== 'string' || !isRoleKey(body.role)) throw new ApiError(400, 'Choose a valid role');
  const requestedRole = body.role;
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (note.length < MIN_NOTE_LENGTH) throw new ApiError(400, 'Say briefly who you are and why you need access');
  if (note.length > MAX_NOTE_LENGTH) throw new ApiError(400, `Keep the note under ${MAX_NOTE_LENGTH} characters`);
  const password = typeof body.password === 'string' ? body.password : '';
  const problem = passwordProblem(password, email);
  if (problem) throw new ApiError(400, problem);

  // Hash first in every case, so the response time does not depend on what happens next.
  const hash = await hashPassword(password);

  await expireStale(q);
  const existing = await q.query('select 1 from app_users where email = $1', [email]);
  const pending = await q.query<{ n: number }>("select count(*)::int as n from access_requests where status = 'pending'");
  if (existing.rowCount || pending.rows[0].n >= MAX_PENDING) return;

  await q.query(
    `insert into access_requests (email, display_name, requested_role, note, password_hash, expires_at)
     values ($1, $2, $3, $4, $5, now() + make_interval(days => $6))
     on conflict (lower(email)) where status = 'pending' do nothing`,
    [email, name, requestedRole, note, hash, REQUEST_VALID_DAYS],
  );
}

interface RequestRow {
  id: string;
  email: string;
  display_name: string;
  requested_role: string;
  note: string;
  status: AccessRequestStatus;
  created_at: Date;
  expires_at: Date;
  decided_by_name: string | null;
  decided_at: Date | null;
  decision_role: string | null;
  decision_reason: string | null;
}

const asRole = (r: string | null): RoleKey | '' => r ?? '';

/** Pending requests first, then decisions from the last 30 days. */
export async function listAccessRequests(q: Queryable, actor: PiActor): Promise<AccessRequest[]> {
  assertPi(actor);
  await expireStale(q);
  const { rows } = await q.query<RequestRow>(
    `select r.id, r.email, r.display_name, r.requested_role, r.note, r.status, r.created_at, r.expires_at,
            d.display_name as decided_by_name, r.decided_at, r.decision_role, r.decision_reason
       from access_requests r left join app_users d on d.id = r.decided_by
      where r.status = 'pending' or coalesce(r.decided_at, r.expires_at) > now() - interval '30 days'
      order by (r.status = 'pending') desc, r.created_at desc
      limit 200`,
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.display_name,
    email: r.email,
    requestedRole: asRole(r.requested_role) || 'research_officer',
    note: r.note,
    status: r.status,
    createdAt: r.created_at.toISOString(),
    expiresAt: r.expires_at.toISOString(),
    decidedBy: r.decided_by_name ?? '',
    decidedAt: r.decided_at?.toISOString() ?? '',
    decisionRole: asRole(r.decision_role),
    decisionReason: r.decision_reason ?? '',
  }));
}

async function lockPending(q: Queryable, id: string) {
  const { rows } = await q.query<{ id: string; email: string; display_name: string; requested_role: string; password_hash: string | null; status: string; expires_at: Date }>(
    'select id, email, display_name, requested_role, password_hash, status, expires_at from access_requests where id = $1 for update',
    [id],
  );
  const row = rows[0];
  if (!row) throw new ApiError(404, 'Request not found');
  if (row.status === 'expired' || (row.status === 'pending' && row.expires_at.getTime() < Date.now())) {
    throw new ApiError(410, `This request expired after ${REQUEST_VALID_DAYS} days. Ask the person to submit a new one.`);
  }
  if (row.status !== 'pending') throw new ApiError(409, 'This request was already decided');
  return row;
}

/** Creates the account with the password the person chose, in the role the PI picks. */
export async function approveAccessRequest(q: Queryable, actor: PiActor, id: string, body: Record<string, unknown>): Promise<void> {
  assertPi(actor);
  const row = await lockPending(q, id);
  const role = await cleanRole(q, body.role ?? row.requested_role);
  if (!row.password_hash) throw new ApiError(409, 'This request has no password stored. Reject it and ask the person to submit again.');

  let userId: string;
  try {
    const { rows } = await q.query<{ id: string }>(
      'insert into app_users (email, display_name, role, is_admin, password_hash) values ($1, $2, $3, false, $4) returning id',
      [row.email, row.display_name, role, row.password_hash],
    );
    userId = rows[0].id;
  } catch (err) {
    if ((err as { code?: string }).code === '23505') throw new ApiError(409, 'An account with this email already exists.');
    throw err;
  }
  await q.query(
    `update access_requests set status = 'approved', password_hash = null, decided_by = $2, decided_at = now(), decision_role = $3, user_id = $4
      where id = $1`,
    [id, actor.id, role, userId],
  );
}

export async function rejectAccessRequest(q: Queryable, actor: PiActor, id: string, reasonRaw: unknown): Promise<void> {
  assertPi(actor);
  const reason = requireReason(reasonRaw);
  await lockPending(q, id);
  await q.query(
    "update access_requests set status = 'rejected', password_hash = null, decided_by = $2, decided_at = now(), decision_reason = $3 where id = $1",
    [id, actor.id, reason],
  );
}
