/*
 * Gives an existing account a temporary password. The person must choose their own at the first sign-in.
 * Their unused setup link is cancelled and they are signed out everywhere.
 *
 *   npm run db:set-temp-password -- --email someone@institute.org --password "Starting-pass-1"
 * Needs MONGODB_URI and MONGODB_DB in the environment.
 */
import './loadenv';
import { closeClient } from '../../src/server/mongo/client';
import { reader, withTransaction } from '../../src/server/mongo/tx';
import { applyTemporaryPassword } from '../../src/server/staff';

function arg(name: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? (process.argv[i + 1] ?? '') : '';
}

const email = arg('email').trim().toLowerCase();
const password = arg('password');
if (!email || !password) {
  console.error('Usage: npm run db:set-temp-password -- --email <email> --password "<temporary password>"');
  process.exit(1);
}
try {
  const user = await reader.findOne<{ _id: string }>('app_users', { email }, { projection: { _id: 1 } });
  if (!user) throw new Error(`No account for ${email}`);
  await withTransaction({ reason: 'Temporary password set from the server' }, (tx) => applyTemporaryPassword(tx, user._id, password, null));
  console.log(`Temporary password set for ${email}. They must choose a new password when they first sign in.`);
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  await closeClient();
}
