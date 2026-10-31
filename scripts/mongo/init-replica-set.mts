/*
 * Turns a freshly installed MongoDB into a single-node replica set (needed for transactions). Safe to run again: if
 * it is already one, it says so. Run once, with login still switched OFF, before db:bootstrap.
 *   npm run db:init-replica-set -- --port 27017
 */
import { MongoClient } from 'mongodb';

const i = process.argv.indexOf('--port');
const port = i > -1 ? (process.argv[i + 1] ?? '27017') : '27017';
const host = `127.0.0.1:${port}`;

const client = new MongoClient(`mongodb://${host}/?directConnection=true`, { serverSelectionTimeoutMS: 20000 });
await client.connect();
try {
  const admin = client.db('admin');
  try {
    await admin.command({ replSetInitiate: { _id: 'rs0', members: [{ _id: 0, host }] } });
    console.log('Replica set rs0 created.');
  } catch (err) {
    const e = err as { codeName?: string; message?: string };
    if (e.codeName === 'Unauthorized') {
      // Login is already on, so this server was set up before; nothing for this script to do.
      console.log('Login is already switched on for this MongoDB, so the replica set was set up earlier. Nothing to do.');
      process.exit(0);
    }
    if (e.codeName !== 'AlreadyInitialized') throw err;
    console.log('Replica set rs0 already exists.');
  }
  for (let attempt = 0; attempt < 20; attempt++) {
    if ((await admin.command({ hello: 1 })).isWritablePrimary) {
      console.log('The node is primary and ready.');
      process.exit(0);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.error('The node did not become primary within 20 seconds.');
  process.exit(1);
} finally {
  await client.close();
}
