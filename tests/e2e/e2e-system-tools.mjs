// System control tools: health, server actions, maintenance mode, announcements, account rescue, browser errors and
// the audit search. The test server names sysadmin-e2e@smarttb.study in SYSTEM_ADMIN_EMAILS (see run-all.mjs).
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore } from './lib/store.mjs';

const BASE = process.env.BASE ?? 'http://localhost:3100';
const stamp = Date.now() % 1000000;
const PW = 'Start-Pass-2026a';
const SYS = 'sysadmin-e2e@smarttb.study';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const actionsDir = process.env.SMARTTB_ACTIONS_DIR ?? join(root, '.smarttb-actions', 'requests');
const statusDir = process.env.SMARTTB_ACTIONS_STATUS_DIR ?? join(root, '.smarttb-actions', 'status');

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
    const type = res.headers.get('content-type') ?? '';
    return { status: res.status, type, json: type.includes('json') ? await res.json().catch(() => ({})) : {}, text: type.includes('csv') ? await res.text() : '' };
  };
}
const db = await openStore();
const login = async (email, password = PW) => {
  const c = client();
  const r = await c('/api/auth/login', { method: 'POST', body: { email, password } });
  return { c, r };
};

const old = await db.user(SYS);
if (old) await db.deleteUser(old.id);
await db.createUser({ email: SYS, name: 'System Admin Test', role: 'data_manager', isAdmin: true, password: PW });
const piEmail = `tools-pi-${stamp}@smarttb.study`;
await db.createUser({ email: piEmail, role: 'pi', isAdmin: true, password: PW });
const targetEmail = `tools-target-${stamp}@smarttb.study`;
const targetId = await db.createUser({ email: targetEmail, name: 'Target Person', role: 'research_officer', password: PW });
const { c: sys } = await login(SYS);
const { c: pi } = await login(piEmail);

try {
  // --- who may use the tools
  for (const [path, body] of [
    ['/api/system/accounts', { userId: targetId, action: 'unlock', reason: 'not allowed here' }],
    ['/api/system/actions', { action: 'backup', reason: 'not allowed here' }],
    ['/api/system/site', { kind: 'announcement', text: 'nope', hours: 1 }],
  ]) {
    const r = await pi(path, { method: 'POST', body });
    check(`the PI cannot use ${path}`, r.status === 403, `${r.status}`);
  }
  check('nor search the audit trail', (await pi('/api/system/audit')).status === 403);
  check('nor see an account’s devices', (await pi(`/api/system/accounts?id=${targetId}`)).status === 403);

  // --- health
  let r = await sys('/api/system');
  const checks = r.json.health?.checks ?? [];
  const byKey = Object.fromEntries(checks.map((c) => [c.key, c]));
  check('health checks are returned, each with a state', checks.length >= 6 && checks.every((c) => ['ok', 'warn', 'bad', 'unknown'].includes(c.state) && c.label && c.value), JSON.stringify(checks).slice(0, 300));
  check('the database check is OK', byKey.database?.state === 'ok', JSON.stringify(byKey.database));
  check('disk space is reported', !!byKey.disk && byKey.disk.state !== undefined, JSON.stringify(byKey.disk));
  check('counts and the app version are included', typeof r.json.health.counts?.participants === 'number' && typeof r.json.health.app?.version === 'string', JSON.stringify(r.json.health.app));

  // --- server actions
  rmSync(join(statusDir, 'installed'), { force: true });
  rmSync(join(actionsDir, 'backup.request'), { force: true });
  rmSync(join(statusDir, 'backup.json'), { force: true });
  r = await sys('/api/system/actions', { method: 'POST', body: { action: 'backup', reason: 'Testing backup now' } });
  check('without the server helper, actions are refused clearly', r.status === 409 && /not installed/.test(r.json.error ?? ''), `${r.status} ${JSON.stringify(r.json)}`);
  mkdirSync(statusDir, { recursive: true });
  writeFileSync(join(statusDir, 'installed'), '');
  r = await sys('/api/system/actions', { method: 'POST', body: { action: 'backup', reason: '' } });
  check('a reason is required', r.status === 400, `${r.status}`);
  r = await sys('/api/system/actions', { method: 'POST', body: { action: 'rm -rf', reason: 'Testing an unknown action' } });
  check('only the two known actions exist', r.status === 400, `${r.status}`);
  r = await sys('/api/system/actions', { method: 'POST', body: { action: 'backup', reason: 'Testing backup now' } });
  check('backup now drops a request for the server helper', r.status === 200 && existsSync(join(actionsDir, 'backup.request')) && r.json.actions?.find((a) => a.action === 'backup')?.pendingSince, `${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);
  r = await sys('/api/system/actions', { method: 'POST', body: { action: 'backup', reason: 'Testing backup now' } });
  check('a second request while one is waiting is refused', r.status === 409, `${r.status}`);
  rmSync(join(actionsDir, 'backup.request'), { force: true });
  writeFileSync(join(statusDir, 'backup.json'), JSON.stringify({ action: 'backup', ok: true, message: 'Backup written and verified', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString() }));
  r = await sys('/api/system');
  const last = r.json.actions?.actions?.find((a) => a.action === 'backup')?.last;
  check('the helper’s result is shown', last?.ok === true && /verified/.test(last.message), JSON.stringify(last));
  r = await sys('/api/system/actions', { method: 'POST', body: { action: 'backup', reason: 'Testing backup now' } });
  check('not again within two minutes', r.status === 429, `${r.status}`);
  check('the request is in the audit trail', (await db.audit('server_actions', 'backup')).some((a) => a.action === 'BACKUP_REQUESTED' && a.reason === 'Testing backup now'));

  // --- maintenance mode
  r = await sys('/api/system/site', { method: 'POST', body: { kind: 'maintenance', on: true, message: 'Back by 18:00', reason: '' } });
  check('maintenance needs a reason', r.status === 400, `${r.status}`);
  r = await sys('/api/system/site', { method: 'POST', body: { kind: 'maintenance', on: true, message: 'Back by 18:00', reason: 'Testing maintenance' } });
  check('maintenance mode turns on', r.status === 200 && r.json.maintenance?.on === true, `${r.status} ${JSON.stringify(r.json)}`);
  await new Promise((res) => setTimeout(res, 5500)); // the server keeps the switch for up to 5 seconds
  r = await pi('/api/participants', { method: 'POST' });
  check('others cannot save while it is on, and are told why', r.status === 503 && /maintenance/i.test(r.json.error ?? '') && /18:00/.test(r.json.error), `${r.status} ${JSON.stringify(r.json)}`);
  r = await pi('/api/participants');
  check('but can still read', r.status === 200, `${r.status}`);
  r = await pi('/api/site');
  check('everyone signed in sees the notice', r.json.maintenance?.message === 'Back by 18:00', JSON.stringify(r.json));
  r = await sys('/api/system/site', { method: 'POST', body: { kind: 'announcement', text: 'Testing the banner', tone: 'warn', hours: 1 } });
  check('the system administrator can still save', r.status === 200, `${r.status}`);
  r = await sys('/api/system');
  check('health shows maintenance as needing attention', r.json.health.checks.some((c) => c.key === 'maintenance' && c.state === 'warn'));
  r = await sys('/api/system/site', { method: 'POST', body: { kind: 'maintenance', on: false, reason: 'Testing maintenance' } });
  check('maintenance mode turns off', r.status === 200 && r.json.maintenance?.on === false, `${r.status}`);
  await new Promise((res) => setTimeout(res, 5500));
  r = await pi('/api/participants', { method: 'POST' });
  const uid = r.json.participant?.uid;
  check('and saving works again', r.status === 200 && !!uid, `${r.status} ${JSON.stringify(r.json).slice(0, 120)}`);

  // --- announcement
  r = await pi('/api/site');
  check('the announcement reaches everyone, with an end time', r.json.announcement?.text === 'Testing the banner' && r.json.announcement.tone === 'warn' && !!r.json.announcement.until, JSON.stringify(r.json));
  r = await client()('/api/site');
  check('but not signed-out visitors', r.json.announcement === null, JSON.stringify(r.json));
  await sys('/api/system/site', { method: 'POST', body: { kind: 'announcement', text: '' } });
  check('an empty text removes it', (await pi('/api/site')).json.announcement === null);

  // --- account rescue: a locked sign-in
  for (let i = 0; i < 5; i++) await client()('/api/auth/login', { method: 'POST', body: { email: targetEmail, password: 'wrong-password-1' } });
  r = (await login(targetEmail)).r;
  check('after five wrong passwords the sign-in is locked', r.status !== 200, `${r.status}`);
  r = await sys(`/api/system/accounts?id=${targetId}`);
  check('the lock is shown', !!r.json.lock?.lockedUntil && r.json.lock.failedAttempts >= 5, JSON.stringify(r.json.lock));
  r = await sys('/api/system/accounts', { method: 'POST', body: { userId: targetId, action: 'unlock', reason: '' } });
  check('unlocking needs a reason', r.status === 400, `${r.status}`);
  r = await sys('/api/system/accounts', { method: 'POST', body: { userId: targetId, action: 'unlock', reason: 'Confirmed by phone call' } });
  check('unlocking works', r.status === 200 && r.json.lock.lockedUntil === null, `${r.status} ${JSON.stringify(r.json.lock)}`);
  const { c: target, r: tr } = await login(targetEmail);
  check('and they can sign in again', tr.status === 200, `${tr.status}`);

  // --- account rescue: signed-in devices
  r = await sys(`/api/system/accounts?id=${targetId}`);
  check('their signed-in device is listed', r.json.devices?.length >= 1 && r.json.devices[0].device, JSON.stringify(r.json.devices));
  r = await sys('/api/system/accounts', { method: 'POST', body: { userId: targetId, action: 'signout', reason: 'Phone lost on the ward' } });
  check('sign out everywhere works', r.status === 200 && r.json.devices.length === 0, `${r.status} ${JSON.stringify(r.json.devices)}`);
  check('their session has ended', (await target('/api/auth/session')).json.user === null);
  const me = (await db.user(SYS)).id;
  r = await sys('/api/system/accounts', { method: 'POST', body: { userId: me, action: 'signout', reason: 'Testing signing myself out' } });
  check('you cannot sign yourself out from here', r.status === 409, `${r.status}`);
  const rescueAudit = await db.audit('app_users', targetId);
  check('both are in the audit trail with the reasons', rescueAudit.some((a) => a.action === 'SIGN_IN_UNLOCKED' && a.reason === 'Confirmed by phone call') && rescueAudit.some((a) => a.action === 'SIGNED_OUT_EVERYWHERE' && a.reason === 'Phone lost on the ward'), JSON.stringify(rescueAudit.map((a) => [a.action, a.reason])));

  // --- errors from browsers
  const marker = `Test browser crash ${Math.random().toString(36).replace(/[^a-z]/g, "").slice(0, 8)}`;
  r = await pi('/api/client-error', { method: 'POST', body: { message: `TypeError: ${marker}`, where: 'page.js:10', page: '/p/test' } });
  check('a browser error is accepted', r.status === 204, `${r.status}`);
  await pi('/api/client-error', { method: 'POST', body: { message: `TypeError: ${marker}`, where: 'page.js:10', page: '/p/test' } });
  r = await sys('/api/system');
  const group = r.json.logs.errorGroups.find((g) => g.message.includes(marker));
  check('errors are grouped: one line, how often, where and for whom', group?.source === 'browser' && group.count === 2 && group.pages.includes('/p/test') && group.people.includes(piEmail), JSON.stringify(group));
  check('health counts errors in the last day', r.json.health.checks.some((c) => c.key === 'errors' && c.state === 'warn'));

  // --- audit search
  r = await sys(`/api/system/audit?account=${encodeURIComponent(targetEmail)}`);
  check('the audit trail can be searched by account', r.status === 200 && r.json.rows.some((x) => /Staff account/.test(x.what) && x.reason === 'Phone lost on the ward'), `${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);
  r = await sys(`/api/system/audit?participant=${uid}`);
  check('and by participant', r.status === 200 && r.json.rows.length > 0 && r.json.rows.every((x) => x.record.includes(uid)), `${r.status} ${JSON.stringify(r.json.rows?.slice(0, 2))}`);
  r = await sys('/api/system/audit?participant=NO-SUCH-ID');
  check('an unknown participant is a clear 404', r.status === 404, `${r.status}`);
  const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  r = await sys(`/api/system/audit?from=${today}&to=${today}&account=${encodeURIComponent(targetEmail)}`);
  check('and by date', r.status === 200 && r.json.rows.length > 0, `${r.status}`);
  r = await sys('/api/system/audit?from=03-11-2026');
  check('a malformed date is refused', r.status === 400, `${r.status}`);
  r = await sys(`/api/system/audit?format=csv&account=${encodeURIComponent(targetEmail)}`);
  check('the result downloads as a CSV file', r.status === 200 && r.type.startsWith('text/csv') && r.text.startsWith('Time (UTC),Who,What,Record,Changes,Reason') && r.text.includes('Phone lost on the ward'), `${r.status} ${r.type} ${r.text.slice(0, 80)}`);
} finally {
  // Never leave the test server in maintenance mode or with a banner, whatever happened above.
  await sys('/api/system/site', { method: 'POST', body: { kind: 'maintenance', on: false, reason: 'End of the test run' } });
  await sys('/api/system/site', { method: 'POST', body: { kind: 'announcement', text: '' } });
  rmSync(join(actionsDir, 'backup.request'), { force: true });
  rmSync(join(statusDir, 'backup.json'), { force: true });
  rmSync(join(statusDir, 'installed'), { force: true });
}

await db.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
