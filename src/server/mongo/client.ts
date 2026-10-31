import { MongoClient, MongoServerError, type Db } from 'mongodb';

/** One connection pool for the whole app, kept on `globalThis` so development reloads do not open a new one each time. */
const g = globalThis as unknown as { __smarttbMongo?: MongoClient };

export function getClient(): MongoClient {
  if (!g.__smarttbMongo) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI is not set');
    g.__smarttbMongo = new MongoClient(uri, { maxPoolSize: 10, retryWrites: true, writeConcern: { w: 'majority' } });
  }
  return g.__smarttbMongo;
}

export function getDb(): Db {
  const name = process.env.MONGODB_DB;
  if (!name) throw new Error('MONGODB_DB is not set');
  return getClient().db(name);
}

/** The error code MongoDB gives for a second document with the same unique value (the old PostgreSQL 23505). */
export function isDuplicateKey(err: unknown): boolean {
  return err instanceof MongoServerError && err.code === 11000;
}

/** Closes the pool (scripts and tests; the running app never needs to). */
export async function closeClient(): Promise<void> {
  if (g.__smarttbMongo) {
    await g.__smarttbMongo.close();
    g.__smarttbMongo = undefined;
  }
}
