// End-to-end test of custom roles against a running server (default http://localhost:3100) and its local test database.
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

const { c: pi } = await login('demo@smarttb.study');
const { c: dm } = await login('test4@smarttb.study');
const { c: ro } = await login('test1@smarttb.study');

// --- who may see and change roles
let r = await ro('/api/admin/roles');
check('a research officer cannot list roles', r.status === 403, `${r.status}`);
r = await ro('/api/admin/roles', { method: 'POST', body: { label: 'Nope', modules: [] } });
check('a research officer cannot add a role', r.status === 403, `${r.status}`);
r = await pi('/api/admin/roles');
check('the PI lists the five built-in roles', r.status === 200 && r.json.roles.filter((x) => x.builtin).length === 5, JSON.stringify(r.json).slice(0, 120));

// --- validation
const name = `Lab Technician ${stamp}`;
r = await pi('/api/admin/roles', { method: 'POST', body: { label: 'x', modules: [] } });
check('a one-letter name is refused', r.status === 400, `${r.status}`);
r = await pi('/api/admin/roles', { method: 'POST', body: { label: name, modules: [11] } });
check('an invalid module is refused', r.status === 400, `${r.status}`);
r = await pi('/api/admin/roles', { method: 'POST', body: { label: name } });
check('missing modules are refused', r.status === 400, `${r.status}`);
r = await pi('/api/admin/roles', { method: 'POST', body: { label: 'data manager', modules: [] } });
check('a built-in name is refused, whatever the case', r.status === 409, `${r.status}`);

// --- PI adds a role
r = await pi('/api/admin/roles', { method: 'POST', body: { label: name, description: '', modules: [6, 3, 6] } });
check('the PI adds a role', r.status === 200 && r.json.role.key.startsWith('custom_') && JSON.stringify(r.json.role.modules) === '[3,6]', JSON.stringify(r.json));
const role = r.json.role;
r = await pi('/api/admin/roles', { method: 'POST', body: { label: name.toUpperCase(), modules: [] } });
check('the same name again (any case) is refused', r.status === 409, `${r.status}`);
r = await dm('/api/admin/roles', { method: 'POST', body: { label: `View only ${stamp}`, description: 'Reads data', modules: [] } });
check('the data manager adds a role too', r.status === 200, JSON.stringify(r.json));
const viewOnly = r.json.role;
r = await dm('/api/admin/roles');
check('the new roles show in the list, after the built-in ones', r.json.roles.some((x) => x.key === role.key && !x.builtin) && r.json.roles.findIndex((x) => x.key === role.key) >= 5, JSON.stringify(r.json).slice(0, 80));

// --- assign to a person
const email = `role-${stamp}@smarttb.study`;
r = await pi('/api/admin/staff', { method: 'POST', body: { name: 'Role Person', email, role: role.key, isAdmin: false } });
check('the PI creates an account with the new role', r.status === 200 && r.json.member.role === role.key && r.json.member.roleLabel === name, JSON.stringify(r.json).slice(0, 160));
const memberId = r.json.member.id;
r = await pi('/api/admin/staff', { method: 'POST', body: { name: 'Bad Role', email: `bad-${stamp}@smarttb.study`, role: 'custom_doesnotexist' } });
check('an unknown role is refused', r.status === 400, `${r.status}`);

// give them a password and sign in
await pi(`/api/admin/staff/${memberId}`, { method: 'POST', body: { action: 'temporary', reason: 'testing roles', password: 'Temp-Pass-2026x' } });
const person = client();
r = await person('/api/auth/login', { method: 'POST', body: { email, password: 'Temp-Pass-2026x' } });
check('they sign in showing the role name and its modules', r.status === 200 && r.json.user.roleLabel === name && JSON.stringify(r.json.user.entryModules) === '[3,6]', JSON.stringify(r.json.user));

// --- what the role allows (uses the server's participant rules)
r = await person('/api/auth/change-password', { method: 'POST', body: { currentPassword: 'Temp-Pass-2026x', newPassword: 'Own-Pass-2026y' } });
check('they set their own password', r.status === 200, JSON.stringify(r.json));
r = await person('/api/participants', { method: 'POST', body: {} });
check('a role without Module 1 cannot enrol participants', r.status === 403, `${r.status} ${JSON.stringify(r.json)}`);

// --- removal
r = await pi(`/api/admin/roles/${role.key}`, { method: 'DELETE' });
check('a role someone holds cannot be removed', r.status === 409 && /1 person has/.test(r.json.error), JSON.stringify(r.json));
r = await ro(`/api/admin/roles/${viewOnly.key}`, { method: 'DELETE' });
check('a research officer cannot remove a role', r.status === 403, `${r.status}`);
r = await pi('/api/admin/roles/pi', { method: 'DELETE' });
check('a built-in role cannot be removed', r.status === 409, `${r.status}`);
r = await pi(`/api/admin/roles/${viewOnly.key}`, { method: 'DELETE' });
check('the PI removes a role nobody holds', r.status === 200, JSON.stringify(r.json));
r = await pi('/api/admin/roles');
check('it leaves the list', !r.json.roles.some((x) => x.key === viewOnly.key));
r = await pi('/api/admin/staff', { method: 'POST', body: { name: 'Gone Role', email: `gone-${stamp}@smarttb.study`, role: viewOnly.key } });
check('a removed role cannot be given to anyone', r.status === 400, `${r.status}`);
r = await dm(`/api/admin/roles/${viewOnly.key}`, { method: 'DELETE' });
check('removing it twice says it is gone', r.status === 404, `${r.status}`);
r = await pi('/api/admin/roles', { method: 'POST', body: { label: `View only ${stamp}`, modules: [] } });
check('a removed role’s name can be used again', r.status === 200, JSON.stringify(r.json));

// move the person off the role, then remove it
r = await pi(`/api/admin/staff/${memberId}`, { method: 'PATCH', body: { role: 'phlebotomist', reason: 'moving to phlebotomist' } });
check('the PI moves them to another role', r.status === 200 && r.json.member.role === 'phlebotomist', JSON.stringify(r.json).slice(0, 120));
r = await pi(`/api/admin/roles/${role.key}`, { method: 'DELETE' });
check('now the role can be removed', r.status === 200, JSON.stringify(r.json));
r = await pi(`/api/admin/staff/${memberId}/history`);
check('the history still names the removed role', r.status === 200 && r.json.history.some((h) => h.summary.includes(name)), JSON.stringify(r.json).slice(0, 300));

// --- access requests: PI can approve into a custom role
const reqEmail = `reqrole-${stamp}@smarttb.study`;
await fetch(BASE + '/api/access-requests', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '198.51.100.201' },
  body: JSON.stringify({ name: 'Request Role', email: reqEmail, role: 'research_officer', note: 'Joining the lab team', password: 'Chosen-Pass-2026', website: '' }),
});
const open = (await pi('/api/admin/requests')).json.requests.find((x) => x.email === reqEmail);
const custom2 = (await pi('/api/admin/roles', { method: 'POST', body: { label: `Data Entry ${stamp}`, modules: [3, 4] } })).json.role;
r = await pi(`/api/admin/requests/${open.id}`, { method: 'POST', body: { action: 'approve', role: custom2.key } });
check('the PI approves a request into a custom role', r.status === 200, JSON.stringify(r.json));
const acct = await db.user(reqEmail);
check('the account has that role', acct?.role === custom2.key, JSON.stringify(acct));
r = await fetch(BASE + '/api/access-requests', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '198.51.100.202' },
  body: JSON.stringify({ name: 'Public Role', email: `pub-${stamp}@smarttb.study`, role: custom2.key, note: 'Trying a custom role', password: 'Chosen-Pass-2026', website: '' }),
});
check('the public form refuses custom roles', r.status === 400, `${r.status}`);


// --- editing modules
const ed = (await pi('/api/admin/roles', { method: 'POST', body: { label: `Editable ${stamp}`, modules: [3] } })).json.role;
r = await ro(`/api/admin/roles/${ed.key}`, { method: 'PATCH', body: { modules: [4] } });
check('a research officer cannot edit modules', r.status === 403, `${r.status}`);
r = await pi('/api/admin/roles/pi', { method: 'PATCH', body: { modules: [4] } });
check('a built-in role cannot be edited', r.status === 409, `${r.status}`);
r = await pi(`/api/admin/roles/${ed.key}`, { method: 'PATCH', body: { modules: [99] } });
check('an invalid module is refused when editing', r.status === 400, `${r.status}`);
r = await dm(`/api/admin/roles/${ed.key}`, { method: 'PATCH', body: { modules: [8, 4] } });
check('the data manager edits the modules', r.status === 200, JSON.stringify(r.json));
r = await pi('/api/admin/roles');
check('the list shows the new modules', JSON.stringify(r.json.roles.find((x) => x.key === ed.key)?.modules) === '[4,8]');

// --- audit
const audit = await db.audit('roles', role.key);
check('the audit log records the role being added and removed', audit.length >= 2, JSON.stringify(audit));

await db.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
