/**
 * One-time setup: creates the `smarttb` database, its owner role (runs migrations) and the restricted
 * `smarttb_app` role the web app connects as. Passwords come from the URLs in the env file.
 *
 * Works on a local PostgreSQL (superuser) and on a managed database such as E2E DBaaS, where the admin user
 * may lack some rights: if DATABASE_OWNER_URL uses the admin user itself, no separate owner role is created,
 * and if the database already exists (created from the provider's dashboard) it is reused.
 * Run: npm run db:setup
 */
import { connect, requireEnv } from './lib';

async function main() {
  const adminUrl = new URL(requireEnv('PG_ADMIN_URL'));
  const owner = new URL(requireEnv('DATABASE_OWNER_URL'));
  const app = new URL(requireEnv('DATABASE_URL'));
  const dbName = owner.pathname.slice(1);
  const adminUser = decodeURIComponent(adminUrl.username);
  const admin = await connect(adminUrl.toString());

  const ident = async (s: string) => (await admin.query<{ q: string }>('select quote_ident($1) as q', [s])).rows[0].q;
  const literal = async (s: string) => (await admin.query<{ q: string }>('select quote_literal($1) as q', [s])).rows[0].q;

  for (const u of [owner, app]) {
    const role = decodeURIComponent(u.username);
    if (role === adminUser) {
      console.log(`Using admin user ${role} as-is`);
      continue;
    }
    const exists = await admin.query('select 1 from pg_roles where rolname = $1', [role]);
    const verb = exists.rowCount ? 'alter' : 'create';
    try {
      await admin.query(`${verb} role ${await ident(role)} login password ${await literal(decodeURIComponent(u.password))}`);
      console.log(`${verb === 'create' ? 'Created' : 'Updated'} role ${role}`);
    } catch (err) {
      throw new Error(`Could not ${verb} role ${role}: ${(err as Error).message}. The admin user needs the CREATEROLE right.`);
    }
  }

  const db = await admin.query('select 1 from pg_database where datname = $1', [dbName]);
  if (!db.rowCount) {
    try {
      await admin.query(`create database ${await ident(dbName)} owner ${await ident(decodeURIComponent(owner.username))}`);
      console.log(`Created database ${dbName}`);
    } catch (err) {
      throw new Error(`Could not create database ${dbName}: ${(err as Error).message}. Create it from the provider dashboard, then re-run.`);
    }
  } else {
    console.log(`Database ${dbName} already exists`);
  }

  const appRole = await ident(decodeURIComponent(app.username));
  const quotedDb = await ident(dbName);
  await admin.query(`revoke all on database ${quotedDb} from public`).catch((err: Error) => console.warn(`Note: ${err.message}`));
  await admin.query(`grant connect on database ${quotedDb} to ${appRole}`);
  await admin.end();
  console.log('Setup complete. Next: npm run db:preflight, then npm run db:migrate (or db:reset on a local test database).');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
