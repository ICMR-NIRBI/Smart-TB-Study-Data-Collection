// Adding, editing and removing roles through the roles API. Accounts are made through the database adapter (not the
// staff screens), so this runs on either database. Default server: http://localhost:3100.
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

const db = await openStore();
const make = async (tag, role, isAdmin) => {
  const email = `rc-${tag}-${stamp}@smarttb.study`;
  const id = await db.createUser({ email, role, isAdmin, password: PW });
  const c = client();
  const r = await c('/api/auth/login', { method: 'POST', body: { email, password: PW } });
  if (r.status !== 200) throw new Error(`login ${tag}: ${r.status}`);
  return { c, email, id };
};
const pi = await make('pi', 'pi', true);
const dm = await make('dm', 'data_manager', true);
const ro = await make('ro', 'research_officer', false);

// --- who may see and change roles
let r = await client()('/api/admin/roles');
check('signed-out visitors get a 401', r.status === 401, `${r.status}`);
r = await ro.c('/api/admin/roles');
check('a research officer cannot list roles', r.status === 403, `${r.status}`);
r = await ro.c('/api/admin/roles', { method: 'POST', body: { label: 'Nope', modules: [] } });
check('a research officer cannot add a role', r.status === 403, `${r.status}`);
r = await pi.c('/api/admin/roles');
check('the PI lists the five built-in roles first', r.status === 200 && r.json.roles.slice(0, 5).every((x) => x.builtin) && r.json.roles.filter((x) => x.builtin).length === 5, JSON.stringify(r.json).slice(0, 140));
check('with their usual modules', JSON.stringify(r.json.roles.find((x) => x.key === 'phlebotomist')?.modules) === '[5,9]');
r = await dm.c('/api/admin/roles');
check('the data manager can list them too', r.status === 200, `${r.status}`);

// --- validation
const name = `Lab Technician ${stamp}`;
r = await pi.c('/api/admin/roles', { method: 'POST', body: { label: 'x', modules: [] } });
check('a one-letter name is refused', r.status === 400, `${r.status}`);
r = await pi.c('/api/admin/roles', { method: 'POST', body: { label: 'y'.repeat(41), modules: [] } });
check('a name over 40 characters is refused', r.status === 400, `${r.status}`);
r = await pi.c('/api/admin/roles', { method: 'POST', body: { label: name, description: 'z'.repeat(141), modules: [] } });
check('a description over 140 characters is refused', r.status === 400, `${r.status}`);
r = await pi.c('/api/admin/roles', { method: 'POST', body: { label: name, modules: [11] } });
check('an invalid module is refused', r.status === 400, `${r.status}`);
r = await pi.c('/api/admin/roles', { method: 'POST', body: { label: name } });
check('missing modules are refused', r.status === 400, `${r.status}`);
r = await pi.c('/api/admin/roles', { method: 'POST', body: { label: 'data manager', modules: [] } });
check('a built-in name is refused, whatever the case', r.status === 409, `${r.status}`);

// --- adding
r = await pi.c('/api/admin/roles', { method: 'POST', body: { label: `  ${name}  `, description: '', modules: [6, 3, 6] } });
check('the PI adds a role; modules are sorted and de-duplicated, spaces trimmed', r.status === 200 && r.json.role.key.startsWith('custom_') && JSON.stringify(r.json.role.modules) === '[3,6]' && r.json.role.label === name, JSON.stringify(r.json));
const role = r.json.role;
check('with a summary when no description is given', /Enters Module 3, Module 6/.test(role.description), role.description);
r = await pi.c('/api/admin/roles', { method: 'POST', body: { label: name.toUpperCase(), modules: [] } });
check('the same name again, in any case, is refused', r.status === 409, `${r.status}`);
r = await dm.c('/api/admin/roles', { method: 'POST', body: { label: `Aaa View only ${stamp}`, description: 'Reads data', modules: [] } });
check('the data manager adds a role too', r.status === 200, JSON.stringify(r.json));
const viewOnly = r.json.role;
r = await dm.c('/api/admin/roles');
const keys = r.json.roles.map((x) => x.key);
check('new roles come after the built-in ones, sorted by name', keys.indexOf(viewOnly.key) >= 5 && keys.indexOf(viewOnly.key) < keys.indexOf(role.key), keys.join(','));
check('and show their own description', r.json.roles.find((x) => x.key === viewOnly.key)?.description === 'Reads data');

// --- holders: counts, access, and edits that take effect straight away
const holderEmail = `rc-holder-${stamp}@smarttb.study`;
await db.createUser({ email: holderEmail, role: role.key, password: PW });
r = await pi.c('/api/admin/roles');
check('the member count includes holders of the role', r.json.roles.find((x) => x.key === role.key)?.members === 1, JSON.stringify(r.json.roles.find((x) => x.key === role.key)));
const holder = client();
r = await holder('/api/auth/login', { method: 'POST', body: { email: holderEmail, password: PW } });
check('a holder signs in with the role name and its modules', r.status === 200 && r.json.user.roleLabel === name && JSON.stringify(r.json.user.entryModules) === '[3,6]', JSON.stringify(r.json.user));
r = await ro.c(`/api/admin/roles/${role.key}`, { method: 'PATCH', body: { modules: [4] } });
check('a research officer cannot edit modules', r.status === 403, `${r.status}`);
r = await pi.c('/api/admin/roles/pi', { method: 'PATCH', body: { modules: [4] } });
check('a built-in role cannot be edited', r.status === 409, `${r.status}`);
r = await pi.c(`/api/admin/roles/${role.key}`, { method: 'PATCH', body: { modules: [99] } });
check('an invalid module is refused when editing', r.status === 400, `${r.status}`);
r = await pi.c('/api/admin/roles/custom_doesnotexist', { method: 'PATCH', body: { modules: [4] } });
check('editing a role that does not exist is a 404', r.status === 404, `${r.status}`);
r = await dm.c(`/api/admin/roles/${role.key}`, { method: 'PATCH', body: { modules: [8, 4] } });
check('the data manager edits the modules', r.status === 200, JSON.stringify(r.json));
r = await pi.c('/api/admin/roles');
check('the list shows the new modules', JSON.stringify(r.json.roles.find((x) => x.key === role.key)?.modules) === '[4,8]');
r = await holder('/api/auth/session');
check('and the holder gets them on their next request', JSON.stringify(r.json.user?.entryModules) === '[4,8]', JSON.stringify(r.json.user));

// --- removing
r = await pi.c(`/api/admin/roles/${role.key}`, { method: 'DELETE' });
check('a role someone holds cannot be removed', r.status === 409 && /1 person has/.test(r.json.error), JSON.stringify(r.json));
r = await ro.c(`/api/admin/roles/${viewOnly.key}`, { method: 'DELETE' });
check('a research officer cannot remove a role', r.status === 403, `${r.status}`);
r = await pi.c('/api/admin/roles/pi', { method: 'DELETE' });
check('a built-in role cannot be removed', r.status === 409, `${r.status}`);
r = await pi.c(`/api/admin/roles/${viewOnly.key}`, { method: 'DELETE' });
check('the PI removes a role nobody holds', r.status === 200, JSON.stringify(r.json));
r = await pi.c('/api/admin/roles');
check('it leaves the list', !r.json.roles.some((x) => x.key === viewOnly.key));
r = await dm.c(`/api/admin/roles/${viewOnly.key}`, { method: 'DELETE' });
check('removing it twice says it is gone', r.status === 404, `${r.status}`);
r = await pi.c('/api/admin/roles', { method: 'POST', body: { label: `Aaa View only ${stamp}`, modules: [] } });
check('a removed role’s name can be used again', r.status === 200, JSON.stringify(r.json));
await db.setUserField(holderEmail, 'role', 'phlebotomist');
r = await pi.c(`/api/admin/roles/${role.key}`, { method: 'DELETE' });
check('once the holder moves to another role it can be removed', r.status === 200, JSON.stringify(r.json));
r = await pi.c('/api/admin/roles');
check('and the old holder is counted under their new role', r.json.roles.find((x) => x.key === 'phlebotomist')?.members >= 1 && !r.json.roles.some((x) => x.key === role.key));

// --- the audit trail
const audit = await db.audit('roles', role.key);
check('the audit log records the role being added, edited and removed', audit.length >= 3 && audit[0].action === 'INSERT' && audit.some((x) => /modules/.test(x.changes)) && audit.some((x) => /deleted_at/.test(x.changes)), JSON.stringify(audit.map((x) => x.action)));
check('with the reasons the screens give', audit[0].reason === 'Role added' && audit.some((x) => x.reason === 'Role removed') && audit.some((x) => x.reason === 'Role modules changed'), JSON.stringify(audit.map((x) => x.reason)));

await db.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
