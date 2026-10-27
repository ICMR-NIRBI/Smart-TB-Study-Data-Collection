/**
 * Gives an existing account a temporary password. The person must choose their own at the first sign-in.
 * Their unused setup link is cancelled and they are signed out everywhere.
 *
 * Run: npm run db:set-temp-password -- --email someone@institute.org --password "Starting-pass-1"
 * Needs DATABASE_URL in the environment.
 */
import { applyTemporaryPassword } from '../../src/server/staff';
import { connect, requireEnv } from './lib';

function arg(name: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? (process.argv[i + 1] ?? '') : '';
}

async function main() {
  const email = arg('email').trim().toLowerCase();
  const password = arg('password');
  if (!email || !password) {
    console.error('Usage: npm run db:set-temp-password -- --email <email> --password "<temporary password>"');
    process.exit(1);
  }
  const client = await connect(requireEnv('DATABASE_URL'));
  try {
    await client.query('begin');
    await client.query("select set_config('app.reason', 'Temporary password set from the server', true)");
    const { rows } = await client.query<{ id: string }>('select id from app_users where email = $1', [email]);
    if (!rows[0]) throw new Error(`No account for ${email}`);
    await applyTemporaryPassword(client, rows[0].id, password, null);
    await client.query('commit');
    console.log(`Temporary password set for ${email}. They must choose a new password when they first sign in.`);
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
