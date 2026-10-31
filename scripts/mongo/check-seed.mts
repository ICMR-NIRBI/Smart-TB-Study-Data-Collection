/*
 * Checks that the demo participants load into an empty database and read back intact (contact details encrypted,
 * hidden from roles that may not see them). Point it at a scratch database, never the real one:
 *   MONGODB_DB=smarttb_seedcheck MONGODB_URI=<admin or owner address> MONGODB_OWNER_URI=<same> \
 *     node --import tsx scripts/mongo/migrate.mts   (once, to create the collections)
 *   ... then scripts/mongo/seed-accounts.mts, then this script.
 */
import './loadenv';
import { isDeepStrictEqual } from 'node:util';
import { closeClient } from '../../src/server/mongo/client';
import { loadParticipants } from '../../src/server/participants';
import { reader } from '../../src/server/mongo/tx';
import { seedParticipants } from '../../src/data/participants';

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${extra}`}`);
};

const piView = { role: 'pi', isAdmin: true, delegations: [] as never[] };
const pkView = { role: 'pk_scientist', isAdmin: false, delegations: [] as never[] };

const loaded = await loadParticipants(reader, piView);
check('every demo participant is stored', loaded.length === seedParticipants.length, `${loaded.length} of ${seedParticipants.length}`);
check('with ten modules each', (await reader.count('crf_modules')) === seedParticipants.length * 10);

let same = 0;
let contactsOk = 0;
const problems: string[] = [];
for (const want of seedParticipants) {
  const got = loaded.find((p) => p.uid === want.uid);
  if (!got) {
    problems.push(`${want.uid} missing`);
    continue;
  }
  if (isDeepStrictEqual(got.data, want.data)) same++;
  else {
    const gotData = got.data as unknown as Record<string, Record<string, unknown>>;
    const wantData = want.data as unknown as Record<string, Record<string, unknown>>;
    const diff = Object.keys(wantData).flatMap((m) => Object.keys(wantData[m]).filter((k) => !isDeepStrictEqual(gotData[m][k], wantData[m][k])).map((k) => `${m}.${k}`));
    problems.push(`${want.uid} data differs at ${diff.slice(0, 4).join(', ')}`);
  }
  if (got.data.m1.phone === want.data.m1.phone && got.data.m1.address === want.data.m1.address) contactsOk++;
  for (const id of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const) {
    if (got.meta[id].completed !== want.meta[id].completed || got.meta[id].completedBy !== want.meta[id].completedBy) problems.push(`${want.uid} module ${id} meta differs`);
    if (got.meta[id].edits.length !== want.meta[id].edits.length) problems.push(`${want.uid} module ${id} edit reasons differ`);
  }
}
check('the stored data equals the seed data, field for field (PI view)', same === seedParticipants.length, problems.slice(0, 3).join('; '));
check('phone and address come back decrypted for the PI', contactsOk === seedParticipants.length, `${contactsOk}`);
check('who locked each module, and the edit reasons, are kept', !problems.some((p) => p.includes('meta') || p.includes('edit reasons')), problems.slice(0, 3).join('; '));

const asPk = await loadParticipants(reader, pkView);
check('a PK scientist gets the records without contact details', asPk.every((p) => p.contactsHidden && p.data.m1.phone === '' && p.data.m1.address === ''));
const withPhone = seedParticipants.find((p) => p.data.m1.phone);
if (withPhone) {
  const raw = await reader.findOne('participant_contacts', { _id: withPhone.uid as never });
  check('the stored phone is ciphertext', !!raw && !Buffer.from(raw.phone_enc.buffer).includes(withPhone.data.m1.phone));
}
const audited = await reader.count('audit_log', { table_name: 'participants' });
check('every participant insert is in the audit trail', audited === seedParticipants.length, `${audited}`);

await closeClient();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
