/*
 * Checks the MongoDB set-up: what each login may and may not do, transactions, and a backup and restore round trip.
 *   node --import tsx scripts/mongo/check-infra.mts
 * Needs MONGODB_URI, MONGODB_OWNER_URI, MONGODB_DB and MONGO_ADMIN_URI. The round trip uses two scratch databases
 * that are removed afterwards; the app's own database is only read for the permission checks, and the test
 * documents it adds are removed again by the owner login (the app login cannot remove audit entries).
 */
import './loadenv';
import { Binary, Decimal128, MongoClient, ObjectId } from 'mongodb';
import { Readable, Writable } from 'node:stream';
import { AUDIT_COLLECTION } from '../../src/server/mongo/schema';
import { dumpDatabase, loadDatabase } from './dump';

const { MONGODB_URI, MONGODB_OWNER_URI, MONGODB_DB, MONGO_ADMIN_URI } = process.env;
if (!MONGODB_URI || !MONGODB_OWNER_URI || !MONGODB_DB || !MONGO_ADMIN_URI) throw new Error('Missing MONGODB_URI, MONGODB_OWNER_URI, MONGODB_DB or MONGO_ADMIN_URI');

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${extra}`}`);
};
/** The error code of a refused operation, or null if it was allowed. */
const refused = async (fn: () => Promise<unknown>): Promise<number | string | null> => {
  try {
    await fn();
    return null;
  } catch (e) {
    const err = e as { code?: number; codeName?: string; message?: string };
    return err.code ?? err.codeName ?? err.message ?? 'error';
  }
};
const UNAUTHORIZED = 13;

const tag = `chk${Date.now() % 100000}`;
const app = new MongoClient(MONGODB_URI);
const owner = new MongoClient(MONGODB_OWNER_URI);
const admin = new MongoClient(MONGO_ADMIN_URI);
await Promise.all([app.connect(), owner.connect(), admin.connect()]);
const appDb = app.db(MONGODB_DB);
const ownerDb = owner.db(MONGODB_DB);

// --- what the app login may do
const noLogin = new MongoClient(MONGODB_URI.replace(/\/\/[^@]+@/, '//'), { serverSelectionTimeoutMS: 8000 });
await noLogin.connect().catch(() => {});
check('a connection without a login cannot read anything', (await refused(() => noLogin.db(MONGODB_DB).collection('users').findOne())) === UNAUTHORIZED);
await noLogin.close().catch(() => {});

const users = appDb.collection('app_users');
const doc = await users.insertOne({ email: `${tag}@test.org`, tag });
check('the app login can add to a working collection', !!doc.insertedId);
check('and read it', (await users.findOne({ tag }))?.email === `${tag}@test.org`);
check('and change it', (await users.updateOne({ tag }, { $set: { x: 1 } })).modifiedCount === 1);
check('and remove it', (await users.deleteOne({ tag })).deletedCount === 1);

const audit = appDb.collection(AUDIT_COLLECTION);
const entry = await audit.insertOne({ tag, action: 'TEST' });
check('the app login can add an audit entry', !!entry.insertedId);
check('and read it', (await audit.findOne({ tag })) !== null);
check('but cannot change an audit entry', (await refused(() => audit.updateOne({ tag }, { $set: { action: 'EDITED' } }))) === UNAUTHORIZED);
check('and cannot delete one', (await refused(() => audit.deleteOne({ tag }))) === UNAUTHORIZED);
check('and cannot delete them all', (await refused(() => audit.deleteMany({}))) === UNAUTHORIZED);
check('and cannot drop the audit collection', (await refused(() => audit.drop())) === UNAUTHORIZED);
check('the entry is still there, unchanged', (await audit.findOne({ tag }))?.action === 'TEST');

check('the app login cannot create a new collection', (await refused(() => appDb.createCollection(`${tag}_new`))) === UNAUTHORIZED);
check('or add an index', (await refused(() => users.createIndex({ nope: 1 }))) === UNAUTHORIZED);
check('or drop a working collection', (await refused(() => users.drop())) === UNAUTHORIZED);
check('or read another database', (await refused(() => app.db('admin').collection('system.users').findOne())) === UNAUTHORIZED);
check('or make users', (await refused(() => app.db('admin').command({ createUser: 'x', pwd: 'y', roles: [] }))) === UNAUTHORIZED);

// --- the other append-only and no-delete rules carried over from PostgreSQL
const reasons = appDb.collection('module_edit_reasons');
await reasons.insertOne({ tag, reason: 'test' });
check('the app login can add an edit reason', (await reasons.countDocuments({ tag })) === 1);
check('but cannot change an edit reason', (await refused(() => reasons.updateOne({ tag }, { $set: { reason: 'x' } }))) === UNAUTHORIZED);
check('or delete one', (await refused(() => reasons.deleteOne({ tag }))) === UNAUTHORIZED);
const parts = appDb.collection('participants');
await parts.insertOne({ _id: `${tag}-p` as never, tag });
check('the app login can add and change a participant', (await parts.updateOne({ tag }, { $set: { x: 1 } })).modifiedCount === 1);
check('but cannot delete a participant', (await refused(() => parts.deleteOne({ tag }))) === UNAUTHORIZED);
check('or delete study data in the CRF modules', (await refused(() => appDb.collection('crf_modules').deleteMany({}))) === UNAUTHORIZED);

// --- transactions under the app login: a change and its audit entry together, or neither
const s1 = app.startSession();
await s1.withTransaction(async () => {
  await users.insertOne({ tag: `${tag}-t1` }, { session: s1 });
  await audit.insertOne({ tag: `${tag}-t1`, action: 'TX' }, { session: s1 });
});
await s1.endSession();
check('a change and its audit entry commit together', (await users.countDocuments({ tag: `${tag}-t1` })) === 1 && (await audit.countDocuments({ tag: `${tag}-t1` })) === 1);
const s2 = app.startSession();
await refused(() =>
  s2.withTransaction(async () => {
    await users.insertOne({ tag: `${tag}-t2` }, { session: s2 });
    await audit.insertOne({ tag: `${tag}-t2`, action: 'TX' }, { session: s2 });
    throw new Error('stop');
  }),
);
await s2.endSession();
check('a failed change leaves neither behind', (await users.countDocuments({ tag: `${tag}-t2` })) === 0 && (await audit.countDocuments({ tag: `${tag}-t2` })) === 0);

// --- owner login
check('the owner login can add an index', (await refused(() => ownerDb.collection('app_users').createIndex({ tag: 1 }, { name: `${tag}_idx` }))) === null);
await ownerDb.collection('app_users').dropIndex(`${tag}_idx`).catch(() => {});
check('the owner login cannot reach another database', (await refused(() => owner.db('admin').collection('system.users').findOne())) === UNAUTHORIZED);

// --- backup and restore round trip (two scratch databases, root login)
const a = admin.db(`smarttb_${tag}_a`);
const b = admin.db(`smarttb_${tag}_b`);
const when = new Date('2026-10-30T09:15:00Z');
const id = new ObjectId();
await a.collection('users').createIndex({ email: 1 }, { unique: true, collation: { locale: 'en', strength: 2 }, name: 'email_ci' });
await a.collection('accessRequests').createIndex({ email: 1 }, { unique: true, partialFilterExpression: { status: 'pending' }, name: 'one_pending' });
await a.collection('users').insertMany([
  { _id: id, email: 'A@x.org', createdAt: when, big: Decimal128.fromString('12.50'), blob: new Binary(Buffer.from([0, 1, 2, 255])), nested: { list: [1, 'two', { three: 3 }], none: null } },
  { email: 'b@x.org', createdAt: when },
]);
await a.collection('accessRequests').insertOne({ email: 'p@x.org', status: 'pending' });
await a.collection('empty').insertOne({}).then(() => a.collection('empty').deleteMany({}));
for (let i = 0; i < 1200; i++) await a.collection('auditLog').insertOne({ n: i, text: 'x'.repeat(50) });

const chunks: Buffer[] = [];
const total = await dumpDatabase(a, new Writable({ write(c, _e, cb) { chunks.push(Buffer.from(c)); cb(); } }));
const file = Buffer.concat(chunks);
check('the backup counts every document', total === 1203, String(total));
check('the backup is compressed', file.length < 1203 * 60, String(file.length));
const counts = await loadDatabase(b, Readable.from([file]));
check('the restore loads every document', counts.users === 2 && counts.accessRequests === 1 && counts.auditLog === 1200 && counts.empty === 0, JSON.stringify(counts));
const back = await b.collection('users').findOne({ _id: id });
check('values come back exactly (id, date, decimal, binary, nesting)',
  !!back && back._id.equals(id) && back.createdAt.getTime() === when.getTime() && back.big.toString() === '12.50' && Buffer.from(back.blob.buffer).equals(Buffer.from([0, 1, 2, 255])) && JSON.stringify(back.nested) === '{"list":[1,"two",{"three":3}],"none":null}',
  JSON.stringify(back));
const idx = await b.collection('users').listIndexes().toArray();
check('the unique case-insensitive email index comes back', idx.some((i) => i.name === 'email_ci' && i.unique && i.collation?.strength === 2));
check('and the one-pending-per-email index', (await b.collection('accessRequests').listIndexes().toArray()).some((i) => i.name === 'one_pending' && i.partialFilterExpression?.status === 'pending'));
check('the restored index still refuses a duplicate email', (await refused(() => b.collection('users').insertOne({ email: 'a@X.ORG' }))) === 11000);
check('loading into a database that has data is refused', (await refused(() => loadDatabase(b, Readable.from([file])))) !== null);
const again = await loadDatabase(b, Readable.from([file]), { replace: true });
check('with the replace option it overwrites', again.users === 2 && (await b.collection('users').countDocuments()) === 2);
check('something that is not a backup is refused', (await refused(() => loadDatabase(admin.db(`smarttb_${tag}_c`), Readable.from([Buffer.from('not a backup')])))) !== null);

// --- tidy up
await admin.db(`smarttb_${tag}_a`).dropDatabase();
await admin.db(`smarttb_${tag}_b`).dropDatabase();
await admin.db(`smarttb_${tag}_c`).dropDatabase();
await ownerDb.collection('app_users').deleteMany({ tag: { $regex: `^${tag}` } });
await ownerDb.collection(AUDIT_COLLECTION).deleteMany({ tag: { $regex: `^${tag}` } });
await ownerDb.collection('module_edit_reasons').deleteMany({ tag });
await ownerDb.collection('participants').deleteMany({ tag });
await Promise.all([app.close(), owner.close(), admin.close()]);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
