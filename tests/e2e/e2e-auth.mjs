// Sign-in, sessions, lockout, password change and delegations. Uses only HTTP plus the database adapter, so it runs
// the same on either database. Default server: http://localhost:3100.
import { openStore } from './lib/store.mjs';

const BASE = process.env.BASE ?? 'http://localhost:3100';
const stamp = Date.now() % 1000000;
const PW = 'Start-Pass-2026a';

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${extra}`}`);
};

function client(extraHeaders = {}) {
  let cookie = '';
  const call = async (path, { method = 'GET', body, headers = {} } = {}) => {
    const res = await fetch(BASE + path, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...extraHeaders, ...headers },
      body: body ? JSON.stringify(body) : undefined,
      redirect: 'manual',
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, json: await res.json().catch(() => ({})), setCookie: set ?? '' };
  };
  return call;
}

const db = await openStore();
const mkEmail = (tag) => `auth-${tag}-${stamp}@smarttb.study`;
const mkUser = async (tag, opts = {}) => {
  const email = mkEmail(tag);
  const id = await db.createUser({ email, role: 'phlebotomist', password: PW, ...opts });
  return { email, id };
};
const login = async (email, password = PW) => {
  const c = client();
  const r = await c('/api/auth/login', { method: 'POST', body: { email, password } });
  return { c, r };
};

// --- a normal sign-in
const a = await mkUser('a');
let { c: ca, r } = await login(a.email);
check('a correct sign-in succeeds', r.status === 200 && r.json.ok === true, `${r.status} ${JSON.stringify(r.json)}`);
check('and tells the app who they are, what the role is and what it may fill in', r.json.user?.email === a.email && r.json.user.role === 'phlebotomist' && r.json.user.roleLabel === 'Phlebotomist' && JSON.stringify(r.json.user.entryModules) === '[5,9]' && r.json.user.isAdmin === false && r.json.user.mustChangePassword === false, JSON.stringify(r.json.user));
check('the cookie is httpOnly and same-site strict', /HttpOnly/i.test(r.setCookie) && /SameSite=strict/i.test(r.setCookie), r.setCookie);
check('nothing secret is in the response', !/password_hash|scrypt/i.test(JSON.stringify(r.json)), JSON.stringify(r.json));
r = await ca('/api/auth/session');
check('the session call returns the same person', r.json.user?.email === a.email, JSON.stringify(r.json));
r = await client()('/api/auth/session');
check('without the cookie there is no session', r.json.user === null, JSON.stringify(r.json));
r = (await login(`  ${a.email.toUpperCase()}  `)).r;
check('the email is trimmed and its case ignored', r.status === 200, `${r.status}`);

// --- failures
r = await client()('/api/auth/login', { method: 'POST', body: { email: a.email, password: 'wrong-password-1' } });
check('a wrong password is refused and the attempts left are shown', r.status === 401 && /Incorrect email or password/.test(r.json.error) && /4 attempts remaining/.test(r.json.error), JSON.stringify(r.json));
r = await client()('/api/auth/login', { method: 'POST', body: { email: mkEmail('nobody'), password: PW } });
check('an unknown email gets the same refusal (nothing reveals who has an account)', r.status === 401 && /Incorrect email or password/.test(r.json.error), JSON.stringify(r.json));
check('and unknown emails are counted too', (await db.loginAttempt(mkEmail('nobody')))?.fails === 1);
r = await client()('/api/auth/login', { method: 'POST', body: { email: '', password: '' } });
check('an empty form is a 400', r.status === 400, `${r.status}`);
r = await client({ Origin: 'http://evil.example' })('/api/auth/login', { method: 'POST', body: { email: a.email, password: PW } });
check('a cross-site request is refused', r.status === 403, `${r.status}`);

// --- lockout
const b = await mkUser('b');
const wrong = () => client()('/api/auth/login', { method: 'POST', body: { email: b.email, password: 'wrong-password-1' } });
const results = [];
for (let i = 0; i < 5; i++) results.push(await wrong());
check('four wrong tries are refused with a count, the fifth locks', results.slice(0, 4).every((x, i) => x.status === 401 && x.json.error.includes(`${4 - i} attempt`)) && results[4].status === 429 && results[4].json.locked === true, results.map((x) => x.status).join(','));
r = (await login(b.email)).r;
check('while locked, even the right password is refused', r.status === 429, `${r.status} ${JSON.stringify(r.json)}`);
const att = await db.loginAttempt(b.email);
check('the lock is recorded with an end time', att?.fails >= 5 && !!att.locked_until && new Date(att.locked_until) > new Date(), JSON.stringify(att));
await db.clearAttempts(b.email);
r = (await login(b.email)).r;
check('after the lock ends the right password works', r.status === 200, `${r.status}`);
check('and a successful sign-in clears the counter', !(await db.loginAttempt(b.email)));
const b2 = await mkUser('b2');
await client()('/api/auth/login', { method: 'POST', body: { email: b2.email, password: 'wrong-password-1' } });
await login(b2.email);
check('two wrong tries then a right one leaves nothing counted', !(await db.loginAttempt(b2.email)));

// --- deactivated accounts
const d = await mkUser('d');
const { c: cd } = await login(d.email);
await db.setUserField(d.email, 'active', false);
r = await cd('/api/auth/session');
check('deactivating an account ends its session at the next request', r.json.user === null, JSON.stringify(r.json));
check('and removes the session', (await db.sessionCount(d.id)) === 0);
r = (await login(d.email)).r;
check('a deactivated account cannot sign in', r.status === 401, `${r.status}`);

// --- the audit trail and signing out
let audit = await db.audit('sessions', a.id);
check('each sign-in is recorded', audit.filter((x) => x.action === 'SIGN_IN').length >= 2, JSON.stringify(audit));
r = await ca('/api/auth/logout', { method: 'POST' });
check('signing out works', r.status === 200, `${r.status}`);
r = await ca('/api/auth/session');
check('and ends the session', r.json.user === null, JSON.stringify(r.json));
audit = await db.audit('sessions', a.id);
check('the sign-out is recorded', audit.some((x) => x.action === 'SIGN_OUT'), JSON.stringify(audit));
r = await client()('/api/auth/logout', { method: 'POST' });
check('signing out with no session is harmless', r.status === 200, `${r.status}`);

// --- idle and maximum session time (the server enforces both)
const e = await mkUser('e');
let { c: ce } = await login(e.email);
await db.ageSessions(e.id, { lastActiveMinutes: 14 });
r = await ce('/api/auth/session');
check('14 minutes idle is still signed in', r.json.user?.email === e.email, JSON.stringify(r.json));
await db.ageSessions(e.id, { lastActiveMinutes: 16 });
r = await ce('/api/auth/session');
check('16 minutes idle is signed out', r.json.user === null, JSON.stringify(r.json));
check('and the session is removed', (await db.sessionCount(e.id)) === 0);
({ c: ce } = await login(e.email));
await db.ageSessions(e.id, { createdHours: 13 });
r = await ce('/api/auth/session');
check('a session older than 12 hours ends even if used just now', r.json.user === null, JSON.stringify(r.json));

// --- temporary passwords: only choosing a new one is allowed
const t = await mkUser('t', { role: 'pi', isAdmin: true, mustChange: true });
const { c: ct, r: rt } = await login(t.email);
check('a temporary-password sign-in is flagged', rt.json.user?.mustChangePassword === true, JSON.stringify(rt.json.user));
r = await ct('/api/admin/roles');
check('and nothing else is allowed until the password is changed', r.status === 403 && r.json.details?.code === 'PASSWORD_CHANGE_REQUIRED', `${r.status} ${JSON.stringify(r.json)}`);

// --- changing your own password
const p = await mkUser('p', { role: 'pi', isAdmin: true });
const { c: cp1 } = await login(p.email);
const { c: cp2 } = await login(p.email);
const change = (c, currentPassword, newPassword) => c('/api/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } });
r = await change(cp1, 'not-the-password-1', 'Brand-New-Pass-2027');
check('a wrong current password is refused', r.status === 400 && /current password is not correct/.test(r.json.error), `${r.status} ${JSON.stringify(r.json)}`);
check('and counts towards the lockout', (await db.loginAttempt(p.email))?.fails === 1);
r = await change(cp1, PW, 'short1');
check('a weak new password is refused', r.status === 400, `${r.status}`);
r = await change(cp1, PW, PW);
check('the same password again is refused', r.status === 400, `${r.status}`);
r = await change(cp1, PW, `${p.email.split('@')[0]}-9999`);
check('a password containing the email name is refused', r.status === 400, `${r.status} ${JSON.stringify(r.json)}`);
r = await change(cp1, PW, 'Brand-New-Pass-2027');
check('a good new password is accepted', r.status === 200, `${r.status} ${JSON.stringify(r.json)}`);
check('the counter is cleared', !(await db.loginAttempt(p.email)));
check('the old password no longer works', (await login(p.email)).r.status === 401);
check('the new one does', (await login(p.email, 'Brand-New-Pass-2027')).r.status === 200);
check('this session stays signed in', (await cp1('/api/auth/session')).json.user?.email === p.email);
check('every other session for the account ends', (await cp2('/api/auth/session')).json.user === null);
audit = await db.audit('app_users', p.id);
const blob = audit.map((x) => x.changes).join(' ');
check('the audit log records the change, with no password or hash in it', audit.some((x) => x.action === 'PASSWORD_CHANGED') && audit.some((x) => x.reason === 'Password changed by the user') && !blob.includes('scrypt') && !blob.includes('Brand-New'), blob.slice(0, 200));
const lk = await mkUser('lk', { role: 'pi', isAdmin: true });
const { c: clk } = await login(lk.email);
const tries = [];
for (let i = 0; i < 5; i++) tries.push((await change(clk, 'not-the-password-1', 'Brand-New-Pass-2027')).status);
r = await change(clk, PW, 'Brand-New-Pass-2027');
check('five wrong current passwords lock password changes too', tries.slice(0, 4).every((s) => s === 400) && r.status === 429, `${tries} then ${r.status}`);
await db.clearAttempts(lk.email);

// --- the temporary password flag clears once the person chooses their own
const { c: ct2 } = await login(t.email);
r = await change(ct2, PW, 'Brand-New-Pass-2027');
check('choosing a new password clears the temporary flag', r.status === 200 && (await login(t.email, 'Brand-New-Pass-2027')).r.json.user?.mustChangePassword === false, `${r.status}`);
r = await ct2('/api/admin/roles');
check('and the person can then use the app', r.status === 200, `${r.status}`);

// --- extra modules from the delegation log
const g = await mkUser('g');
await db.addDelegation(g.id, 7, null);
await db.addDelegation(g.id, 2, '2999-01-01');
await db.addDelegation(g.id, 3, '2000-01-01');
const { r: rg } = await login(g.email);
check('delegations show in the session, ended ones left out, in module order', JSON.stringify(rg.json.user?.delegations) === '[2,7]', JSON.stringify(rg.json.user?.delegations));

// --- one-tap test accounts
r = await client()('/api/auth/test-accounts');
const enabled = r.json.enabled === true;
if (enabled) {
  const some = r.json.accounts?.[0];
  check('test accounts are listed while enabled, all on the test domain', r.json.accounts.length > 0 && r.json.accounts.every((x) => x.email.endsWith('@smarttb.study')), JSON.stringify(r.json).slice(0, 160));
  r = await client()('/api/auth/test-accounts', { method: 'POST', body: { email: some.email } });
  check('one-tap sign-in works for a test account', r.status === 200 && r.json.user?.email === some.email, `${r.status}`);
  audit = await db.audit('sessions', r.json.user.id);
  check('and is recorded as a test sign-in', audit.some((x) => x.action === 'TEST_SIGN_IN'), JSON.stringify(audit));
} else {
  check('with test sign-in off, no test accounts are listed', Array.isArray(r.json.accounts) && r.json.accounts.length === 0, JSON.stringify(r.json));
  r = await client()('/api/auth/test-accounts', { method: 'POST', body: { email: 'test1@smarttb.study' } });
  check('and one-tap sign-in is refused', r.status === 403, `${r.status}`);
}
r = await client()('/api/auth/test-accounts', { method: 'POST', body: { email: a.email.replace('@smarttb.study', '@example.org') } });
check('one-tap sign-in never works outside the test domain', r.status === 403, `${r.status}`);

await db.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
