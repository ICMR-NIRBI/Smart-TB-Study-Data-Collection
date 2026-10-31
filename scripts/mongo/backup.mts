/*
 * Writes a backup of the database to standard output (gzip). Encrypt it in the same pipe, as deploy/backup.sh does:
 *   node --import tsx scripts/mongo/backup.mts | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -out file.dump.enc
 * Uses MONGODB_OWNER_URI and MONGODB_DB. Messages go to standard error so they never mix with the backup bytes.
 */
import './loadenv';
import { MongoClient } from 'mongodb';
import { dumpDatabase } from './dump';

const uri = process.env.MONGODB_OWNER_URI;
const dbName = process.env.MONGODB_DB;
if (!uri || !dbName) {
  console.error('MONGODB_OWNER_URI and MONGODB_DB must be set.');
  process.exit(1);
}
if (process.stdout.isTTY) {
  console.error('Refusing to write a backup to the screen. Pipe it into openssl or a file.');
  process.exit(1);
}

const client = new MongoClient(uri);
await client.connect();
try {
  const total = await dumpDatabase(client.db(dbName), process.stdout);
  console.error(`Backed up ${total} documents from "${dbName}".`);
} finally {
  await client.close();
}
