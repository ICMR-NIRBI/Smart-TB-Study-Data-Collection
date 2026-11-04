// Live updates: the server-sent event channel (/api/live), presence, and that only the fact of a change travels on it.
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
  const c = async (path, { method = 'GET', body, headers = {} } = {}) => {
    const res = await fetch(BASE + path, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, json: (res.headers.get('content-type') ?? '').includes('json') ? await res.json().catch(() => ({})) : {} };
  };
  c.cookie = () => cookie;
  return c;
}

/** Opens the live channel and collects its events. */
async function listen(c) {
  const ctrl = new AbortController();
  const res = await fetch(`${BASE}/api/live`, { headers: { cookie: c.cookie(), accept: 'text/event-stream' }, signal: ctrl.signal });
  const events = [];
  if (res.ok) {
    (async () => {
      const decoder = new TextDecoder();
      let buf = '';
      try {
        for await (const chunk of res.body) {
          buf += decoder.decode(chunk, { stream: true });
          let i;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const block = buf.slice(0, i);
            buf = buf.slice(i + 2);
            const data = block.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6)).join('\n');
            if (data) events.push(JSON.parse(data));
          }
        }
      } catch {
        /* aborted */
      }
    })();
  }
  const waitFor = async (pred, ms = 4000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const hit = events.find(pred);
      if (hit) return hit;
      await new Promise((r) => setTimeout(r, 50));
    }
    return null;
  };
  return { status: res.status, type: res.headers.get('content-type') ?? '', events, waitFor, close: () => ctrl.abort() };
}

const db = await openStore();
const aEmail = `live-a-${stamp}@smarttb.study`;
const bEmail = `live-b-${stamp}@smarttb.study`;
const aId = await db.createUser({ email: aEmail, name: 'Live Watcher', role: 'research_officer', password: PW });
await db.createUser({ email: bEmail, name: 'Live Writer', role: 'pi', isAdmin: true, password: PW });
if (!(await db.user(SYS))) await db.createUser({ email: SYS, name: 'System Admin Test', role: 'data_manager', isAdmin: true, password: PW });
const a = client();
const b = client();
const sys = client();
await a('/api/auth/login', { method: 'POST', body: { email: aEmail, password: PW } });
await b('/api/auth/login', { method: 'POST', body: { email: bEmail, password: PW } });
await sys('/api/auth/login', { method: 'POST', body: { email: SYS, password: PW } });

const streams = [];
try {
  const anon = await listen(client());
  check('signed-out visitors cannot open the live channel', anon.status === 401, `${anon.status}`);

  const la = await listen(a);
  const lb = await listen(b);
  streams.push(la, lb);
  check('a signed-in screen gets an event stream', la.status === 200 && la.type.startsWith('text/event-stream'), `${la.status} ${la.type}`);
  check('it starts with a hello naming the account', !!(await la.waitFor((e) => e.type === 'hello' && e.userId === aId)), JSON.stringify(la.events));

  // A new participant reaches the other screen.
  let r = await b('/api/participants', { method: 'POST' });
  const uid = r.json.participant?.uid;
  const created = await la.waitFor((e) => e.type === 'participant' && e.uid === uid && e.kind === 'created');
  check('enrolling reaches other screens within seconds', !!created, JSON.stringify(la.events.slice(-3)));
  check('with who did it', created?.by === 'Live Writer', JSON.stringify(created));
  check('and nothing but the fact of the change', created && Object.keys(created).sort().join(',') === 'by,byId,kind,module,type,uid', JSON.stringify(created));

  // A field edit names its module.
  r = await b(`/api/participants/${uid}/modules/1`, { method: 'PATCH', body: { patch: { screeningDate: '2026-11-01' } } });
  check('the edit is saved', r.status === 200, `${r.status} ${JSON.stringify(r.json)}`);
  const changed = await la.waitFor((e) => e.type === 'participant' && e.uid === uid && e.kind === 'changed' && e.module === 1);
  check('a field edit is announced with its module', !!changed, JSON.stringify(la.events.slice(-3)));
  check('the value itself is not sent', !JSON.stringify(la.events).includes('2026-11-01'));

  // A refused change announces nothing.
  const before = la.events.length;
  r = await a(`/api/participants/${uid}/modules/6`, { method: 'PATCH', body: { patch: {} } });
  await new Promise((res) => setTimeout(res, 600));
  check('a refused change is not announced', r.status >= 400 && la.events.slice(before).every((e) => e.type !== 'participant'), `${r.status} ${JSON.stringify(la.events.slice(before))}`);

  // Presence.
  r = await b('/api/live/presence', { method: 'POST', body: { uid, module: 1 } });
  check('presence is accepted', r.status === 200, `${r.status}`);
  const here = await la.waitFor((e) => e.type === 'presence' && e.uid === uid && e.editors.some((x) => x.name === 'Live Writer' && x.module === 1));
  check('others see who is entering which module', !!here, JSON.stringify(la.events.slice(-2)));
  r = await b('/api/live/presence', { method: 'POST', body: { uid, module: null } });
  check('and when they leave', !!(await la.waitFor((e) => e.type === 'presence' && e.uid === uid && e.editors.length === 0)), JSON.stringify(la.events.slice(-2)));
  check('presence needs a valid module', (await b('/api/live/presence', { method: 'POST', body: { uid, module: 11 } })).status === 400);
  check('and a valid participant id', (await b('/api/live/presence', { method: 'POST', body: { uid: '../x', module: 1 } })).status === 400);
  check('signed-out visitors cannot send presence', (await client()('/api/live/presence', { method: 'POST', body: { uid, module: 1 } })).status === 401);
  check('nor another site', (await b('/api/live/presence', { method: 'POST', body: { uid, module: 1 }, headers: { origin: 'https://evil.example' } })).status === 403);
  await b('/api/live/presence', { method: 'POST', body: { uid, module: null } });

  // A role change tells only that account (its screen then re-reads its rights).
  r = await sys('/api/system/accounts', { method: 'POST', body: { userId: aId, action: 'role', role: 'phlebotomist' } });
  check('the role change went through', r.status === 200, `${r.status} ${JSON.stringify(r.json)}`);
  check('the account whose role changed is told', !!(await la.waitFor((e) => e.type === 'account' && e.userId === aId)));
  check('other accounts are not', !lb.events.some((e) => e.type === 'account'), JSON.stringify(lb.events.filter((e) => e.type === 'account')));

  // Signing out ends the channel for that session.
  await a('/api/auth/logout', { method: 'POST' });
  const after = await listen(a);
  check('after signing out the channel is refused', after.status === 401, `${after.status}`);
} finally {
  streams.forEach((s) => s.close());
}

await db.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
