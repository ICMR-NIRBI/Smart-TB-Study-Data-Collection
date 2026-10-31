// End-to-end test of temporary passwords against a running server (default http://localhost:3100) and its local test database.
import { openStore } from './lib/store.mjs';


const BASE = process.env.BASE ?? 'http://localhost:3100';
const ADMIN = 'demo@smarttb.study';
const ADMIN_PW = process.env.DEV_SEED_PASSWORD;
const TEMP = 'admin@2026';
const NEW_PW = 'Fresh-Start-2026';
const email = `tmp${Date.now() % 100000}@smarttb.study`;

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
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  };
}

const admin = client();
let r = await admin('/api/auth/login', { method: 'POST', body: { email: ADMIN, password: ADMIN_PW } });
check('admin signs in', r.status === 200 && r.json.user?.mustChangePassword === false, JSON.stringify(r.json).slice(0, 120));

r = await admin('/api/admin/staff', { method: 'POST', body: { name: 'Temp Person', email, role: 'research_officer', isAdmin: false } });
check('admin creates a staff account (with a setup link)', r.status === 200 && r.json.link?.token, JSON.stringify(r.json).slice(0, 120));
const staffId = r.json.member?.id;
const setupToken = r.json.link?.token;

r = await admin(`/api/admin/staff/${staffId}`, { method: 'POST', body: { action: 'temporary', reason: 'e2e test', password: 'short1' } });
check('a weak temporary password is refused', r.status === 400, `${r.status} ${JSON.stringify(r.json)}`);

r = await admin(`/api/admin/staff/${staffId}`, { method: 'POST', body: { action: 'temporary', reason: 'e2e test', password: TEMP } });
check('admin sets the temporary password', r.status === 200 && r.json.member?.mustChangePassword === true && r.json.member?.status === 'active', JSON.stringify(r.json).slice(0, 160));

r = await fetch(`${BASE}/api/setup?token=${encodeURIComponent(setupToken)}`);
check('the earlier setup link no longer works', r.status === 410, String(r.status));

r = await admin(`/api/admin/staff/${staffId}`, { method: 'POST', body: { action: 'temporary', reason: 'e2e test', password: 'x' } });
check('admin cannot give a too-short password', r.status === 400, String(r.status));

// The person signs in with the temporary password (two separate sessions)
const a = client();
const b = client();
r = await a('/api/auth/login', { method: 'POST', body: { email, password: TEMP } });
check('they sign in with the temporary password', r.status === 200 && r.json.user?.mustChangePassword === true, JSON.stringify(r.json).slice(0, 120));
await b('/api/auth/login', { method: 'POST', body: { email, password: TEMP } });

r = await a('/api/participants');
check('study data is blocked until the password is changed', r.status === 403 && r.json.details?.code === 'PASSWORD_CHANGE_REQUIRED', `${r.status} ${JSON.stringify(r.json)}`);
r = await a('/api/participants', { method: 'POST' });
check('enrolling is blocked too', r.status === 403, String(r.status));
r = await a('/api/auth/session');
check('the session still reports who they are', r.status === 200 && r.json.user?.mustChangePassword === true, JSON.stringify(r.json).slice(0, 100));

r = await a('/api/auth/change-password', { method: 'POST', body: { currentPassword: 'wrong-password-1', newPassword: NEW_PW } });
check('wrong current password is refused', r.status === 400, String(r.status));
r = await a('/api/auth/change-password', { method: 'POST', body: { currentPassword: TEMP, newPassword: 'short1' } });
check('a weak new password is refused', r.status === 400, String(r.status));
r = await a('/api/auth/change-password', { method: 'POST', body: { currentPassword: TEMP, newPassword: TEMP } });
check('reusing the temporary password is refused', r.status === 400, String(r.status));
r = await a('/api/auth/change-password', { method: 'POST', body: { currentPassword: TEMP, newPassword: NEW_PW } });
check('choosing a new password works', r.status === 200, `${r.status} ${JSON.stringify(r.json)}`);

r = await a('/api/participants');
check('study data opens straight away afterwards', r.status === 200, String(r.status));
r = await a('/api/auth/session');
check('the session no longer needs a change', r.json.user?.mustChangePassword === false, JSON.stringify(r.json).slice(0, 100));
r = await b('/api/participants');
check('their other session was signed out', r.status === 401, String(r.status));

const c = client();
r = await c('/api/auth/login', { method: 'POST', body: { email, password: TEMP } });
check('the temporary password no longer signs in', r.status === 401, String(r.status));
r = await c('/api/auth/login', { method: 'POST', body: { email, password: NEW_PW } });
check('the new password signs in, with no further change needed', r.status === 200 && r.json.user?.mustChangePassword === false, JSON.stringify(r.json).slice(0, 100));

// Lockout: repeated wrong current passwords on the change endpoint
const d = client();
await d('/api/auth/login', { method: 'POST', body: { email, password: NEW_PW } });
let last;
for (let i = 0; i < 5; i++) last = await d('/api/auth/change-password', { method: 'POST', body: { currentPassword: `wrong-guess-${i}x`, newPassword: 'Another-Pass-77' } });
r = await d('/api/auth/change-password', { method: 'POST', body: { currentPassword: NEW_PW, newPassword: 'Another-Pass-77' } });
check('guessing the current password is locked after 5 tries', r.status === 429, `${last.status} then ${r.status}`);

// Permissions
r = await admin(`/api/admin/staff`, {});
const self = r.json.staff.find((s) => s.email === ADMIN);
r = await admin(`/api/admin/staff/${self.id}`, { method: 'POST', body: { action: 'temporary', reason: 'e2e test', password: TEMP } });
check('an admin cannot set a temporary password on their own account', r.status === 409, String(r.status));
const ro = client();
await ro('/api/auth/login', { method: 'POST', body: { email: 'test1@smarttb.study', password: ADMIN_PW } });
r = await ro(`/api/admin/staff/${staffId}`, { method: 'POST', body: { action: 'temporary', reason: 'e2e test', password: TEMP } });
check('a non-admin cannot set one', r.status === 403, String(r.status));
await admin(`/api/admin/staff/${staffId}`, { method: 'POST', body: { action: 'deactivate', reason: 'e2e cleanup' } });
r = await admin(`/api/admin/staff/${staffId}`, { method: 'POST', body: { action: 'temporary', reason: 'e2e test', password: TEMP } });
check('a deactivated account is refused', r.status === 409, String(r.status));

// History and audit
r = await admin(`/api/admin/staff/${staffId}/history`);
const text = (r.json.history ?? []).map((h) => h.summary).join(' | ');
check('history shows the temporary password and the change', /Temporary password/.test(text) && /Password changed/.test(text), text.slice(0, 300));

const db = await openStore();
const audit = await db.audit('app_users', staffId);
const blob = audit.map((x) => x.changes).join(' ');
check('no password or hash appears in the audit log', !blob.includes('scrypt') && !blob.includes(TEMP) && !blob.includes(NEW_PW), blob.slice(0, 200));
await db.deleteSessionsOfUser(staffId);
await db.close();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
