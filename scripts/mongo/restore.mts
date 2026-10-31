/*
 * Restores a backup read from standard input (the decrypted gzip stream):
 *   openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in file.dump.enc | node --import tsx scripts/mongo/restore.mts [--into other_db] [--replace]
 * Uses MONGODB_OWNER_URI. Restoring into another database (a test restore) needs the administrator login: add --admin.
 * Writes into MONGODB_DB (or --into). Refuses to touch a collection that already has documents unless --replace is given.
 */
import './loadenv';
import { MongoClient } from 'mongodb';
import { loadDatabase } from './dump';

const args = process.argv.slice(2);
const intoAt = args.indexOf('--into');
const uri = args.includes('--admin') ? process.env.MONGO_ADMIN_URI : (process.env.RESTORE_URI ?? process.env.MONGODB_OWNER_URI);
const dbName = intoAt >= 0 ? args[intoAt + 1] : process.env.MONGODB_DB;
if (!uri || !dbName) {
  console.error('MONGODB_OWNER_URI must be set, and MONGODB_DB or --into must name the database.');
  process.exit(1);
}
if (process.stdin.isTTY) {
  console.error('Pipe the decrypted backup into this command.');
  process.exit(1);
}

const client = new MongoClient(uri);
await client.connect();
try {
  const counts = await loadDatabase(client.db(dbName), process.stdin, { replace: args.includes('--replace') });
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.error(`Restored ${total} documents into "${dbName}": ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}`);
} finally {
  await client.close();
}
