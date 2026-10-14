/**
 * Creates the first study administrator on a fresh database (go-live) and prints a one-time setup link.
 * Everyone else is then invited from the Staff accounts page.
 *
 * Run: npm run db:create-admin -- --email pi@institute.org --name "Full Name" --role pi
 * Needs DATABASE_URL and APP_BASE_URL (e.g. https://smarttb.example.in) in the environment.
 */
import { issueSetupLink } from '../../src/server/staff';
import { ROLE_KEYS, isRoleKey } from '../../src/data/roles';
import { EMAIL_RE } from '../../src/utils/accountRules';
import { connect, requireEnv } from './lib';

function arg(name: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? (process.argv[i + 1] ?? '').trim() : '';
}

async function main() {
  const email = arg('email').toLowerCase();
  const name = arg('name');
  const role = arg('role') || 'pi';
  if (!EMAIL_RE.test(email) || name.length < 2 || !isRoleKey(role)) {
    console.error(`Usage: npm run db:create-admin -- --email <email> --name "<full name>" --role <${ROLE_KEYS.join('|')}>`);
    process.exit(1);
  }
  const baseUrl = requireEnv('APP_BASE_URL').replace(/\/+$/, '');

  const client = await connect(requireEnv('DATABASE_URL'));
  await client.query('begin');
  await client.query("select set_config('app.reason', 'First study administrator', true)");
  const { rows } = await client.query<{ id: string }>(
    'insert into app_users (email, display_name, role, is_admin) values ($1, $2, $3, true) returning id',
    [email, name, role],
  );
  const link = await issueSetupLink(client, rows[0].id, null);
  await client.query('commit');
  await client.end();

  console.log(`Created administrator ${name} <${email}>.`);
  console.log(`Send this one-time setup link privately (expires ${link.expiresAt}):`);
  console.log(`${baseUrl}/setup?token=${encodeURIComponent(link.token)}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
