// Every role can read every module; only the right roles can fill one in. Run against a server started with NEXT_PUBLIC_CRF_PREVIEW=false (as in production).
const BASE = process.env.BASE ?? 'http://localhost:3100';
const PW = process.env.DEV_SEED_PASSWORD;
let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${extra}`}`);
};
function client() {
  let cookie = '';
  return async (path, method = 'GET', body) => {
    const res = await fetch(BASE + path, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, json: await res.json().catch(() => ({})) };
  };
}
const login = async (email) => {
  const c = client();
  const r = await c('/api/auth/login', 'POST', { email, password: PW });
  if (r.status !== 200) throw new Error(`login ${email}: ${r.status}`);
  return c;
};

const pi = await login('demo@smarttb.study');
const ro = await login('test1@smarttb.study');
const ph = await login('test2@smarttb.study');
const pk = await login('test3@smarttb.study');
const dm = await login('test4@smarttb.study');

let r = await ro('/api/participants', 'POST', {});
const uid = r.json.uid ?? r.json.participant?.uid;
check('the research officer enrols a participant', r.status === 200 && !!uid, JSON.stringify(r.json).slice(0, 120));

// Reading: every role gets the full record, every module included.
for (const [name, c] of [['PI', pi], ['research officer', ro], ['phlebotomist', ph], ['PK scientist', pk], ['data manager', dm]]) {
  const res = await c('/api/participants');
  const p = res.json.participants?.find((x) => x.uid === uid);
  const all = p && Object.keys(p.data ?? {}).length >= 10 && Object.keys(p.meta ?? {}).length >= 10;
  check(`the ${name} can read all 10 modules`, res.status === 200 && !!all, `${res.status} ${Object.keys(p?.data ?? {}).length} data keys`);
}

// Entering: the wrong role is refused.
r = await pk(`/api/participants/${uid}/modules/1`, 'PATCH', { patch: { initials: 'AB' } });
check('a PK scientist cannot fill in Module 1', r.status === 403, `${r.status} ${JSON.stringify(r.json)}`);
r = await ph(`/api/participants/${uid}/modules/6`, 'PATCH', { patch: {} });
check('a phlebotomist cannot fill in Module 6', r.status === 403 || r.status === 409, `${r.status} ${JSON.stringify(r.json)}`);
r = await dm(`/api/participants/${uid}/modules/1`, 'PATCH', { patch: {} });
check('the data manager cannot fill in Module 1 (first entry)', r.status === 403, `${r.status} ${JSON.stringify(r.json)}`);

// Entering: the right role, but not before its turn in the sequence.
r = await pi(`/api/participants/${uid}/modules/6`, 'PATCH', { patch: {} });
check('even the PI cannot fill in Module 6 before its turn', r.status === 409, `${r.status} ${JSON.stringify(r.json)}`);
r = await ro(`/api/participants/${uid}/modules/1`, 'PATCH', { patch: {} });
check('the research officer can fill in Module 1 (the current module)', r.status === 200, `${r.status} ${JSON.stringify(r.json)}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
