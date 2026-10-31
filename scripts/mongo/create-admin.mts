/*
 * Creates the first study administrator on a fresh database (go-live) and prints a one-time setup link.
 * Everyone else is then invited from the Staff accounts page.
 *
 *   npm run db:create-admin -- --email pi@institute.org --name "Full Name" --role pi
 * Needs MONGODB_URI, MONGODB_DB and APP_BASE_URL (for example https://smarttb.example.in) in the environment.
 */
import './loadenv';
import { closeClient } from '../../src/server/mongo/client';
import { reader, withTransaction } from '../../src/server/mongo/tx';
import { issueSetupLink, newUserDoc } from '../../src/server/staff';
import { ROLE_KEYS, isRoleKey } from '../../src/data/roles';
import { EMAIL_RE } from '../../src/utils/accountRules';

function arg(name: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? (process.argv[i + 1] ?? '').trim() : '';
}

const email = arg('email').toLowerCase();
const name = arg('name');
const role = arg('role') || 'pi';
if (!EMAIL_RE.test(email) || name.length < 2 || !isRoleKey(role)) {
  console.error(`Usage: npm run db:create-admin -- --email <email> --name "<full name>" --role <${ROLE_KEYS.join('|')}>`);
  process.exit(1);
}
if (!process.env.APP_BASE_URL) {
  console.error('APP_BASE_URL is not set.');
  process.exit(1);
}
const baseUrl = process.env.APP_BASE_URL.replace(/\/+$/, '');

try {
  if (await reader.findOne('app_users', { email })) throw new Error(`An account for ${email} already exists.`);
  const link = await withTransaction({ reason: 'First study administrator' }, async (tx) => {
    const user = newUserDoc({ email, name, role, isAdmin: true });
    await tx.insertOne('app_users', user);
    return issueSetupLink(tx, user._id, null);
  });
  console.log(`Created administrator ${name} <${email}>.`);
  console.log(`Send this one-time setup link privately (expires ${link.expiresAt}):`);
  console.log(`${baseUrl}/setup?token=${encodeURIComponent(link.token)}`);
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  await closeClient();
}
