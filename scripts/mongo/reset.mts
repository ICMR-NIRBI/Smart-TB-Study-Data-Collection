/*
 * LOCAL DEVELOPMENT ONLY. Empties the MongoDB database, recreates the collections and indexes, and loads the demo
 * accounts and demo participants. Refuses to run against anything that is not on this computer.
 *   node --import tsx scripts/mongo/reset.mts      (npm run db:reset)
 */
import './loadenv';
import { MongoClient } from 'mongodb';
import { closeClient } from '../../src/server/mongo/client';
import { ensureSchema } from '../../src/server/mongo/schema';
import { requireLocalDatabase, seedDev } from './seed';

requireLocalDatabase('db:reset');
const { MONGODB_OWNER_URI, MONGODB_DB } = process.env;
if (!MONGODB_OWNER_URI || !MONGODB_DB) {
  console.error('MONGODB_OWNER_URI and MONGODB_DB must be set.');
  process.exit(1);
}
if (!process.env.CONTACT_ENC_KEY) {
  console.error('CONTACT_ENC_KEY must be set (it is in .env.local).');
  process.exit(1);
}

const owner = new MongoClient(MONGODB_OWNER_URI);
await owner.connect();
try {
  const db = owner.db(MONGODB_DB);
  for (const c of await db.listCollections({}, { nameOnly: true }).toArray()) await db.collection(c.name).drop();
  await ensureSchema(db);
} finally {
  await owner.close();
}
const { accounts, participants } = await seedDev();
await closeClient();
console.log(`Database "${MONGODB_DB}" reset. Loaded ${accounts} accounts and ${participants} demo participants.`);
console.log('Sign in as demo@smarttb.study or test1..test4@smarttb.study with DEV_SEED_PASSWORD.');
