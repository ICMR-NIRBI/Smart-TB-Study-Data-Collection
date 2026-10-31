/*
 * Creates or updates the collections, indexes and lock documents in MONGODB_DB. Safe to run again; run it after
 * changing src/server/mongo/schema.ts. Uses the owner login.
 *   node --import tsx scripts/mongo/migrate.mts
 */
import './loadenv';
import { MongoClient } from 'mongodb';
import { ALL_COLLECTIONS, ensureSchema } from '../../src/server/mongo/schema';

const { MONGODB_OWNER_URI, MONGODB_DB } = process.env;
if (!MONGODB_OWNER_URI || !MONGODB_DB) {
  console.error('MONGODB_OWNER_URI and MONGODB_DB must be set.');
  process.exit(1);
}
const client = new MongoClient(MONGODB_OWNER_URI);
await client.connect();
try {
  await ensureSchema(client.db(MONGODB_DB));
  console.log(`Schema is up to date in "${MONGODB_DB}" (${ALL_COLLECTIONS.length} collections).`);
} finally {
  await client.close();
}
