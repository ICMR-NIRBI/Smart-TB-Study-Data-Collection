/**
 * LOCAL DEVELOPMENT ONLY. Wipes the database, re-applies migrations and loads the demo/test accounts and
 * demo participants. Refuses to run against anything other than localhost.
 * Run: npm run db:reset
 */
import { hashPassword } from '../../src/server/passwords';
import { insertParticipant } from '../../src/server/participants';
import { seedParticipants } from '../../src/data/participants';
import { STAFF } from '../../src/data/staff';
import type { RoleKey } from '../../src/data/roles';
import { connect, isLocalUrl, migrate, requireEnv } from './lib';

const ACCOUNTS: { key: keyof typeof STAFF; email: string; role: RoleKey; isAdmin: boolean }[] = [
  { key: 'demo', email: 'demo@smarttb.study', role: 'pi', isAdmin: true },
  { key: 'test1', email: 'test1@smarttb.study', role: 'research_officer', isAdmin: false },
  { key: 'test2', email: 'test2@smarttb.study', role: 'phlebotomist', isAdmin: false },
  { key: 'test3', email: 'test3@smarttb.study', role: 'pk_scientist', isAdmin: false },
  { key: 'test4', email: 'test4@smarttb.study', role: 'data_manager', isAdmin: true },
];

async function main() {
  const url = requireEnv('DATABASE_OWNER_URL');
  if (!isLocalUrl(url) || process.env.NODE_ENV === 'production') {
    console.error('db:reset only runs against a local database.');
    process.exit(1);
  }
  const password = requireEnv('DEV_SEED_PASSWORD');
  requireEnv('CONTACT_ENC_KEY');

  const client = await connect(url);
  await client.query('drop schema public cascade');
  await client.query('create schema public');
  await client.query('grant usage on schema public to smarttb_app');
  const applied = await migrate(client);
  console.log(`Applied: ${applied.join(', ')}`);

  await client.query('begin');
  await client.query("select set_config('app.reason', 'Local demo data', true)");
  const ids: Record<string, string> = {};
  for (const a of ACCOUNTS) {
    const { rows } = await client.query<{ id: string }>(
      'insert into app_users (email, display_name, role, is_admin, password_hash) values ($1, $2, $3, $4, $5) returning id',
      [a.email, STAFF[a.key].name, a.role, a.isAdmin, await hashPassword(password)],
    );
    ids[STAFF[a.key].name] = rows[0].id;
  }
  for (const p of seedParticipants) await insertParticipant(client, p, ids, ids[STAFF.test1.name]);
  await client.query('commit');
  await client.end();

  console.log(`Loaded ${ACCOUNTS.length} accounts and ${seedParticipants.length} demo participants.`);
  console.log(`Sign in as ${ACCOUNTS.map((a) => a.email).join(', ')} with DEV_SEED_PASSWORD from .env.local.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
