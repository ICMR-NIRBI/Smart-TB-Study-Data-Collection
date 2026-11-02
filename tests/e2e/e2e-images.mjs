// Module 5 photos: who may attach and see them, what is refused, replacing keeps the old one, and the audit trail.
// The test server keeps the files in .uploads (or SMARTTB_UPLOAD_DIR).
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore } from './lib/store.mjs';

const BASE = process.env.BASE ?? 'http://localhost:3100';
const stamp = Date.now() % 1000000;
const PW = 'Start-Pass-2026a';
const uploads = process.env.SMARTTB_UPLOAD_DIR ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.uploads');

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${extra}`}`);
};
function client() {
  let cookie = '';
  return async (path, { method = 'GET', body, form } = {}) => {
    const res = await fetch(BASE + path, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
      body: form ?? (body ? JSON.stringify(body) : undefined),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const type = res.headers.get('content-type') ?? '';
    return {
      status: res.status,
      headers: res.headers,
      json: type.includes('json') ? await res.json().catch(() => ({})) : {},
      bytes: type.startsWith('image/') ? Buffer.from(await res.arrayBuffer()) : null,
    };
  };
}

const db = await openStore();
const make = async (tag, role, isAdmin = false) => {
  const email = `img-${tag}-${stamp}@smarttb.study`;
  await db.createUser({ email, name: `Image ${tag}`, role, isAdmin, password: PW });
  const c = client();
  const r = await c('/api/auth/login', { method: 'POST', body: { email, password: PW } });
  if (r.status !== 200) throw new Error(`login ${tag}: ${r.status}`);
  return c;
};
const ro = await make('ro', 'research_officer');
const ph = await make('ph', 'phlebotomist');
const pk = await make('pk', 'pk_scientist');

// Small pictures: only the first bytes decide the type.
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(`test-${stamp}-jpeg`), Buffer.from([0xff, 0xd9])]);
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(`test-${stamp}-png`)]);
const upload = (c, uid, { bytes = jpeg, timepoint = '0', kind = 'blood', imageId = '0042', type = 'image/jpeg' } = {}) => {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type }), 'photo.jpg');
  form.append('timepoint', timepoint);
  form.append('kind', kind);
  form.append('imageId', imageId);
  return c(`/api/participants/${uid}/images`, { method: 'POST', form });
};

const enrol = async () => (await ro('/api/participants', { method: 'POST' })).json.participant.uid;
const uid = await enrol();

// --- while Module 5 is not yet open
let r = await upload(ph, uid);
check('no photo before Modules 1 to 4 are done (Module 5 is locked)', r.status === 409, `${r.status} ${JSON.stringify(r.json)}`);
await db.completeModules(uid, [1, 2, 3, 4]);

// --- refusals
r = await upload(client(), uid);
check('signed-out visitors cannot upload', r.status === 401, `${r.status}`);
r = await upload(pk, uid);
check('a PK scientist cannot attach Module 5 photos', r.status === 403, `${r.status} ${JSON.stringify(r.json)}`);
r = await upload(ph, uid, { bytes: Buffer.from('%PDF-1.4 not a picture'), type: 'image/jpeg' });
check('a file that is not a picture is refused, whatever its name says', r.status === 400 && /JPEG/.test(r.json.error ?? ''), `${r.status} ${JSON.stringify(r.json)}`);
r = await upload(ph, uid, { bytes: Buffer.concat([jpeg, Buffer.alloc(8 * 1024 * 1024)]) });
check('a photo over 8 MB is refused', r.status === 413, `${r.status}`);
r = await upload(ph, uid, { timepoint: '5' });
check('the saliva-only timepoint takes no photo', r.status === 400, `${r.status}`);
r = await upload(ph, uid, { timepoint: '99' });
check('an unknown timepoint is refused', r.status === 400, `${r.status}`);
r = await upload(ph, uid, { kind: 'saliva' });
check('only blood or plasma photos', r.status === 400, `${r.status}`);
r = await upload(ph, 'p_nosuch_participant');
check('an unknown participant is a 404', r.status === 404, `${r.status}`);
r = await upload(ph, '..%2F..%2Fetc');
check('a path in place of a participant is refused', r.status === 404 || r.status === 400, `${r.status}`);
check('nothing was stored by the refused uploads', (await db.photos(uid)).length === 0);

// --- attaching
r = await upload(ph, uid);
const first = r.json.photo;
check('the phlebotomist attaches the 0 h blood photo', r.status === 200 && first?.timepoint === '0' && first.kind === 'blood' && first.imageId === '0042' && first.uploadedBy === 'Image ph', `${r.status} ${JSON.stringify(r.json)}`);
r = await upload(ph, uid, { kind: 'plasma', imageId: '0043', bytes: png, type: 'image/png' });
check('and the 0 h plasma photo (PNG)', r.status === 200 && r.json.photo?.kind === 'plasma', `${r.status} ${JSON.stringify(r.json)}`);

r = await pk(`/api/participants/${uid}/images`);
check('any signed-in role sees the list', r.status === 200 && r.json.photos?.length === 2, `${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);
r = await pk(`/api/images/${first.id}`);
check('and can open the picture, exactly as uploaded', r.status === 200 && r.headers.get('content-type') === 'image/jpeg' && r.bytes?.equals(jpeg), `${r.status} ${r.headers.get('content-type')}`);
check('it is not cached and not guessed as another type', /no-store/.test(r.headers.get('cache-control') ?? '') && r.headers.get('x-content-type-options') === 'nosniff');
r = await client()(`/api/images/${first.id}`);
check('signed-out visitors cannot open it', r.status === 401, `${r.status}`);
r = await client()(`/api/participants/${uid}/images`);
check('nor list the photos', r.status === 401, `${r.status}`);
r = await pk('/api/images/no-such-photo');
check('an unknown photo is a 404', r.status === 404, `${r.status}`);

const stored = await db.photos(uid);
check('the file is on disk, named by its content', stored.length === 2 && stored.every((p) => existsSync(join(uploads, p.file)) && p.file.startsWith(`${uid}/`)), JSON.stringify(stored.map((p) => p.file)));

// --- replacing
const replacement = Buffer.concat([jpeg, Buffer.from('second')]);
r = await upload(ph, uid, { bytes: replacement, imageId: '0044' });
const second = r.json.photo;
check('a photo can be replaced', r.status === 200 && second?.id !== first.id && second.imageId === '0044', `${r.status} ${JSON.stringify(r.json)}`);
r = await ph(`/api/participants/${uid}/images`);
check('the list shows the new one only', r.json.photos?.length === 2 && r.json.photos.some((p) => p.id === second.id) && !r.json.photos.some((p) => p.id === first.id), JSON.stringify(r.json.photos));
const all = await db.photos(uid);
const old = all.find((p) => p._id === first.id);
check('the old one stays on record, marked replaced, its file kept', all.length === 3 && !!old?.replaced_at && !!old.replaced_by && existsSync(join(uploads, old.file)), JSON.stringify(all.map((p) => [p._id, p.replaced_at])));
r = await ph(`/api/images/${first.id}`);
check('and can still be opened', r.status === 200 && r.bytes?.equals(jpeg), `${r.status}`);

// --- audit trail
const auditNew = await db.audit('crf_images', second.id);
check('the upload is in the audit trail with its reason', auditNew.some((a) => a.action === 'INSERT' && a.reason === 'Module 5 photo attached'), JSON.stringify(auditNew));
const auditOld = await db.audit('crf_images', first.id);
check('so is the replacement of the old one', auditOld.some((a) => a.action === 'UPDATE' && /replaced_at/.test(a.changes)), JSON.stringify(auditOld));

// --- once Module 5 is locked
await db.completeModules(uid, [5]);
r = await upload(ph, uid, { timepoint: '1' });
check('no new photos once Module 5 is locked', r.status === 409, `${r.status} ${JSON.stringify(r.json)}`);
r = await pk(`/api/participants/${uid}/images`);
check('but they can still be seen', r.status === 200 && r.json.photos?.length === 2, `${r.status}`);

await db.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
