// Things that must stay true when several people act at the same instant. Default server: http://localhost:3100.
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

function client(headers = {}) {
  let cookie = '';
  return async (path, { method = 'GET', body } = {}) => {
    const res = await fetch(BASE + path, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, json: await res.json().catch(() => ({})) };
  };
}
const db = await openStore();
const login = async (email) => {
  const c = client();
  const r = await c('/api/auth/login', { method: 'POST', body: { email, password: SEED_PW } });
  if (r.status !== 200) throw new Error(`login ${email}: ${r.status}`);
  return c;
};
const pi = await login('demo@smarttb.study');
const ip = (n) => ({ 'x-forwarded-for': `198.51.100.${(stamp + n) % 250}` });
const count = (statuses, code) => statuses.filter((s) => s === code).length;

// --- one invitation link, five people opening it at the same moment
const inv = (await pi('/api/admin/invites', { method: 'POST', body: { role: 'phlebotomist' } })).json;
const emails = [0, 1, 2, 3, 4].map((i) => `race-join-${i}-${stamp}@smarttb.study`);
const joins = await Promise.all(
  emails.map((email, i) =>
    client(ip(i))('/api/join', { method: 'POST', body: { token: inv.link.token, name: `Racer ${i}`, email, password: `Own-Pass-2026-${i}x` } }),
  ),
);
const codes = joins.map((j) => j.status);
check('five people using one invitation at once: exactly one gets in, the rest are told it is used', count(codes, 200) === 1 && count(codes, 410) === 4, codes.join(','));
const made = (await Promise.all(emails.map((e) => db.user(e)))).filter(Boolean);
check('and only one account exists', made.length === 1, `${made.length}`);
check('the invitation records that account', (await db.invite(inv.invite.id))?.user_id === made[0]?.id);

// --- the same access request sent six times at once
const reqEmail = `race-req-${stamp}@smarttb.study`;
const sends = await Promise.all(
  [0, 1, 2, 3, 4, 5].map((i) =>
    client(ip(10 + i))('/api/access-requests', {
      method: 'POST',
      body: { name: 'Same Person', email: reqEmail, role: 'research_officer', note: 'Joining the lab team', password: 'Chosen-Pass-2026', website: '' },
    }),
  ),
);
check('the same request six times at once: every answer is the same', sends.every((s) => s.status === 200), sends.map((s) => s.status).join(','));
const stored = await db.requests(reqEmail);
check('and only one request is stored', stored.length === 1 && stored[0].status === 'pending', `${stored.length}`);

// --- approving and rejecting the same request at the same moment
const decideEmail = `race-decide-${stamp}@smarttb.study`;
await client(ip(20))('/api/access-requests', { method: 'POST', body: { name: 'Decide Me', email: decideEmail, role: 'phlebotomist', note: 'Joining the lab team', password: 'Chosen-Pass-2026', website: '' } });
const requestId = (await db.requests(decideEmail))[0].id;
const [approve, reject] = await Promise.all([
  pi(`/api/admin/requests/${requestId}`, { method: 'POST', body: { action: 'approve' } }),
  pi(`/api/admin/requests/${requestId}`, { method: 'POST', body: { action: 'reject', reason: 'Not part of the team' } }),
]);
check('approve and reject at the same moment: one wins, the other is told it was decided', [approve.status, reject.status].sort().join() === '200,409', `${approve.status},${reject.status}`);
const after = (await db.requests(decideEmail))[0];
const account = await db.user(decideEmail);
check('and the outcome is consistent (approved means an account, rejected means none)', (after.status === 'approved') === !!account, `${after.status}, account ${!!account}`);

// --- one setup link used four times at once
const staff = (await pi('/api/admin/staff', { method: 'POST', body: { name: 'Link Racer', email: `race-link-${stamp}@smarttb.study`, role: 'phlebotomist' } })).json;
const uses = await Promise.all([0, 1, 2, 3].map((i) => client()('/api/setup', { method: 'POST', body: { token: staff.link.token, password: `Own-Pass-2026-${i}x` } })));
const useCodes = uses.map((u) => u.status);
check('a setup link used four times at once works exactly once', count(useCodes, 200) === 1 && count(useCodes, 410) === 3, useCodes.join(','));
const winner = uses.findIndex((u) => u.status === 200);
const signIn = await client()('/api/auth/login', { method: 'POST', body: { email: `race-link-${stamp}@smarttb.study`, password: `Own-Pass-2026-${winner}x` } });
check('and the password that won is the one that works', signIn.status === 200, `${signIn.status}`);

// --- two staff changes to the same account at the same moment: both applied or one refused, never a half-change
const target = (await pi('/api/admin/staff', { method: 'POST', body: { name: 'Change Target', email: `race-chg-${stamp}@smarttb.study`, role: 'phlebotomist' } })).json.member;
const [c1, c2] = await Promise.all([
  pi(`/api/admin/staff/${target.id}`, { method: 'PATCH', body: { name: 'Changed Name One', reason: 'first change' } }),
  pi(`/api/admin/staff/${target.id}`, { method: 'PATCH', body: { role: 'pk_scientist', reason: 'second change' } }),
]);
const final = await db.user(target.email ?? `race-chg-${stamp}@smarttb.study`);
check('two changes to one account at once both apply', c1.status === 200 && c2.status === 200 && final.display_name === 'Changed Name One' && final.role === 'pk_scientist', `${c1.status},${c2.status} ${final?.display_name}/${final?.role}`);

await db.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
