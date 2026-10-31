import { randomUUID } from 'node:crypto';
import { hashPassword } from './passwords';
import { ApiError } from './errors';
import { isDuplicateKey } from './mongo/client';
import type { Tx } from './mongo/tx';
import { cleanName, newUserDoc, requireReason } from './staff';
import { cleanRole } from './roles';
import { isRoleKey, type RoleKey } from '../data/roles';
import { EMAIL_RE, passwordProblem } from '../utils/accountRules';
import type { AccessRequest, AccessRequestStatus } from '../types/accessRequests';

/** Open requests stop being valid after this many days. */
export const REQUEST_VALID_DAYS = 14;
/** Safety cap on open requests, so a flood cannot fill the collection. */
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

interface RequestDoc {
  _id: string;
  email: string;
  display_name: string;
  requested_role: string;
  note: string;
  password_hash: string | null;
  status: AccessRequestStatus;
  created_at: Date;
  expires_at: Date;
  decided_by: string | null;
  decided_at: Date | null;
  decision_role: string | null;
  decision_reason: string | null;
  user_id: string | null;
}

/** Marks overdue requests expired and discards their stored passwords. Run in its own transaction before a decision. */
export async function expireStale(tx: Tx) {
  await tx.updateMany('access_requests', { status: 'pending', expires_at: { $lt: new Date() } }, { $set: { status: 'expired', password_hash: null } });
}

/**
 * Records a request. The answer is always the same whether or not it was stored (existing account, open request,
 * full queue), so the form cannot be used to find out which emails have accounts. Two identical requests arriving at
 * the same instant make the second one fail on the unique rule; the route treats that as "already recorded".
 */
export async function submitAccessRequest(tx: Tx, body: Record<string, unknown>): Promise<void> {
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

  await expireStale(tx);
  const existing = await tx.findOne('app_users', { email }, { projection: { _id: 1 } });
  const waiting = await tx.findOne('access_requests', { email, status: 'pending' }, { projection: { _id: 1 } });
  const pending = await tx.count('access_requests', { status: 'pending' });
  if (existing || waiting || pending >= MAX_PENDING) return;

  const now = new Date();
  await tx.insertOne('access_requests', {
    _id: randomUUID(),
    email,
    display_name: name,
    requested_role: requestedRole,
    note,
    password_hash: hash,
    status: 'pending',
    created_at: now,
    expires_at: new Date(now.getTime() + REQUEST_VALID_DAYS * 24 * 3600 * 1000),
    decided_by: null,
    decided_at: null,
    decision_role: null,
    decision_reason: null,
    user_id: null,
  });
}

/** True when an error from submitAccessRequest only means an identical pending request already exists. */
export const isAlreadyRecorded = isDuplicateKey;

const asRole = (r: string | null): RoleKey | '' => r ?? '';

/** Pending requests first, then decisions from the last 30 days. */
export async function listAccessRequests(tx: Tx, actor: PiActor): Promise<AccessRequest[]> {
  assertPi(actor);
  await expireStale(tx);
  const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const rows = await tx.find<RequestDoc>(
    'access_requests',
    { $or: [{ status: 'pending' }, { decided_at: { $gt: cutoff } }, { decided_at: null, expires_at: { $gt: cutoff } }] },
  );
  rows.sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending') || b.created_at.getTime() - a.created_at.getTime());
  const top = rows.slice(0, 200);
  const ids = [...new Set(top.map((r) => r.decided_by).filter((v): v is string => !!v))];
  const people = ids.length ? await tx.find<{ _id: string; display_name: string }>('app_users', { _id: { $in: ids } as never }, { projection: { display_name: 1 } }) : [];
  const nameOf = new Map(people.map((p) => [p._id, p.display_name]));
  return top.map((r) => ({
    id: r._id,
    name: r.display_name,
    email: r.email,
    requestedRole: asRole(r.requested_role) || 'research_officer',
    note: r.note,
    status: r.status,
    createdAt: r.created_at.toISOString(),
    expiresAt: r.expires_at.toISOString(),
    decidedBy: (r.decided_by && nameOf.get(r.decided_by)) || '',
    decidedAt: r.decided_at?.toISOString() ?? '',
    decisionRole: asRole(r.decision_role),
    decisionReason: r.decision_reason ?? '',
  }));
}

/** The request, if it is still open for a decision. Two decisions at once conflict on it and the second starts over. */
async function loadPending(tx: Tx, id: string): Promise<RequestDoc> {
  const row = await tx.findOne<RequestDoc>('access_requests', { _id: id as never });
  if (!row) throw new ApiError(404, 'Request not found');
  if (row.status === 'expired' || (row.status === 'pending' && row.expires_at.getTime() < Date.now())) {
    throw new ApiError(410, `This request expired after ${REQUEST_VALID_DAYS} days. Ask the person to submit a new one.`);
  }
  if (row.status !== 'pending') throw new ApiError(409, 'This request was already decided');
  return row;
}

/** Creates the account with the password the person chose, in the role the PI picks. */
export async function approveAccessRequest(tx: Tx, actor: PiActor, id: string, body: Record<string, unknown>): Promise<void> {
  assertPi(actor);
  const row = await loadPending(tx, id);
  const role = await cleanRole(tx, body.role ?? row.requested_role);
  if (!row.password_hash) throw new ApiError(409, 'This request has no password stored. Reject it and ask the person to submit again.');

  const user = newUserDoc({ email: row.email, name: row.display_name, role, isAdmin: false, passwordHash: row.password_hash });
  try {
    await tx.insertOne('app_users', user);
  } catch (err) {
    if (isDuplicateKey(err)) throw new ApiError(409, 'An account with this email already exists.');
    throw err;
  }
  await tx.updateOne('access_requests', { _id: id as never }, { $set: { status: 'approved', password_hash: null, decided_by: actor.id, decided_at: new Date(), decision_role: role, user_id: user._id } });
}

export async function rejectAccessRequest(tx: Tx, actor: PiActor, id: string, reasonRaw: unknown): Promise<void> {
  assertPi(actor);
  const reason = requireReason(reasonRaw);
  await loadPending(tx, id);
  await tx.updateOne('access_requests', { _id: id as never }, { $set: { status: 'rejected', password_hash: null, decided_by: actor.id, decided_at: new Date(), decision_reason: reason } });
}
