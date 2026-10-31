import { randomUUID } from 'node:crypto';
import { insertParticipant } from '../../src/server/participants';
import { reader, withTransaction } from '../../src/server/mongo/tx';
import { hashPassword } from '../../src/server/passwords';
import { seedParticipants } from '../../src/data/participants';
import { STAFF } from '../../src/data/staff';

const ACCOUNTS: { key: keyof typeof STAFF; email: string; role: string; isAdmin: boolean }[] = [
  { key: 'demo', email: 'demo@smarttb.study', role: 'pi', isAdmin: true },
  { key: 'test1', email: 'test1@smarttb.study', role: 'research_officer', isAdmin: false },
  { key: 'test2', email: 'test2@smarttb.study', role: 'phlebotomist', isAdmin: false },
  { key: 'test3', email: 'test3@smarttb.study', role: 'pk_scientist', isAdmin: false },
  { key: 'test4', email: 'test4@smarttb.study', role: 'data_manager', isAdmin: true },
];

/** Only ever for a database on this computer. Exits the process otherwise. */
export function requireLocalDatabase(what: string): void {
  const uri = process.env.MONGODB_URI ?? '';
  if (!/@(127\.0\.0\.1|localhost)[:/]/.test(uri) || process.env.NODE_ENV === 'production') {
    console.error(`${what} only runs against a database on this computer.`);
    process.exit(1);
  }
}

/** Adds the five demo/test accounts that are missing, and the demo participants if there are none. */
export async function seedDev(): Promise<{ accounts: number; participants: number }> {
  const password = process.env.DEV_SEED_PASSWORD;
  if (!password) {
    console.error('DEV_SEED_PASSWORD is not set (it is in .env.local).');
    process.exit(1);
  }
  let accounts = 0;
  for (const a of ACCOUNTS) {
    if (await reader.findOne('app_users', { email: a.email })) continue;
    const hash = await hashPassword(password);
    await withTransaction({ reason: 'Local demo data' }, (tx) => {
      const now = new Date();
      return tx.insertOne('app_users', {
        _id: randomUUID(),
        email: a.email,
        display_name: STAFF[a.key].name,
        role: a.role,
        is_admin: a.isAdmin,
        password_hash: hash,
        external_uid: null,
        active: true,
        must_change_password: false,
        last_sign_in_at: null,
        created_at: now,
        updated_at: now,
        updated_by: null,
      });
    });
    accounts++;
  }

  let participants = 0;
  if ((await reader.count('participants')) === 0) {
    const people = await reader.find<{ _id: string; display_name: string }>('app_users', { email: { $in: ACCOUNTS.map((a) => a.email) } });
    const ids = Object.fromEntries(people.map((u) => [u.display_name, u._id]));
    await withTransaction({ reason: 'Local demo data' }, async (tx) => {
      for (const p of seedParticipants) await insertParticipant(tx, p, ids, ids[STAFF.test1.name] ?? null);
    });
    participants = seedParticipants.length;
  }
  return { accounts, participants };
}
