// End-to-end test of staff invitations against a running server (default http://localhost:3100) and its local test database.
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
const login = async (email, password = SEED_PW) => {
  const c = client();
  const r = await c('/api/auth/login', { method: 'POST', body: { email, password } });
  return { c, r };
};

const db = await openStore();

const pi = (await login('demo@smarttb.study')).c;
const dm = (await login('test4@smarttb.study')).c;
const ro = (await login('test1@smarttb.study')).c;
const anon = client();

const invite = async (c, body) => c('/api/admin/invites', { method: 'POST', body });
const join = (token, body) => anon('/api/join', { method: 'POST', body: { token, ...body } });
const good = (tag) => ({ name: `Joiner ${tag}`, email: `join-${tag}-${stamp}@smarttb.study`, password: 'Own-Pass-2026y' });

// --- who may make links
let r = await invite(ro, { role: 'phlebotomist' });
check('a research officer cannot make an invitation', r.status === 403, `${r.status}`);
r = await anon('/api/admin/invites');
check('signed-out visitors cannot list invitations', r.status === 401, `${r.status}`);
r = await invite(pi, { role: 'not_a_role' });
check('an unknown role is refused', r.status === 400, `${r.status}`);
r = await invite(pi, {});
check('a role is required', r.status === 400, `${r.status}`);

// --- make one (role only) and look at it
r = await invite(dm, { role: 'phlebotomist' });
check('the data manager makes a link from just a role', r.status === 200 && r.json.link?.token && r.json.invite?.roleLabel === 'Phlebotomist', JSON.stringify(r.json).slice(0, 160));
const inv1 = r.json;
r = await pi('/api/admin/invites');
check('it shows in the open invitations', r.json.invites?.some((i) => i.id === inv1.invite.id), JSON.stringify(r.json).slice(0, 120));
r = await anon(`/api/join?token=${inv1.link.token}`);
check('the link page learns the role', r.status === 200 && r.json.invite.roleLabel === 'Phlebotomist', JSON.stringify(r.json));
r = await anon('/api/join?token=nonsense');
check('a made-up link is refused', r.status === 410, `${r.status}`);

// --- the person fills in their own details
const g1 = good('one');
r = await join(inv1.link.token, { ...g1, name: '' });
check('a name is required', r.status === 400, `${r.status}`);
r = await join(inv1.link.token, { ...g1, email: 'not-an-email' });
check('a valid email is required', r.status === 400, `${r.status}`);
r = await join(inv1.link.token, { ...g1, password: 'short1' });
check('a weak password is refused', r.status === 400, `${r.status}`);
r = await anon(`/api/join?token=${inv1.link.token}`);
check('refused attempts do not use up the link', r.status === 200, `${r.status}`);
r = await join(inv1.link.token, { ...g1, email: g1.email.toUpperCase() });
check('they create their account', r.status === 200, JSON.stringify(r.json));
const row = await db.user(g1.email);
check('with the role from the link, their own name, and no admin rights', row?.role === 'phlebotomist' && row.display_name === g1.name && !row.is_admin && row.active && row.password_hash && !row.must_change_password, JSON.stringify(row));
const signedIn = await login(g1.email, g1.password);
check('they can log in straight away', signedIn.r.status === 200 && signedIn.r.json.user.roleLabel === 'Phlebotomist', JSON.stringify(signedIn.r.json).slice(0, 120));

// --- one use only
r = await join(inv1.link.token, good('again'));
check('the link cannot be used twice', r.status === 410, `${r.status}`);
r = await anon(`/api/join?token=${inv1.link.token}`);
check('and no longer describes a role', r.status === 410, `${r.status}`);
r = await pi('/api/admin/invites');
check('and leaves the open list', !r.json.invites.some((i) => i.id === inv1.invite.id));

// --- an email that already has an account
const inv2 = (await invite(pi, { role: 'research_officer' })).json;
r = await join(inv2.link.token, { ...good('dupe'), email: g1.email });
check('an email that already has an account is refused', r.status === 409, `${r.status} ${JSON.stringify(r.json)}`);
r = await anon(`/api/join?token=${inv2.link.token}`);
check('and the link stays open for the right email', r.status === 200, `${r.status}`);
r = await join(inv2.link.token, good('two'));
check('the right email then works', r.status === 200, JSON.stringify(r.json));

// --- withdrawing
const inv3 = (await invite(pi, { role: 'phlebotomist' })).json;
r = await ro(`/api/admin/invites/${inv3.invite.id}`, { method: 'DELETE' });
check('a research officer cannot withdraw a link', r.status === 403, `${r.status}`);
r = await dm(`/api/admin/invites/${inv3.invite.id}`, { method: 'DELETE' });
check('the data manager withdraws it', r.status === 200, JSON.stringify(r.json));
r = await join(inv3.link.token, good('three'));
check('a withdrawn link is refused', r.status === 410, `${r.status}`);
r = await pi(`/api/admin/invites/${inv3.invite.id}`, { method: 'DELETE' });
check('withdrawing twice says it is no longer open', r.status === 404, `${r.status}`);

// --- custom roles and admin rights
const role = (await pi('/api/admin/roles', { method: 'POST', body: { label: `Invite Role ${stamp}`, modules: [3] } })).json.role;
const inv4 = (await invite(pi, { role: role.key, isAdmin: true })).json;
const g4 = good('four');
r = await join(inv4.link.token, g4);
const row4 = await db.user(g4.email);
check('a custom role and admin rights come through from the link', r.status === 200 && row4?.role === role.key && row4.is_admin, JSON.stringify(row4));
const inv5 = (await invite(pi, { role: role.key })).json;
const g5 = good('five');
await pi('/api/admin/staff', { method: 'POST', body: { name: 'Hold Role', email: `hold-${stamp}@smarttb.study`, role: role.key } });
// the role is held, so it cannot be removed; remove a different one with no holders
const spare = (await pi('/api/admin/roles', { method: 'POST', body: { label: `Spare Role ${stamp}`, modules: [] } })).json.role;
const inv6 = (await invite(pi, { role: spare.key })).json;
await pi(`/api/admin/roles/${spare.key}`, { method: 'DELETE' });
r = await join(inv6.link.token, good('six'));
check('a link for a removed role is refused', r.status === 410, `${r.status}`);
r = await join(inv5.link.token, g5);
check('a link for a live custom role works', r.status === 200, JSON.stringify(r.json));

// --- audit and clean-up
const audit = (await db.audit('app_users', row.id)).filter((x) => x.action === 'INSERT');
check('the audit log records how the account was made', audit[0]?.reason === 'Joined with an invitation link', JSON.stringify(audit));
const created = await db.audit('staff_invites', inv1.invite.id);
check('and the invitation itself is audited', created.length >= 2, JSON.stringify(created));
const ownerRow = (await pi('/api/admin/staff')).json.staff.find((s) => s.email === g1.email);
r = await pi(`/api/admin/staff/${ownerRow.id}`, { method: 'DELETE', body: { reason: 'removing a test account' } });
check('an account made from a link can be deleted again', r.status === 200, JSON.stringify(r.json));
const keep = await db.invite(inv1.invite.id);
check('the invitation record stays, without the account', keep && keep.user_id === null, JSON.stringify(keep));

await db.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
