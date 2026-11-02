// The system control page: who may use it, the logs it shows, and setting a password for any account.
// The test server names sysadmin-e2e@smarttb.study in SYSTEM_ADMIN_EMAILS (see run-all.mjs).
import { openStore } from './lib/store.mjs';

const BASE = process.env.BASE ?? 'http://localhost:3100';
const stamp = Date.now() % 1000000;
const PW = 'Start-Pass-2026a';
const SYS = 'sysadmin-e2e@smarttb.study';

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
    const res = await fetch(BASE + path, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, json: await res.json().catch(() => ({})) };
  };
}
const db = await openStore();
const login = async (email, password = PW) => {
  const c = client();
  const r = await c('/api/auth/login', { method: 'POST', body: { email, password } });
  return { c, r };
};

// A fresh system administrator account for each run.
const old = await db.user(SYS);
if (old) await db.deleteUser(old.id);
const sysId = await db.createUser({ email: SYS, name: 'System Admin Test', role: 'data_manager', isAdmin: true, password: PW });
const piEmail = `sys-pi-${stamp}@smarttb.study`;
await db.createUser({ email: piEmail, role: 'pi', isAdmin: true, password: PW });
const targetEmail = `sys-target-${stamp}@smarttb.study`;
const targetId = await db.createUser({ email: targetEmail, name: 'Target Person', role: 'phlebotomist', password: PW });

const { c: sys, r: rs } = await login(SYS);
const { c: pi, r: rp } = await login(piEmail);
check('the system administrator is flagged in the session', rs.json.user?.isSystemAdmin === true, JSON.stringify(rs.json.user));
check('another administrator (the PI) is not', rp.json.user?.isSystemAdmin === false, JSON.stringify(rp.json.user));

// --- who may use it
let r = await pi('/api/system');
check('the PI cannot open the system page data', r.status === 403, `${r.status}`);
r = await pi('/api/system/password', { method: 'POST', body: { userId: targetId, password: 'Another-Pass-2026', reason: 'not allowed' } });
check('nor set passwords through it', r.status === 403, `${r.status}`);
r = await client()('/api/system');
check('signed-out visitors get a 401', r.status === 401, `${r.status}`);

// --- the logs
await client()('/api/auth/login', { method: 'POST', body: { email: targetEmail, password: 'wrong-password-1' } });
await client()('/api/auth/login', { method: 'POST', body: { email: `nobody-${stamp}@smarttb.study`, password: 'whatever-1234' } });
const { c: target } = await login(targetEmail);
r = await sys('/api/system');
check('the system administrator gets status, accounts and logs', r.status === 200 && r.json.status?.database === 'ok' && r.json.accounts?.length > 0 && !!r.json.logs, `${r.status} ${JSON.stringify(r.json).slice(0, 160)}`);
const failed = r.json.logs.failedSignIns;
check('a wrong password is in the failed sign-ins, with the reason', failed.some((e) => e.account === targetEmail && /wrong password/.test(e.detail)), JSON.stringify(failed.slice(0, 3)));
check('so is an email with no account', failed.some((e) => e.account === `nobody-${stamp}@smarttb.study` && /no account/.test(e.detail)));
check('a successful sign-in is in the sign-ins, with the name and email', r.json.logs.signIns.some((e) => e.event === 'Signed in' && e.account.includes(targetEmail)), JSON.stringify(r.json.logs.signIns.slice(0, 2)));
check('the accounts list marks your own account', r.json.accounts.find((a) => a.email === SYS)?.isSelf === true);
check('nothing secret is in the response', !/password_hash|scrypt|mongodb:\/\//.test(JSON.stringify(r.json)));

// --- setting a password: refusals
const set = (body) => sys('/api/system/password', { method: 'POST', body });
r = await set({ userId: targetId, password: 'New-Temp-Pass-2026', reason: '' });
check('a reason is required', r.status === 400, `${r.status}`);
r = await set({ userId: targetId, password: 'short1', reason: 'testing the rules' });
check('a weak password is refused', r.status === 400, `${r.status}`);
r = await set({ userId: sysId, password: 'New-Temp-Pass-2026', reason: 'testing the rules' });
check('your own password is changed from your account menu, not here', r.status === 409, `${r.status}`);
r = await set({ userId: 'no-such-account', password: 'New-Temp-Pass-2026', reason: 'testing the rules' });
check('an unknown account is a 404', r.status === 404, `${r.status}`);
r = await set({ userId: { $gt: '' }, password: 'New-Temp-Pass-2026', reason: 'testing the rules' });
check('an account id that is not plain text is refused', r.status === 400, `${r.status}`);

// --- a temporary password (the default)
r = await set({ userId: targetId, password: 'New-Temp-Pass-2026', reason: 'Locked out before a clinic day' });
check('a temporary password is set', r.status === 200 && r.json.mustChange === true && r.json.email === targetEmail, JSON.stringify(r.json));
check('the person is signed out everywhere', (await target('/api/auth/session')).json.user === null);
check('the old password no longer works', (await login(targetEmail)).r.status === 401);
const tmp = await login(targetEmail, 'New-Temp-Pass-2026');
check('the new one does, and they must choose their own', tmp.r.status === 200 && tmp.r.json.user.mustChangePassword === true, JSON.stringify(tmp.r.json.user));

// --- a password they keep
r = await set({ userId: targetId, password: 'Kept-Pass-2026xy', mustChange: false, reason: 'Shared ward tablet account' });
const kept = await login(targetEmail, 'Kept-Pass-2026xy');
check('a password they keep can be set too', r.status === 200 && kept.r.status === 200 && kept.r.json.user.mustChangePassword === false, `${r.status} ${JSON.stringify(kept.r.json.user)}`);

// --- recorded
const audit = await db.audit('app_users', targetId);
check('each change is in the audit trail with its reason', audit.filter((a) => a.action === 'PASSWORD_SET_BY_SYSTEM').length === 2 && audit.some((a) => a.reason === 'Locked out before a clinic day'), JSON.stringify(audit.map((a) => [a.action, a.reason])));
check('without the password or its hash', !audit.map((a) => a.changes).join(' ').match(/Kept-Pass|New-Temp|scrypt/));
r = await sys('/api/system');
const pw = r.json.logs.passwords.filter((e) => e.account.includes(targetEmail));
check('the password log shows it once per change, who did it and why', pw.filter((e) => e.event === 'Password set from the system control page').length === 2 && pw.every((e) => !e.event.startsWith('Password changed or reset')) && pw.some((e) => e.by.includes(SYS) && e.detail === 'Shared ward tablet account'), JSON.stringify(pw.slice(0, 3)));

// --- deactivated accounts
await db.setUserField(targetEmail, 'active', false);
r = await set({ userId: targetId, password: 'Another-Pass-2026', reason: 'testing deactivated' });
check('a deactivated account is refused until it is reactivated', r.status === 409, `${r.status} ${JSON.stringify(r.json)}`);

await db.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
