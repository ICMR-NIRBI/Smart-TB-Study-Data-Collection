// End-to-end test of access requests against a running server (default http://localhost:3100) and its local test database.
import { openStore } from './lib/store.mjs';

const BASE = process.env.BASE ?? 'http://localhost:3100';
const SEED_PW = process.env.DEV_SEED_PASSWORD;
const stamp = Date.now() % 1000000;
const mail = (n) => `req${n}-${stamp}@smarttb.study`;
const CHOSEN = 'Chosen-Pass-2026';

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${extra}`}`);
};

let ipCounter = 10;
const nextIp = () => `198.51.100.${ipCounter++}`;

function client() {
  let cookie = '';
  return async (path, { method = 'GET', body, headers = {} } = {}) => {
    const res = await fetch(BASE + path, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
      redirect: 'manual',
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  };
}

const anon = client();
const submit = (over = {}, headers = {}) =>
  anon('/api/access-requests', {
    method: 'POST',
    headers: { 'x-forwarded-for': nextIp(), ...headers },
    body: { name: 'Request Person', email: mail(1), role: 'pi', note: 'Research officer at the site, collecting data', password: CHOSEN, website: '', ...over },
  });

const db = await openStore();
const rows = (email) => db.requests(email);

// --- validation
let r = await submit({ password: 'short1' });
check('a weak password is refused', r.status === 400, `${r.status}`);
r = await submit({ email: 'not-an-email' });
check('a bad email is refused', r.status === 400, `${r.status}`);
r = await submit({ note: 'hi' });
check('an empty reason is refused', r.status === 400, `${r.status}`);
r = await submit({ role: 'superuser' });
check('an invalid role is refused', r.status === 400, `${r.status}`);
r = await submit({ name: 'X' });
check('a one-letter name is refused', r.status === 400, `${r.status}`);

// --- valid request
r = await submit();
check('a valid request is accepted', r.status === 200 && r.json.ok === true, JSON.stringify(r.json));
let pending = await rows(mail(1));
check('it is stored as pending, with the password hashed', pending.length === 1 && pending[0].status === 'pending' && pending[0].password_hash?.startsWith('scrypt$') && !pending[0].password_hash.includes(CHOSEN), JSON.stringify(pending[0] ?? {}).slice(0, 200));
check('it expires in about 14 days', pending[0] && Math.abs(new Date(pending[0].expires_at) - Date.now() - 14 * 86400000) < 3600000);

r = await submit();
pending = await rows(mail(1));
check('sending it again answers the same and stores nothing extra', r.status === 200 && pending.length === 1, `${r.status} rows=${pending.length}`);

r = await submit({ email: 'test1@smarttb.study' });
check('an existing account email answers the same and stores nothing', r.status === 200 && (await rows('test1@smarttb.study')).length === 0, `${r.status}`);

r = await submit({ email: mail(99), website: 'http://spam.example' });
check('the hidden trap field is answered quietly and stores nothing', r.status === 200 && (await rows(mail(99))).length === 0, `${r.status}`);

r = await submit({ email: mail(98) }, { Origin: 'http://evil.example' });
check('a cross-site post is rejected', r.status === 403, `${r.status}`);

// --- not approved yet
const requester = client();
r = await requester('/api/auth/login', { method: 'POST', body: { email: mail(1), password: CHOSEN } });
check('they cannot sign in before approval', r.status === 401, `${r.status}`);

// --- who may review
r = await anon('/api/admin/requests');
check('signed-out visitors cannot see requests', r.status === 401, `${r.status}`);
const ro = client();
await ro('/api/auth/login', { method: 'POST', body: { email: 'test1@smarttb.study', password: SEED_PW } });
r = await ro('/api/admin/requests');
check('a research officer cannot see requests', r.status === 403, `${r.status}`);
const dm = client();
await dm('/api/auth/login', { method: 'POST', body: { email: 'test4@smarttb.study', password: SEED_PW } });
r = await dm('/api/admin/requests');
check('the data manager (an admin, not the PI) cannot see requests', r.status === 403, `${r.status}`);
const reqId = pending[0].id;
r = await dm(`/api/admin/requests/${reqId}`, { method: 'POST', body: { action: 'approve' } });
check('the data manager cannot approve', r.status === 403, `${r.status}`);

// --- PI reviews
const pi = client();
r = await pi('/api/auth/login', { method: 'POST', body: { email: 'demo@smarttb.study', password: SEED_PW } });
check('the PI signs in', r.status === 200 && r.json.user?.role === 'pi', JSON.stringify(r.json).slice(0, 100));
r = await pi('/api/admin/requests');
const mine = (r.json.requests ?? []).find((x) => x.email === mail(1));
check('the PI sees the pending request with its details', r.status === 200 && mine?.status === 'pending' && mine.requestedRole === 'pi' && mine.name === 'Request Person' && mine.note.includes('Research officer'), JSON.stringify(mine));
check('the list never contains a password or hash', !JSON.stringify(r.json).includes('scrypt') && !JSON.stringify(r.json).includes(CHOSEN));

r = await pi(`/api/admin/requests/${reqId}`, { method: 'POST', body: { action: 'approve', role: 'invalid' } });
check('approving with an invalid role is refused', r.status === 400, `${r.status}`);
r = await pi(`/api/admin/requests/${reqId}`, { method: 'POST', body: { action: 'approve', role: 'phlebotomist' } });
check('the PI approves, choosing a different role than asked', r.status === 200, JSON.stringify(r.json));
let acct = await db.user(mail(1));
check('the account exists with the PI’s role, not an admin, no forced change', acct?.role === 'phlebotomist' && acct.is_admin === false && acct.active && acct.must_change_password === false, JSON.stringify(acct));
let after = (await rows(mail(1)))[0];
check('the request is marked approved and the stored password is cleared', after.status === 'approved' && after.password_hash === null && after.decision_role === 'phlebotomist' && after.user_id === acct.id, JSON.stringify(after));
r = await requester('/api/auth/login', { method: 'POST', body: { email: mail(1), password: CHOSEN } });
check('they sign in with the password they chose', r.status === 200 && r.json.user?.roleLabel === 'Phlebotomist' && r.json.user?.mustChangePassword === false, JSON.stringify(r.json).slice(0, 140));
r = await pi(`/api/admin/requests/${reqId}`, { method: 'POST', body: { action: 'approve' } });
check('deciding twice is refused', r.status === 409, `${r.status}`);

// --- rejection
await submit({ email: mail(2), name: 'Second Person', role: 'research_officer' });
const id2 = (await rows(mail(2)))[0].id;
r = await pi(`/api/admin/requests/${id2}`, { method: 'POST', body: { action: 'reject', reason: 'no' } });
check('rejecting needs a proper reason', r.status === 400, `${r.status}`);
r = await pi(`/api/admin/requests/${id2}`, { method: 'POST', body: { action: 'reject', reason: 'Not part of the study team' } });
check('the PI rejects with a reason', r.status === 200, JSON.stringify(r.json));
after = (await rows(mail(2)))[0];
check('rejected: no account, password cleared, reason kept', after.status === 'rejected' && after.password_hash === null && after.decision_reason === 'Not part of the study team' && !(await db.user(mail(2))), JSON.stringify(after));
r = await anon('/api/auth/login', { method: 'POST', body: { email: mail(2), password: CHOSEN } });
check('a rejected person cannot sign in', r.status === 401, `${r.status}`);
r = await submit({ email: mail(2), name: 'Second Person', role: 'research_officer' });
check('they can send a fresh request after a rejection', r.status === 200 && (await rows(mail(2))).filter((x) => x.status === 'pending').length === 1);

// --- expiry
await submit({ email: mail(3), name: 'Third Person', role: 'pk_scientist' });
const id3 = (await rows(mail(3)))[0].id;
await db.expireRequestById(id3);
r = await pi(`/api/admin/requests/${id3}`, { method: 'POST', body: { action: 'approve' } });
check('an expired request cannot be approved', r.status === 410, `${r.status}`);
after = (await rows(mail(3)))[0];
check('and it is marked expired with the password cleared', after.status === 'expired' && after.password_hash === null, JSON.stringify(after));
await submit({ email: mail(4), name: 'Fourth Person', role: 'pk_scientist' });
await db.expireRequestsByEmail(mail(4));
r = await pi('/api/admin/requests');
check('listing marks stale requests as expired', (r.json.requests ?? []).find((x) => x.email === mail(4))?.status === 'expired');

// --- an account created in the meantime
await submit({ email: mail(5), name: 'Fifth Person', role: 'research_officer' });
const id5 = (await rows(mail(5)))[0].id;
await pi('/api/admin/staff', { method: 'POST', body: { name: 'Fifth Person', email: mail(5), role: 'research_officer' } });
r = await pi(`/api/admin/requests/${id5}`, { method: 'POST', body: { action: 'approve' } });
check('approving when the email already has an account is refused', r.status === 409, `${r.status}`);

// --- audit
const audit = await db.audit('access_requests', reqId);
const blob = audit.map((x) => x.changes).join(' ');
check('the audit log records the request and the decision, with no password', audit.length >= 2 && audit.some((x) => x.reason === 'Access request approved') && !blob.includes('scrypt') && !blob.includes(CHOSEN), `${audit.length} ${blob.slice(0, 200)}`);

// --- flood control (separate address, so earlier tests are unaffected)
const flood = '203.0.113.77';
const codes = [];
for (let i = 0; i < 7; i++) codes.push((await submit({ email: `flood${i}-${stamp}@smarttb.study` }, { 'x-forwarded-for': flood })).status);
check('one address is limited to 5 requests an hour', codes.slice(0, 5).every((c) => c === 200) && codes[5] === 429 && codes[6] === 429, codes.join(','));

// cleanup of rows this test made
await db.deleteSessionsOfUsersLike(`req%-${stamp}@smarttb.study`);
await db.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
