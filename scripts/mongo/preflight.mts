/*
 * Checks that a MongoDB database can run SMART-TB before real data goes in. Changes nothing: it only reads, or tries
 * things the app's login must be refused (those refusals are what is being checked).
 *   npm run db:preflight
 * Needs MONGODB_URI, MONGODB_OWNER_URI, MONGODB_DB and CONTACT_ENC_KEY in the environment.
 */
import './loadenv';
import { MongoClient, ObjectId } from 'mongodb';
import { decryptContact, encryptContact } from '../../src/server/contactCrypto';
import { closeClient } from '../../src/server/mongo/client';
import { ALL_COLLECTIONS, AUDIT_COLLECTION, SPECS } from '../../src/server/mongo/schema';
import { withTransaction } from '../../src/server/mongo/tx';

type Result = { check: string; ok: boolean; detail: string };
const results: Result[] = [];
const add = (check: string, ok: boolean, detail: string) => results.push({ check, ok, detail });

function report(): never {
  const width = Math.max(...results.map((r) => r.check.length));
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.check.padEnd(width)}  ${r.detail}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed ? `\n${failed} check(s) failed — do not go live yet.` : '\nAll checks passed — safe to run db:create-admin and go live.');
  process.exit(failed ? 1 : 0);
}

/** The error code MongoDB gives for "not allowed", or null if the operation was allowed. */
async function refusal(fn: () => Promise<unknown>): Promise<number | string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    const err = e as { code?: number; codeName?: string; message?: string };
    return err.code ?? err.codeName ?? err.message ?? 'error';
  }
}
const UNAUTHORIZED = 13;

const { MONGODB_URI, MONGODB_OWNER_URI, MONGODB_DB, CONTACT_ENC_KEY } = process.env;
if (!MONGODB_URI || !MONGODB_OWNER_URI || !MONGODB_DB) {
  console.error('MONGODB_URI, MONGODB_OWNER_URI and MONGODB_DB must be set.');
  process.exit(1);
}

const host = (uri: string) => new URL(uri.replace(/^mongodb:\/\/[^@]*@/, 'mongodb://')).host;
const owner = new MongoClient(MONGODB_OWNER_URI, { serverSelectionTimeoutMS: 10000 });
try {
  await owner.connect();
  await owner.db(MONGODB_DB).command({ ping: 1 });
  add('Connect as owner', true, host(MONGODB_OWNER_URI));
} catch (err) {
  add('Connect as owner', false, (err as Error).message);
  report();
}
const ownerDb = owner.db(MONGODB_DB);

const version: string = (await ownerDb.admin().command({ buildInfo: 1 })).version;
add('MongoDB 7.0 or newer', parseInt(version, 10) >= 7, version);

const hello = await ownerDb.admin().command({ hello: 1 });
add('Replica set with a primary (needed for transactions)', !!hello.setName && hello.isWritablePrimary === true, `${hello.setName ?? 'no replica set'}, primary: ${hello.isWritablePrimary}`);

const anonymous = new MongoClient(MONGODB_URI.replace(/^mongodb:\/\/[^@]*@/, 'mongodb://'), { serverSelectionTimeoutMS: 8000 });
await anonymous.connect().catch(() => {});
const anonymousRead = await refusal(() => anonymous.db(MONGODB_DB).collection('app_users').findOne({}));
await anonymous.close().catch(() => {});
add('Login is required (an anonymous connection can read nothing)', anonymousRead === UNAUTHORIZED, anonymousRead === null ? 'anonymous read WORKED — authentication is off' : String(anonymousRead));

const have = new Map<string, Set<string>>();
for (const c of await ownerDb.listCollections({}, { nameOnly: true }).toArray()) have.set(c.name, new Set((await ownerDb.collection(c.name).listIndexes().toArray()).map((i) => String(i.name))));
const missingCollections = ALL_COLLECTIONS.filter((n) => !have.has(n));
add('All collections exist', missingCollections.length === 0, missingCollections.length ? `missing: ${missingCollections.join(', ')} — run npm run db:migrate` : `${ALL_COLLECTIONS.length} collections`);
const missingIndexes = SPECS.flatMap((s) => (s.indexes ?? []).filter((i) => !have.get(s.name)?.has(String(i.options?.name))).map((i) => `${s.name}.${i.options?.name}`));
add('All indexes exist (unique emails, one pending request per email, participant ids)', missingIndexes.length === 0, missingIndexes.length ? `missing: ${missingIndexes.join(', ')} — run npm run db:migrate` : 'ok');

// The app's own login.
try {
  const app = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  await app.connect();
  await app.db(MONGODB_DB).command({ ping: 1 });
  add('Connect as the app', true, host(MONGODB_URI));

  const appDb = app.db(MONGODB_DB);
  add('App cannot change an audit entry', (await refusal(() => appDb.collection(AUDIT_COLLECTION).updateOne({ _id: new ObjectId() }, { $set: { x: 1 } }))) === UNAUTHORIZED, 'append-only');
  add('App cannot delete audit entries', (await refusal(() => appDb.collection(AUDIT_COLLECTION).deleteMany({}))) === UNAUTHORIZED, 'append-only');
  add('App cannot change or delete edit reasons', (await refusal(() => appDb.collection('module_edit_reasons').deleteMany({}))) === UNAUTHORIZED, 'append-only');
  add('App cannot delete participants or their modules', (await refusal(() => appDb.collection('participants').deleteMany({}))) === UNAUTHORIZED && (await refusal(() => appDb.collection('crf_modules').deleteMany({}))) === UNAUTHORIZED, 'no delete rights');
  add('App cannot create collections or indexes', (await refusal(() => appDb.createCollection('preflight_scratch'))) === UNAUTHORIZED && (await refusal(() => appDb.collection('app_users').createIndex({ nope: 1 }))) === UNAUTHORIZED, 'schema is set up by the owner only');
  add('App cannot read other databases', (await refusal(() => app.db('admin').collection('system.users').findOne({}))) === UNAUTHORIZED, 'limited to its own database');
  await app.close();
} catch (err) {
  add('Connect as the app', false, (err as Error).message);
}

// Transactions as the app: a change and its audit entry together, rolled back so nothing is kept.
try {
  await withTransaction({ userId: null, reason: 'preflight' }, async (tx) => {
    await tx.lock('preflight');
    await tx.record('preflight', 'preflight', 'PREFLIGHT');
    throw new Error('rollback on purpose');
  });
  add('Transactions work (change plus audit entry, all or nothing)', false, 'the rollback did not happen');
} catch (err) {
  const rolledBack = (err as Error).message === 'rollback on purpose' && (await ownerDb.collection(AUDIT_COLLECTION).countDocuments({ table_name: 'preflight' })) === 0;
  add('Transactions work (change plus audit entry, all or nothing)', rolledBack, rolledBack ? 'rolled back, nothing kept' : (err as Error).message);
}
await closeClient();

// Contact details.
try {
  if (!CONTACT_ENC_KEY || CONTACT_ENC_KEY.length < 32) throw new Error('CONTACT_ENC_KEY is missing or shorter than 32 characters');
  const ok = decryptContact(encryptContact('9876543210', 'p_check', 'phone'), 'p_check', 'phone') === '9876543210' && (await refusal(async () => decryptContact(encryptContact('x', 'p_a', 'phone'), 'p_b', 'phone'))) !== null;
  add('Contact details encrypt, decrypt, and cannot be moved to another record', ok, ok ? 'ok' : 'round trip failed');
} catch (err) {
  add('Contact details encrypt and decrypt', false, (err as Error).message);
}

await owner.close();
report();
