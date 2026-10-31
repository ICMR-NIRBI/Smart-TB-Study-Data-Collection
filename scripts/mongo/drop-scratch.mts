/*
 * Removes a scratch database made while testing a backup. It will only remove a database whose name starts with
 * "restore_", so it can never touch the live one.
 *   npm run db:drop-scratch -- restore_test
 */
import './loadenv';
import { MongoClient } from 'mongodb';

const name = process.argv[2] ?? '';
if (!/^restore_[A-Za-z0-9_]+$/.test(name)) {
  console.error('Give the name of a scratch database; it must start with "restore_" (for example restore_test).');
  process.exit(1);
}
if (!process.env.MONGO_ADMIN_URI) {
  console.error('MONGO_ADMIN_URI is not set.');
  process.exit(1);
}
const client = new MongoClient(process.env.MONGO_ADMIN_URI, { serverSelectionTimeoutMS: 10000 });
await client.connect();
try {
  await client.db(name).dropDatabase();
  console.log(`Scratch database "${name}" removed.`);
} finally {
  await client.close();
}
