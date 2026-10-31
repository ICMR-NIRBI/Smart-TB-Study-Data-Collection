/*
 * After the data move: reads every record back through the app's own code (the same functions the screens use) and
 * reports anything that cannot be read. Changes nothing.
 *   npm run db:check-moved
 * Uses MONGODB_URI and MONGODB_DB (the app's login) and CONTACT_ENC_KEY.
 */
import './loadenv';
import { closeClient } from '../../src/server/mongo/client';
import { reader } from '../../src/server/mongo/tx';
import { loadParticipants } from '../../src/server/participants';
import { listStaff, staffHistory } from '../../src/server/staff';
import { listRoles } from '../../src/server/roles';
import { listInvites } from '../../src/server/invites';

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`);
};
const attempt = async <T,>(fn: () => Promise<T>): Promise<[T | null, string]> => {
  try {
    return [await fn(), ''];
  } catch (err) {
    return [null, (err as Error).message];
  }
};

const piView = { role: 'pi', isAdmin: true, delegations: [] as never[] };
const [participants, pErr] = await attempt(() => loadParticipants(reader, piView));
check('every participant loads, with all ten modules and decrypted contacts (PI view)', !!participants && participants.every((p) => Object.keys(p.meta).length === 10 && !p.contactsHidden), pErr || `${participants?.length} participants`);
const [hidden, hErr] = await attempt(() => loadParticipants(reader, { role: 'pk_scientist', isAdmin: false, delegations: [] }));
check('contact details stay hidden from a role that may not see them', !!hidden && hidden.every((p) => p.contactsHidden && p.data.m1.phone === '' && p.data.m1.address === ''), hErr);

const [staff, sErr] = await attempt(() => listStaff(reader));
check('every staff account loads', !!staff, sErr || `${staff?.length} accounts`);
let historyLines = 0;
const broken: string[] = [];
for (const s of staff ?? []) {
  const [h, err] = await attempt(() => staffHistory(reader, s.id));
  if (!h) broken.push(`${s.email}: ${err}`);
  else historyLines += h.length;
}
check('every staff history reads (old audit entries converted correctly)', broken.length === 0, broken.slice(0, 3).join('; ') || `${historyLines} lines`);

const [roles, rErr] = await attempt(() => listRoles(reader));
check('roles load, built-in ones first', !!roles && roles.slice(0, 5).every((r) => r.builtin), rErr || `${roles?.length} roles`);
const [invites, iErr] = await attempt(() => listInvites(reader));
check('open invitations load', !!invites, iErr || `${invites?.length} open`);

// Every account a module or participant points to should exist, or have been deleted on purpose (history only).
const userIds = new Set((staff ?? []).map((s) => s.id));
const mods = await reader.find<{ completed_by: string | null }>('crf_modules', { completed_by: { $ne: null } }, { projection: { completed_by: 1 } });
const missing = mods.filter((m) => m.completed_by && !userIds.has(m.completed_by)).length;
check('every locked module names an existing account', missing === 0, missing ? `${missing} name an account that no longer exists` : `${mods.length} locked modules`);

await closeClient();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
