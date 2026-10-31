// Participants and CRF modules through the API: enrolment, who may see contact details, encryption at rest, role and
// sequence rules, locking, reopening with a reason, PI sign-off, screen failure, discontinuation and simultaneous edits.
// Accounts come from the database adapter, so it runs on either database. Default server: http://localhost:3100.
// Start the server with NEXT_PUBLIC_CRF_PREVIEW=false (npm run test:e2e does) so modules open in sequence, as live.
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
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, json: await res.json().catch(() => ({})) };
  };
}

const db = await openStore();
const make = async (tag, role, isAdmin, name) => {
  const email = `pt-${tag}-${stamp}@smarttb.study`;
  const id = await db.createUser({ email, name, role, isAdmin, password: PW });
  const c = client();
  const r = await c('/api/auth/login', { method: 'POST', body: { email, password: PW } });
  if (r.status !== 200) throw new Error(`login ${tag}: ${r.status}`);
  return { c, id, email, name };
};
const ro = await make('ro', 'research_officer', false, 'Rita Officer');
const ph = await make('ph', 'phlebotomist', false, 'Paul Phleb');
const pk = await make('pk', 'pk_scientist', false, 'Kim Scientist');
const dm = await make('dm', 'data_manager', true, 'Dana Manager');
const pi = await make('pi', 'pi', true, 'Pat Investigator');

const enrol = async (u) => (await u.c('/api/participants', { method: 'POST' })).json.participant;
const get = (u, uid) => u.c(`/api/participants/${uid}`);
const patch = (u, uid, id, p) => u.c(`/api/participants/${uid}/modules/${id}`, { method: 'PATCH', body: { patch: p } });
const act = (u, uid, id, body) => u.c(`/api/participants/${uid}/modules/${id}`, { method: 'POST', body });
const pad = (n, w = 3) => String(n).padStart(w, '0');
let nextId = 0;
const m1 = () => ({ participantId: `SMART-TB-${pad(stamp % 1000)}-${pad(++nextId)}`, dob: '1985-03-12', gender: 'female', ethnicity: 'Bengali', phone: '9876543210', address: '12 Test Road, Kolkata' });

// --- enrolment
let r = await ph.c('/api/participants', { method: 'POST' });
check('a phlebotomist cannot enrol', r.status === 403, `${r.status}`);
r = await pk.c('/api/participants', { method: 'POST' });
check('a PK scientist cannot enrol', r.status === 403, `${r.status}`);
r = await dm.c('/api/participants', { method: 'POST' });
check('the data manager cannot enrol (no first entry)', r.status === 403, `${r.status}`);
r = await client()('/api/participants', { method: 'POST' });
check('signed-out visitors cannot enrol', r.status === 401, `${r.status}`);
const p1 = await enrol(ro);
check('a research officer enrols a participant', /^p_[a-z0-9]+_[a-z0-9]+$/.test(p1?.uid ?? ''), JSON.stringify(p1)?.slice(0, 160));
check('with ten empty, unlocked modules', Object.keys(p1.meta).length === 10 && Object.values(p1.meta).every((m) => !m.completed && !m.editing && m.edits.length === 0) && p1.discontinuationRequested === false);
const piOwn = await enrol(pi);
check('the PI can enrol too (every module is theirs)', !!piOwn?.uid);
r = await get(ro, 'p_nothing_here');
check('an unknown participant is a 404', r.status === 404, `${r.status}`);
r = await ph.c('/api/participants');
check('everyone signed in can list participants', r.status === 200 && r.json.participants.some((p) => p.uid === p1.uid), `${r.status}`);

// --- filling in Module 1: validation of what is sent
r = await patch(pk, p1.uid, 1, { ethnicity: 'x' });
check('a PK scientist cannot fill in Module 1', r.status === 403, `${r.status} ${JSON.stringify(r.json)}`);
r = await patch(ro, p1.uid, 1, { nonsense: 'x' });
check('an unknown field is refused', r.status === 400, `${r.status}`);
r = await patch(ro, p1.uid, 1, { participantId: 5 });
check('a value of the wrong type is refused', r.status === 400, `${r.status}`);
r = await patch(ro, p1.uid, 1, 'not an object');
check('a patch that is not an object is refused', r.status === 400, `${r.status}`);
r = await patch(ro, p1.uid, 6, { clinicalComments: 'x' });
check('a module out of its turn cannot be filled in', r.status === 409 || r.status === 403, `${r.status}`);
const data1 = m1();
r = await patch(ro, p1.uid, 1, data1);
check('a research officer fills in Module 1', r.status === 200, `${r.status} ${JSON.stringify(r.json)}`);

// --- who sees phone and address
const view = async (u) => (await get(u, p1.uid)).json.participant;
const asRo = await view(ro);
check('the research officer who enters Module 1 sees the contact details', asRo.data.m1.phone === data1.phone && asRo.data.m1.address === data1.address && !asRo.contactsHidden, JSON.stringify(asRo.data.m1));
const asPi = await view(pi);
const asDm = await view(dm);
check('the PI and an administrator always see them', asPi.data.m1.phone === data1.phone && asDm.data.m1.address === data1.address);
const asPk = await view(pk);
const asPh = await view(ph);
check('a PK scientist and a phlebotomist do not (hidden and blank)', asPk.contactsHidden === true && asPk.data.m1.phone === '' && asPh.contactsHidden === true && asPh.data.m1.address === '', JSON.stringify([asPk.data.m1.phone, asPh.data.m1.address]));
check('the rest of Module 1 is visible to them', asPk.data.m1.participantId === data1.participantId && asPk.data.m1.ethnicity === 'Bengali');

// --- at rest
const raw = await db.contactRaw(p1.uid);
check('the phone and address are stored encrypted, not readable', !!raw && !raw.phone.includes(data1.phone) && !raw.address.includes('Test Road') && raw.phone.length > 10, JSON.stringify(raw && [raw.phone.length, raw.address.length]));
const stored = await db.moduleData(p1.uid, 1);
check('and are not part of the module data', stored && !('phone' in stored) && !('address' in stored) && stored.participantId === data1.participantId, JSON.stringify(stored));
const contactAudit = (await db.audit('participant_contacts', p1.uid)).map((x) => x.changes).join(' ');
check('the audit trail of the contacts holds no readable phone or address', contactAudit.length > 0 && !contactAudit.includes(data1.phone) && !contactAudit.includes('Test Road'), contactAudit.slice(0, 120));
const modAudit = (await db.audit('crf_modules', `${p1.uid}:1`)).map((x) => x.changes).join(' ');
check('nor does the module audit trail', !modAudit.includes(data1.phone) && !modAudit.includes('Test Road'));
await patch(ro, p1.uid, 1, { phone: '9123456780' });
check('changing only the phone keeps the address', (await view(ro)).data.m1.phone === '9123456780' && (await view(ro)).data.m1.address === data1.address);
await patch(ro, p1.uid, 1, { phone: data1.phone });

// --- a participant id can be used once
const other = await enrol(ro);
r = await patch(ro, other.uid, 1, { participantId: data1.participantId });
check('the same participant id cannot be given to a second participant', r.status === 409 && /already in use/.test(r.json.error), `${r.status} ${JSON.stringify(r.json)}`);
r = await patch(ro, other.uid, 1, { participantId: `SMART-TB-${pad(stamp % 1000)}-${pad(++nextId)}` });
check('a different one is fine', r.status === 200, `${r.status}`);
r = await patch(ro, other.uid, 1, { participantId: '' });
check('and an empty id never clashes', r.status === 200, `${r.status}`);

// --- draft, then locking
r = await act(ro, p1.uid, 1, { action: 'draft' });
check('saving a draft records when', r.status === 200 && !!r.json.participant.meta[1].draftSavedAt, JSON.stringify(r.json).slice(0, 120));
r = await act(ro, other.uid, 1, { action: 'complete' });
check('locking an incomplete module is refused with the reasons', r.status === 422 && !!r.json.details && Object.keys(r.json.details).length > 0, `${r.status} ${JSON.stringify(r.json).slice(0, 160)}`);
r = await act(ph, p1.uid, 1, { action: 'complete' });
check('a role that cannot enter the module cannot lock it', r.status === 403, `${r.status}`);
r = await act(ro, p1.uid, 2, { action: 'complete' });
check('Module 2 cannot be locked before Module 1', r.status === 409, `${r.status}`);
r = await act(ro, p1.uid, 1, { action: 'complete' });
const done1 = r.json.participant?.meta?.[1];
check('Module 1 locks once valid, recording who and when', r.status === 200 && done1.completed && done1.completedBy === ro.name && done1.completedRole === 'Research Officer' && !!done1.completedAt && !done1.editing, `${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);
r = await patch(ro, p1.uid, 1, { ethnicity: 'Other' });
check('a locked module cannot be changed', r.status === 409, `${r.status}`);
r = await act(ro, p1.uid, 1, { action: 'draft' });
check('nor drafted', r.status === 409, `${r.status}`);

// --- reopening with a reason
r = await act(ro, p1.uid, 1, { action: 'reopen', reason: '' });
check('reopening needs a reason', r.status === 400, `${r.status}`);
r = await act(pk, p1.uid, 1, { action: 'reopen', reason: 'I want to look' });
check('a PK scientist cannot reopen Module 1', r.status === 403, `${r.status}`);
r = await act(dm, other.uid, 1, { action: 'reopen', reason: 'not locked' });
check('only a locked module can be reopened', r.status === 409, `${r.status}`);
r = await act(dm, p1.uid, 1, { action: 'reopen', reason: 'Ethnicity entered wrongly' });
const re = r.json.participant?.meta?.[1];
check('the data manager reopens it with a reason, and the reason is kept', r.status === 200 && re.editing && re.edits.length === 1 && re.edits[0].reason === 'Ethnicity entered wrongly' && re.edits[0].by === dm.name, `${r.status} ${JSON.stringify(re)}`);
r = await patch(dm, p1.uid, 1, { ethnicity: 'Marathi' });
check('and corrects a field while it is open', r.status === 200, `${r.status} ${JSON.stringify(r.json)}`);
const fieldAudit = await db.audit('crf_modules', `${p1.uid}:1`);
const corr = fieldAudit.find((x) => /data\.ethnicity/.test(x.changes) && /Marathi/.test(x.changes));
check('the field change in the audit trail carries the reason', corr?.reason === 'Ethnicity entered wrongly', JSON.stringify(fieldAudit.map((x) => [x.action, x.reason])));
check('and records the old and new values', /Bengali/.test(corr?.changes ?? ''), corr?.changes);
r = await act(dm, p1.uid, 1, { action: 'complete' });
const relocked = r.json.participant?.meta?.[1];
check('it is locked again; the first person to lock it stays on record', r.status === 200 && relocked.completed && !relocked.editing && relocked.completedBy === ro.name, `${r.status} ${JSON.stringify(relocked)}`);
check('and the edit history stays', relocked?.edits.length === 1);

// --- Module 2: only the PI signs off
const crit = (await get(ro, p1.uid)).json.participant.data.m2;
const eligible = { inclusion: Object.fromEntries(Object.keys(crit.inclusion).map((k) => [k, 'yes'])), exclusion: Object.fromEntries(Object.keys(crit.exclusion).map((k) => [k, 'no'])), investigatorName: 'Dr Test', signDate: '2026-10-30' };
r = await patch(ro, p1.uid, 2, eligible);
check('a research officer prepares Module 2', r.status === 200, `${r.status} ${JSON.stringify(r.json)}`);
r = await act(ro, p1.uid, 2, { action: 'complete' });
check('but cannot sign it off', r.status === 403 && /Only the PI/.test(r.json.error), `${r.status} ${JSON.stringify(r.json)}`);
r = await act(pi, p1.uid, 2, { action: 'complete' });
check('the PI signs it off', r.status === 200 && r.json.participant.meta[2].completed && r.json.participant.meta[2].completedBy === pi.name, `${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);
check('an eligible participant moves on to Module 3', r.json.participant.data.m10.status !== 'discontinued');

// --- a screen failure closes the participant out
const sf = await enrol(ro);
await patch(ro, sf.uid, 1, m1());
await act(ro, sf.uid, 1, { action: 'complete' });
const exclusion = { ...eligible.exclusion, [Object.keys(eligible.exclusion)[0]]: 'yes' };
await patch(ro, sf.uid, 2, { ...eligible, exclusion });
r = await act(pi, sf.uid, 2, { action: 'complete' });
check('an ineligible result on sign-off records a screen failure in Module 10', r.status === 200 && r.json.participant.data.m10.status === 'discontinued' && r.json.participant.data.m10.reason === 'screen_failure', `${r.status} ${JSON.stringify(r.json.participant?.data?.m10)}`);
r = await patch(ro, sf.uid, 3, { height: '165' });
check('and the later modules are locked', r.status === 409, `${r.status}`);

// --- discontinuing
const dc = await enrol(ro);
await patch(ro, dc.uid, 1, m1());
await act(ro, dc.uid, 1, { action: 'complete' });
r = await ph.c(`/api/participants/${dc.uid}`, { method: 'POST', body: { action: 'discontinue', reason: 'withdrawal' } });
check('a phlebotomist cannot discontinue', r.status === 403, `${r.status}`);
r = await ro.c(`/api/participants/${dc.uid}`, { method: 'POST', body: { action: 'nonsense' } });
check('an unknown action is refused', r.status === 400, `${r.status}`);
r = await ro.c(`/api/participants/${dc.uid}`, { method: 'POST', body: { action: 'discontinue', reason: 'withdrawal' } });
check('a research officer discontinues with a reason', r.status === 200 && r.json.participant.discontinuationRequested && r.json.participant.data.m10.status === 'discontinued' && r.json.participant.data.m10.reason === 'withdrawal', `${r.status} ${JSON.stringify(r.json).slice(0, 160)}`);
r = await ro.c(`/api/participants/${dc.uid}`, { method: 'POST', body: { action: 'discontinue', reason: 'death' } });
check('doing it twice is refused', r.status === 409, `${r.status}`);
r = await patch(ro, dc.uid, 3, { height: '165' });
check('after discontinuing, the middle modules are locked', r.status === 409, `${r.status}`);

// --- simultaneous edits
const rc = await enrol(ro);
const [a, b] = await Promise.all([patch(ro, rc.uid, 1, { ethnicity: 'Parallel A' }), patch(ro, rc.uid, 1, { dob: '1990-01-02' })]);
const merged = (await view2(rc.uid)).data.m1;
async function view2(uid) {
  return (await get(pi, uid)).json.participant;
}
check('two edits to different fields at once are both kept', a.status === 200 && b.status === 200 && merged.ethnicity === 'Parallel A' && merged.dob === '1990-01-02', `${a.status},${b.status} ${merged.ethnicity}/${merged.dob}`);
await patch(ro, rc.uid, 1, m1());
const [c1, c2] = await Promise.all([act(ro, rc.uid, 1, { action: 'complete' }), act(ro, rc.uid, 1, { action: 'complete' })]);
check('locking twice at once works exactly once', [c1.status, c2.status].sort().join() === '200,409', `${c1.status},${c2.status}`);
const [d1, d2] = await Promise.all([
  act(dm, rc.uid, 1, { action: 'reopen', reason: 'first reopen' }),
  act(dm, rc.uid, 1, { action: 'reopen', reason: 'second reopen' }),
]);
check('reopening twice at once is allowed, and each reason is kept', [d1.status, d2.status].join() === '200,200' && (await view2(rc.uid)).meta[1].edits.length === 2, `${d1.status},${d2.status}`);

// --- the participant record itself is audited
const audit = await db.audit('participants', p1.uid);
check('enrolment is in the audit trail, by the person who did it', audit[0]?.action === 'INSERT', JSON.stringify(audit.map((x) => x.action)));

// --- the list: most recently touched first
r = await pi.c('/api/participants');
const order = r.json.participants.map((p) => p.updatedAt);
check('the list is ordered most recently updated first', order.every((t, i) => i === 0 || order[i - 1] >= t));

await db.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
