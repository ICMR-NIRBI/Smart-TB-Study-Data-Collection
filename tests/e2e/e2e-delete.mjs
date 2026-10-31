// End-to-end test of deleting staff accounts against a running server (default http://localhost:3100) and its local test database.
import { openStore } from './lib/store.mjs';

const BASE = process.env.BASE ?? 'http://localhost:3100';
const SEED_PW = process.env.DEV_SEED_PASSWORD;
const stamp = Date.now() % 1000000;

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${extra}`}`);
};

function client() {
  let cookie = '';
  return async (path, { method = 'GET', body } = {}) => {
    const res = await fetch(BASE + path, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      redirect: 'manual',
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, json: await res.json().catch(() => ({})) };
  };
}
const login = async (email) => {
  const c = client();
  const r = await c('/api/auth/login', { method: 'POST', body: { email, password: SEED_PW } });
  if (r.status !== 200) throw new Error(`login ${email}: ${r.status}`);
  return { c, user: r.json.user };
};

const db = await openStore();

const { c: pi, user: piUser } = await login('demo@smarttb.study');
const { c: dm, user: dmUser } = await login('test4@smarttb.study');
const { c: ro } = await login('test1@smarttb.study');

const make = async (c, role, tag) => {
  const email = `del-${tag}-${stamp}@smarttb.study`;
  const r = await c('/api/admin/staff', { method: 'POST', body: { name: `Delete Test ${tag}`, email, role, isAdmin: false } });
  if (r.status !== 200) throw new Error(`create ${tag}: ${r.status} ${JSON.stringify(r.json)}`);
  return r.json.member;
};
const exists = (id) => db.userExists(id);

// --- who may delete
const a = await make(pi, 'phlebotomist', 'a');
let r = await ro(`/api/admin/staff/${a.id}`, { method: 'DELETE', body: { reason: 'not allowed' } });
check('a research officer cannot delete accounts', r.status === 403, `${r.status}`);
r = await dm(`/api/admin/staff/${a.id}`, { method: 'DELETE', body: {} });
check('a reason is required', r.status === 400, `${r.status}`);
r = await dm(`/api/admin/staff/${dmUser.id}`, { method: 'DELETE', body: { reason: 'deleting myself' } });
check('nobody can delete their own account', r.status === 409, `${r.status}`);
r = await dm(`/api/admin/staff/${piUser.id}`, { method: 'DELETE', body: { reason: 'deleting the PI' } });
check('the data manager cannot delete the PI', r.status === 403, `${r.status}`);
r = await pi('/api/admin/staff/00000000-0000-0000-0000-000000000000', { method: 'DELETE', body: { reason: 'no such person' } });
check('an unknown account is not found', r.status === 404, `${r.status}`);

// --- a clean account is erased
r = await dm(`/api/admin/staff/${a.id}`, { method: 'DELETE', body: { reason: 'created by mistake' } });
check('the data manager deletes an unused account', r.status === 200, JSON.stringify(r.json));
check('it is gone from the database', !(await exists(a.id)));
r = await pi('/api/admin/staff');
check('and from the staff list', !r.json.staff.some((s) => s.id === a.id));
const audit = (await db.audit('app_users', a.id)).filter((x) => x.action === 'DELETE');
check('the audit log records the deletion with the reason', audit.length === 1 && audit[0].reason === 'created by mistake', JSON.stringify(audit));
r = await dm('/api/admin/staff', { method: 'POST', body: { name: 'Again', email: `del-a-${stamp}@smarttb.study`, role: 'phlebotomist' } });
check('the same email can be used again', r.status === 200, JSON.stringify(r.json));
const again = r.json.member;

// --- an account that signed in and has a session is still erased (sessions go with it)
const b = await make(pi, 'research_officer', 'b');
await pi(`/api/admin/staff/${b.id}`, { method: 'POST', body: { action: 'temporary', reason: 'testing delete', password: 'Temp-Pass-2026x' } });
const person = client();
r = await person('/api/auth/login', { method: 'POST', body: { email: b.email, password: 'Temp-Pass-2026x' } });
check('the person signs in', r.status === 200, `${r.status}`);
r = await dm(`/api/admin/staff/${b.id}`, { method: 'DELETE', body: { reason: 'left before starting' } });
check('an account that only signed in can be deleted', r.status === 200, JSON.stringify(r.json));
r = await person('/api/auth/session');
check('their session ends', !r.json.user, JSON.stringify(r.json));

// --- an account that did something is refused and kept
const c = await make(pi, 'research_officer', 'c');
await pi(`/api/admin/staff/${c.id}`, { method: 'POST', body: { action: 'temporary', reason: 'testing delete', password: 'Temp-Pass-2026x' } });
const worker = client();
await worker('/api/auth/login', { method: 'POST', body: { email: c.email, password: 'Temp-Pass-2026x' } });
await worker('/api/auth/change-password', { method: 'POST', body: { currentPassword: 'Temp-Pass-2026x', newPassword: 'Own-Pass-2026y' } });
await worker('/api/participants', { method: 'POST', body: {} });
if ((await db.participantsCreatedBy(c.id)) === 0) {
  console.log('NOTE  could not enrol a participant through the API; marking the account with an edit instead');
  await db.markWorkedBy(c.id, `del-a-${stamp}@smarttb.study`);
}
r = await pi(`/api/admin/staff/${c.id}`, { method: 'DELETE', body: { reason: 'trying to erase real work' } });
check('an account that made changes is refused', r.status === 409 && /Deactivate it instead/.test(r.json.error ?? ''), `${r.status} ${JSON.stringify(r.json)}`);
check('and stays in the database', await exists(c.id));
r = await pi(`/api/admin/staff/${c.id}`, { method: 'POST', body: { action: 'deactivate', reason: 'left the study' } });
check('it can be deactivated instead', r.status === 200, JSON.stringify(r.json));

// --- last administrator
const adm = (await pi('/api/admin/staff', { method: 'POST', body: { name: 'Extra Admin', email: `del-adm-${stamp}@smarttb.study`, role: 'phlebotomist', isAdmin: true } })).json.member;
r = await dm(`/api/admin/staff/${adm.id}`, { method: 'DELETE', body: { reason: 'removing the extra admin' } });
check('an extra administrator can be deleted while others remain', r.status === 200, JSON.stringify(r.json));

// clean up what is left
await db.deleteUser(again.id);
await db.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
