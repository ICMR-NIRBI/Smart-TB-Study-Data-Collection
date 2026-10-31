/*
 * Prints how many documents each collection holds: a quick look at the database without a MongoDB shell.
 *   npm run db:counts                                     the live database
 *   npm run db:counts -- --admin --db restore_test        another database on the same server (administrator login)
 */
import './loadenv';
import { MongoClient } from 'mongodb';

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i > -1 ? args[i + 1] : undefined;
};
const admin = args.includes('--admin');
const uri = admin ? process.env.MONGO_ADMIN_URI : process.env.MONGODB_OWNER_URI;
const dbName = flag('db') ?? process.env.MONGODB_DB;
if (!uri || !dbName) {
  console.error(`${admin ? 'MONGO_ADMIN_URI' : 'MONGODB_OWNER_URI'} and a database name (MONGODB_DB or --db) are required.`);
  process.exit(1);
}

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
await client.connect();
try {
  const db = client.db(dbName);
  const names = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name).sort();
  if (!names.length) console.log(`Database "${dbName}" has no collections.`);
  const width = Math.max(0, ...names.map((n) => n.length));
  for (const name of names) console.log(`${name.padEnd(width)}  ${await db.collection(name).countDocuments()}`);
} finally {
  await client.close();
}
