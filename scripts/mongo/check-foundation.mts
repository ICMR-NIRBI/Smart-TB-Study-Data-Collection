/*
 * Checks the data layer (src/server/mongo): audit entries, rollbacks, the unique rules carried over from PostgreSQL,
 * and the lock that stands in for "select ... for update".
 *   node --import tsx scripts/mongo/check-foundation.mts
 * Runs as the app login against MONGODB_DB, using test ids that start with a random tag, and removes them afterwards
 * with the owner login.
 */
import './loadenv';
import { MongoClient } from 'mongodb';
import { changesToObject } from '../../src/server/mongo/audit';
import { closeClient, getDb, isDuplicateKey } from '../../src/server/mongo/client';
import { AUDIT_COLLECTION, SPECS, ensureSchema } from '../../src/server/mongo/schema';
import { reader, withTransaction } from '../../src/server/mongo/tx';
import { cleanRole, createRole, deleteRole } from '../../src/server/roles';

const { MONGODB_OWNER_URI, MONGODB_DB } = process.env;
if (!MONGODB_OWNER_URI || !MONGODB_DB) throw new Error('Missing MONGODB_OWNER_URI or MONGODB_DB');

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${extra}`}`);
};
const dup = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return false;
  } catch (e) {
    return isDuplicateKey(e);
  }
};

const tag = `fnd${Date.now() % 100000}`;
const owner = new MongoClient(MONGODB_OWNER_URI);
await owner.connect();

// --- schema
await ensureSchema(owner.db(MONGODB_DB));
await ensureSchema(owner.db(MONGODB_DB));
const have = new Set((await owner.db(MONGODB_DB).listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
check('the schema can be applied twice', SPECS.every((s) => have.has(s.name)));
check('the lock document exists', (await owner.db(MONGODB_DB).collection('locks').findOne({ _id: 'admins' as never })) !== null);

const audit = (table: string, key: string) =>
  getDb().collection(AUDIT_COLLECTION).find({ table_name: table, row_key: key }).sort({ _id: 1 }).toArray();
const now = () => new Date();
const u1 = `${tag}-u1`;

// --- insert is audited, secrets are not
await withTransaction({ userId: `${tag}-admin`, reason: 'New staff account' }, async (tx) => {
  await tx.insertOne('app_users', { _id: u1, email: `${tag}-1@test.org`, display_name: 'One', role: 'phlebotomist', is_admin: false, password_hash: 'scrypt$SECRET$HASH', active: true, created_at: now(), updated_at: now() });
});
let rows = await audit('app_users', u1);
let ch = changesToObject(rows[0]?.changes ?? []);
check('an insert writes one INSERT audit entry', rows.length === 1 && rows[0].action === 'INSERT', JSON.stringify(rows));
check('with the actor and the reason', rows[0]?.user_id === `${tag}-admin` && rows[0].reason === 'New staff account');
check('listing the fields with the key shown as id', ch.id?.new === u1 && ch.role?.new === 'phlebotomist' && ch.email?.new === `${tag}-1@test.org`, JSON.stringify(ch));
check('housekeeping fields are left out', !('updated_at' in ch), JSON.stringify(ch));
check('the password hash never appears, only that a password was set', ch.password_changed?.new === true && !JSON.stringify(rows).includes('SECRET'), JSON.stringify(ch));

// --- update: only real changes are recorded
await withTransaction({ userId: `${tag}-admin`, reason: 'Role changed' }, (tx) => tx.updateOne('app_users', { _id: u1 }, { $set: { role: 'pk_scientist', updated_at: now() } }));
rows = await audit('app_users', u1);
ch = changesToObject(rows[1]?.changes ?? []);
check('an update writes one UPDATE entry with old and new', rows.length === 2 && rows[1].action === 'UPDATE' && ch.role?.old === 'phlebotomist' && ch.role?.new === 'pk_scientist' && Object.keys(ch).length === 1, JSON.stringify(rows[1]));
await withTransaction({ userId: `${tag}-admin` }, (tx) => tx.updateOne('app_users', { _id: u1 }, { $set: { updated_at: now(), last_sign_in_at: now() } }));
check('a change to housekeeping fields only writes no entry', (await audit('app_users', u1)).length === 2);
await withTransaction({ userId: u1, reason: null }, (tx) => tx.updateOne('app_users', { _id: u1 }, { $set: { password_hash: 'scrypt$NEW$HASH' } }));
rows = await audit('app_users', u1);
check('a new password is recorded as password_changed, without the hash', rows.length === 3 && changesToObject(rows[2].changes).password_changed?.new === true && !JSON.stringify(rows).includes('HASH'), JSON.stringify(rows[2]));
check('and with no reason, null', rows[2].reason === null);

// --- the actor can change part-way through (a person setting their own password from a link)
await withTransaction({}, async (tx) => {
  tx.setActor(u1);
  tx.setReason('Joined with an invitation link');
  await tx.updateOne('app_users', { _id: u1 }, { $set: { active: false } });
});
rows = await audit('app_users', u1);
check('setActor and setReason apply to later changes', rows[3]?.user_id === u1 && rows[3].reason === 'Joined with an invitation link');

// --- delete
await withTransaction({ userId: `${tag}-admin`, reason: 'Created by mistake' }, async (tx) => {
  const gone = await tx.deleteOne('app_users', { _id: u1 });
  if (!gone) throw new Error('not found');
});
rows = await audit('app_users', u1);
check('a delete writes a DELETE entry holding what was removed', rows[4]?.action === 'DELETE' && changesToObject(rows[4].changes).email?.old === `${tag}-1@test.org` && !JSON.stringify(rows[4]).includes('HASH'));
check('and the document is gone', (await reader.findOne('app_users', { _id: u1 as never })) === null);

// --- all or nothing
const u2 = `${tag}-u2`;
try {
  await withTransaction({ userId: 'x' }, async (tx) => {
    await tx.insertOne('app_users', { _id: u2, email: `${tag}-2@test.org`, display_name: 'Two', role: 'pi', active: true });
    throw new Error('stop here');
  });
} catch {
  /* expected */
}
check('a failed transaction leaves neither the change nor its audit entry', (await reader.findOne('app_users', { _id: u2 as never })) === null && (await audit('app_users', u2)).length === 0);

// --- explicit audit entries, and collections that are not audited
await withTransaction({ userId: u2 }, async (tx) => {
  await tx.record('sessions', u2, 'SIGN_IN');
  await tx.insertOne('sessions', { _id: `${tag}-tok` as never, user_id: u2, created_at: now() });
  await tx.insertOne('login_attempts', { _id: `${tag}@x.org` as never, fails: 1 });
});
rows = await audit('sessions', u2);
check('record() writes an entry of its own', rows.length === 1 && rows[0].action === 'SIGN_IN' && rows[0].changes.length === 0);
check('a session or login counter writes no audit entry', (await audit('sessions', `${tag}-tok`)).length === 0 && (await audit('login_attempts', `${tag}@x.org`)).length === 0);

// --- updateMany: one entry per document
const many = [1, 2, 3].map((i) => `${tag}-m${i}`);
await withTransaction({ userId: 'x' }, async (tx) => {
  for (const id of many) await tx.insertOne('roles', { _id: id as never, label: `Role ${id}`, modules: [], builtin: false, deleted_at: null });
});
const n = await withTransaction({ userId: 'x', reason: 'bulk' }, (tx) => tx.updateMany('roles', { _id: { $in: many } as never }, { $set: { description: 'changed' } }));
check('updateMany audits every document it changes', n === 3 && (await Promise.all(many.map((id) => audit('roles', id)))).every((r) => r.length === 2 && r[1].action === 'UPDATE'));

// --- the unique rules
check('two accounts cannot share an email', await dup(() => withTransaction({}, async (tx) => {
  await tx.insertOne('app_users', { _id: `${tag}-d1`, email: `${tag}-dup@test.org`, display_name: 'A', role: 'pi' });
  await tx.insertOne('app_users', { _id: `${tag}-d2`, email: `${tag}-dup@test.org`, display_name: 'B', role: 'pi' });
})));
check('a failed duplicate leaves no audit entry behind', (await audit('app_users', `${tag}-d1`)).length === 0);

const pending = (id: string, email: string, status: string) => ({ _id: id as never, email, display_name: 'X', requested_role: 'pi', status, created_at: now() });
await withTransaction({}, (tx) => tx.insertOne('access_requests', pending(`${tag}-r1`, `${tag}-req@test.org`, 'pending')));
check('one pending request per email, whatever the case', await dup(() => withTransaction({}, (tx) => tx.insertOne('access_requests', pending(`${tag}-r2`, `${tag.toUpperCase()}-REQ@test.org`, 'pending')))));
check('a decided request does not block a new one', !(await dup(() => withTransaction({}, async (tx) => {
  await tx.updateOne('access_requests', { _id: `${tag}-r1` as never }, { $set: { status: 'rejected' } });
  await tx.insertOne('access_requests', pending(`${tag}-r3`, `${tag}-req@test.org`, 'pending'));
}))));

await withTransaction({}, (tx) => tx.insertOne('roles', { _id: `${tag}-role-a` as never, label: `Lab ${tag}`, modules: [], builtin: false, deleted_at: null }));
check('a live role name cannot be used twice, whatever the case', await dup(() => withTransaction({}, (tx) => tx.insertOne('roles', { _id: `${tag}-role-b` as never, label: `LAB ${tag}`, modules: [], builtin: false, deleted_at: null }))));
await withTransaction({}, (tx) => tx.updateOne('roles', { _id: `${tag}-role-a` as never }, { $set: { deleted_at: now() } }));
check('a removed role name can be used again', !(await dup(() => withTransaction({}, (tx) => tx.insertOne('roles', { _id: `${tag}-role-b` as never, label: `Lab ${tag}`, modules: [], builtin: false, deleted_at: null })))));

// --- CRF modules: data changes are listed field by field, and a participant id is used once
const mod = (uid: string, id: number, data: Record<string, unknown>) => ({ _id: `${uid}:${id}` as never, participant_uid: uid, module_id: id, data, completed: false });
await withTransaction({ userId: 'x' }, (tx) => tx.insertOne('crf_modules', mod(`${tag}-p1`, 1, { participantId: `${tag}-ID1`, initials: 'AB' })));
await withTransaction({ userId: 'x', reason: 'Correction' }, (tx) => tx.updateOne('crf_modules', { _id: `${tag}-p1:1` as never }, { $set: { data: { participantId: `${tag}-ID1`, initials: 'AC', age: 30 }, updated_at: now() } }));
rows = await audit('crf_modules', `${tag}-p1:1`);
ch = changesToObject(rows[1]?.changes ?? []);
check('a data change is listed as data.<field>, only for what changed', rows.length === 2 && ch['data.initials']?.old === 'AB' && ch['data.initials']?.new === 'AC' && ch['data.age']?.new === 30 && !('data.participantId' in ch), JSON.stringify(ch));
check('the audit key joins the two key fields', rows[0]?.row_key === `${tag}-p1:1`);
check('the same participant id cannot be given to another participant', await dup(() => withTransaction({}, (tx) => tx.insertOne('crf_modules', mod(`${tag}-p2`, 1, { participantId: `${tag}-ID1` })))));
check('empty participant ids do not clash', !(await dup(() => withTransaction({}, async (tx) => {
  await tx.insertOne('crf_modules', mod(`${tag}-p3`, 1, { participantId: '' }));
  await tx.insertOne('crf_modules', mod(`${tag}-p4`, 1, { participantId: '' }));
}))));
check('other modules may hold the same value', !(await dup(() => withTransaction({}, (tx) => tx.insertOne('crf_modules', mod(`${tag}-p1`, 2, { participantId: `${tag}-ID1` }))))));

// --- the lock: two administrators deactivated at the same moment must still leave one
const a1 = `${tag}-a1`;
const a2 = `${tag}-a2`;
await withTransaction({}, async (tx) => {
  for (const [id, em] of [[a1, 'a1'], [a2, 'a2']] as const) await tx.insertOne('app_users', { _id: id, email: `${tag}-${em}@test.org`, display_name: em, role: 'pi', is_admin: true, active: true });
});
const deactivateIfAnotherAdmin = (id: string, lock: boolean) =>
  withTransaction({ userId: 'x', reason: 'race' }, async (tx) => {
    if (lock) await tx.lock('admins');
    const others = await tx.count('app_users', { _id: { $in: [a1, a2], $ne: id } as never, is_admin: true, active: true });
    if (others < 1) return false;
    await new Promise((r) => setTimeout(r, 150)); // keep both transactions open at the same time
    await tx.updateOne('app_users', { _id: id as never }, { $set: { active: false } });
    return true;
  });
const results = await Promise.all([deactivateIfAnotherAdmin(a1, true), deactivateIfAnotherAdmin(a2, true)]);
const stillActive = await reader.count('app_users', { _id: { $in: [a1, a2] } as never, active: true });
check('with the lock, two admins cannot both be deactivated', stillActive === 1 && results.filter(Boolean).length === 1, `${stillActive} active, results ${results}`);

// Control: the same race without the lock really does lose both (so the lock is what protects it).
const b1 = `${tag}-b1`;
const b2 = `${tag}-b2`;
await withTransaction({}, async (tx) => {
  for (const [id, em] of [[b1, 'b1'], [b2, 'b2']] as const) await tx.insertOne('app_users', { _id: id, email: `${tag}-${em}@test.org`, display_name: em, role: 'pi', is_admin: true, active: true });
});
const racy = (id: string, other: string) =>
  withTransaction({ userId: 'x', reason: 'race' }, async (tx) => {
    const others = await tx.count('app_users', { _id: other as never, is_admin: true, active: true });
    if (others < 1) return;
    await new Promise((r) => setTimeout(r, 150));
    await tx.updateOne('app_users', { _id: id as never }, { $set: { active: false } });
  });
await Promise.all([racy(b1, b2), racy(b2, b1)]);
check('without the lock the same race leaves no admin (why the lock exists)', (await reader.count('app_users', { _id: { $in: [b1, b2] } as never, active: true })) === 0);

// --- giving someone a role while it is being removed: never both (the per-role lock)
const piActor = { id: 'x', role: 'pi' };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bothWorked = 0;
const outcomes = new Set<string>();
for (let round = 0; round < 4; round++) {
  const rr = await withTransaction({ userId: 'x' }, (tx) => createRole(tx, piActor, { label: `Race ${tag} ${round}`, modules: [] }));
  const holderId = `${tag}-race-${round}`;
  const assign = withTransaction({ userId: 'x' }, async (tx) => {
    const key = await cleanRole(tx, rr.key);
    await sleep(120 - round * 30); // vary which one gets there first
    await tx.insertOne('app_users', { _id: holderId, email: `${holderId}@test.org`, display_name: 'R', role: key, active: true });
    return 'assigned';
  }).catch((e: { status?: number; message: string }) => `assign refused ${e.status ?? e.message}`);
  const remove = withTransaction({ userId: 'x' }, async (tx) => {
    await sleep(round * 40);
    await deleteRole(tx, piActor, rr.key);
    return 'removed';
  }).catch((e: { status?: number; message: string }) => `remove refused ${e.status ?? e.message}`);
  const [a, b] = await Promise.all([assign, remove]);
  outcomes.add(`${a} / ${b}`);
  const roleGone = (await reader.findOne('roles', { _id: rr.key as never }))?.deleted_at != null;
  const held = (await reader.findOne('app_users', { _id: holderId as never })) !== null;
  if (roleGone && held) bothWorked++;
}
check('a role is never removed and given to someone at the same moment', bothWorked === 0, [...outcomes].join(' | '));
check('and the outcomes are the two allowed ones', [...outcomes].every((o) => o === 'assigned / remove refused 409' || o === 'assign refused 400 / removed'), [...outcomes].join(' | '));

// --- tidy up (owner login: the app login cannot remove audit entries)
for (const spec of SPECS) {
  if (spec.name === AUDIT_COLLECTION) continue;
  await owner.db(MONGODB_DB).collection(spec.name).deleteMany({ $or: [{ _id: { $regex: `^${tag}` } as never }, { participant_uid: { $regex: `^${tag}` } }] });
}
await owner.db(MONGODB_DB).collection('login_attempts').deleteMany({ _id: { $regex: `^${tag}` } as never });
await owner.db(MONGODB_DB).collection(AUDIT_COLLECTION).deleteMany({ row_key: { $regex: `^${tag}` } });
await owner.db(MONGODB_DB).collection('roles').deleteMany({ label: { $regex: `^Race ${tag}` } });
await owner.db(MONGODB_DB).collection('locks').deleteMany({ _id: { $regex: '^role:custom_' } as never });
await owner.db(MONGODB_DB).collection('locks').updateOne({ _id: 'admins' as never }, { $set: { n: 0 } });
await owner.close();
await closeClient();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
