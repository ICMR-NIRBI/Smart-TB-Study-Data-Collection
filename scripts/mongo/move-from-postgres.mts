/*
 * One-time move of the study data from PostgreSQL into MongoDB (the cut-over). Reads PostgreSQL in one consistent,
 * read-only snapshot and changes nothing there.
 *
 *   npm run db:move -- --dry-run           read, convert and check everything; write nothing
 *   npm run db:move                        write into the (empty) MongoDB database, then read it all back and compare
 *   npm run db:move -- --wipe-target       first empty the MongoDB database (rehearsals only; refuses the name "smarttb")
 *
 * Needs DATABASE_OWNER_URL (PostgreSQL), MONGODB_OWNER_URI and MONGODB_DB (MongoDB) and CONTACT_ENC_KEY.
 *
 * What changes on the way:
 *   - each row becomes a document with the same field names; the old primary key becomes `_id` (as a string; a two-part
 *     key becomes "a:b"), so every reference between records stays valid
 *   - phone and address are decrypted with PostgreSQL's pgcrypto and encrypted again in the new format (same key)
 *   - audit entries keep everything, but `changes` becomes a list of { field, old, new } instead of an object
 *   - left behind on purpose: sessions and failed-login counters (everyone signs in again), schema_migrations
 */
import './loadenv';
import { isDeepStrictEqual } from 'node:util';
import { MongoClient, ObjectId, type Document } from 'mongodb';
import { Client } from 'pg';
import { dbSsl } from '../../src/server/dbSsl';
import { decryptContact, encryptContact } from '../../src/server/contactCrypto';
import { ALL_COLLECTIONS, AUDIT_COLLECTION, ensureSchema, LOCKS_COLLECTION } from '../../src/server/mongo/schema';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const wipe = args.includes('--wipe-target');
const { DATABASE_OWNER_URL, MONGODB_OWNER_URI, MONGODB_DB, CONTACT_ENC_KEY } = process.env;
if (!DATABASE_OWNER_URL || !MONGODB_OWNER_URI || !MONGODB_DB || !CONTACT_ENC_KEY) {
  console.error('DATABASE_OWNER_URL, MONGODB_OWNER_URI, MONGODB_DB and CONTACT_ENC_KEY must all be set.');
  process.exit(1);
}
if (wipe && MONGODB_DB === 'smarttb') {
  console.error('--wipe-target is for rehearsals only and refuses the database named "smarttb".');
  process.exit(1);
}

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
interface Step {
  table: string;
  collection: string;
  sql: string;
  /** Keyset paging for big tables: the numeric column to page by. */
  pageBy?: string;
  map: (row: Row) => Document;
  /** Compare read-back documents with what was written, in source order (documents with generated ids). */
  ordered?: boolean;
}

const isLocal = (url: string) => ['localhost', '127.0.0.1', '::1'].includes(new URL(url).hostname);
const iso = (d: Date | null) => d ?? null;

/** PostgreSQL's `changes` object becomes the list form the app writes now. */
function changesToList(changes: unknown): { field: string; old: unknown; new: unknown }[] {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return [];
  return Object.entries(changes as Record<string, { old?: unknown; new?: unknown }>).map(([field, c]) => ({ field, old: c?.old ?? null, new: c?.new ?? null }));
}

const STEPS: Step[] = [
  {
    table: 'app_users', collection: 'app_users', sql: 'select * from app_users order by created_at, id',
    map: (r) => ({ _id: r.id, email: r.email, display_name: r.display_name, role: r.role, is_admin: r.is_admin, password_hash: r.password_hash, external_uid: r.external_uid, active: r.active, must_change_password: r.must_change_password, last_sign_in_at: iso(r.last_sign_in_at), created_at: r.created_at, updated_at: r.updated_at, updated_by: r.updated_by }),
  },
  {
    table: 'module_delegations', collection: 'module_delegations',
    sql: "select user_id, module_id, granted_by, granted_at, reason, to_char(expires_at, 'YYYY-MM-DD') as expires_at from module_delegations order by user_id, module_id",
    map: (r) => ({ _id: `${r.user_id}:${r.module_id}`, user_id: r.user_id, module_id: r.module_id, granted_by: r.granted_by, granted_at: r.granted_at, reason: r.reason, expires_at: r.expires_at }),
  },
  {
    table: 'account_setup_tokens', collection: 'account_setup_tokens', sql: 'select * from account_setup_tokens order by created_at',
    map: (r) => ({ _id: r.token_hash, user_id: r.user_id, created_by: r.created_by, created_at: r.created_at, expires_at: r.expires_at, used_at: iso(r.used_at) }),
  },
  {
    table: 'access_requests', collection: 'access_requests', sql: 'select * from access_requests order by created_at, id',
    map: (r) => ({ _id: r.id, email: r.email, display_name: r.display_name, requested_role: r.requested_role, note: r.note, password_hash: r.password_hash, status: r.status, created_at: r.created_at, expires_at: r.expires_at, decided_by: r.decided_by, decided_at: iso(r.decided_at), decision_role: r.decision_role, decision_reason: r.decision_reason, user_id: r.user_id }),
  },
  {
    table: 'roles', collection: 'roles', sql: 'select * from roles order by created_at, key',
    map: (r) => ({ _id: r.key, label: r.label, description: r.description, builtin: r.builtin, modules: r.modules, created_by: r.created_by, created_at: r.created_at, deleted_at: iso(r.deleted_at), deleted_by: r.deleted_by }),
  },
  {
    table: 'staff_invites', collection: 'staff_invites', sql: 'select * from staff_invites order by created_at, id',
    map: (r) => ({ _id: r.id, token_hash: r.token_hash, role: r.role, is_admin: r.is_admin, created_by: r.created_by, created_at: r.created_at, expires_at: r.expires_at, used_at: iso(r.used_at), revoked_at: iso(r.revoked_at), revoked_by: r.revoked_by, user_id: r.user_id }),
  },
  {
    table: 'participants', collection: 'participants', sql: 'select * from participants order by created_at, uid',
    map: (r) => ({ _id: r.uid, discontinuation_requested: r.discontinuation_requested, created_at: r.created_at, created_by: r.created_by, updated_at: r.updated_at }),
  },
  {
    table: 'crf_modules', collection: 'crf_modules', sql: 'select * from crf_modules order by participant_uid, module_id',
    map: (r) => ({ _id: `${r.participant_uid}:${r.module_id}`, participant_uid: r.participant_uid, module_id: r.module_id, data: r.data, completed: r.completed, completed_by: r.completed_by, completed_by_name: r.completed_by_name, completed_role: r.completed_role, completed_at: iso(r.completed_at), editing: r.editing, draft_saved_at: iso(r.draft_saved_at), updated_at: r.updated_at, updated_by: r.updated_by }),
  },
  {
    table: 'module_edit_reasons', collection: 'module_edit_reasons', sql: 'select * from module_edit_reasons where id > $1 order by id limit 5000', pageBy: 'id', ordered: true,
    map: (r) => ({ participant_uid: r.participant_uid, module_id: r.module_id, at: r.at, user_id: r.user_id, by_name: r.by_name, role: r.role, reason: r.reason }),
  },
  {
    // Decrypted here with PostgreSQL's own function, encrypted again in Node (see src/server/contactCrypto.ts).
    table: 'participant_contacts', collection: 'participant_contacts',
    sql: 'select participant_uid, pgp_sym_decrypt(phone_enc, $K) as phone, pgp_sym_decrypt(address_enc, $K) as address, updated_at, updated_by from participant_contacts order by participant_uid',
    map: (r) => ({ _id: r.participant_uid, participant_uid: r.participant_uid, phone_enc: encryptContact(r.phone ?? '', r.participant_uid, 'phone'), address_enc: encryptContact(r.address ?? '', r.participant_uid, 'address'), updated_at: r.updated_at, updated_by: r.updated_by, _plain: { phone: r.phone ?? '', address: r.address ?? '' } }),
  },
  {
    table: 'audit_log', collection: AUDIT_COLLECTION, sql: 'select * from audit_log where id > $1 order by id limit 5000', pageBy: 'id', ordered: true,
    map: (r) => ({ at: r.at, user_id: r.user_id, table_name: r.table_name, row_key: r.row_key, action: r.action, changes: changesToList(r.changes), reason: r.reason }),
  },
];

const pg = new Client({ connectionString: DATABASE_OWNER_URL, ssl: isLocal(DATABASE_OWNER_URL) ? undefined : dbSsl() });
const mongo = new MongoClient(MONGODB_OWNER_URI);
const problems: string[] = [];
const report: { table: string; source: number; written: number; verified: string }[] = [];

await pg.connect();
await mongo.connect();
const db = mongo.db(MONGODB_DB);
try {
  // --- the target must be empty (the locks are created by the schema and do not count)
  await ensureSchema(db);
  const occupied: string[] = [];
  for (const name of ALL_COLLECTIONS) if (name !== LOCKS_COLLECTION && (await db.collection(name).countDocuments()) > 0) occupied.push(name);
  if (occupied.length && !dryRun) {
    if (!wipe) throw new Error(`The MongoDB database "${MONGODB_DB}" already has data (${occupied.join(', ')}). Use an empty database, or --wipe-target for a rehearsal.`);
    for (const c of await db.listCollections({}, { nameOnly: true }).toArray()) await db.collection(c.name).drop();
    await ensureSchema(db);
    console.log(`Emptied "${MONGODB_DB}" first (--wipe-target).`);
  }

  // --- one consistent snapshot of PostgreSQL
  await pg.query('begin isolation level repeatable read read only');
  console.log(`${dryRun ? 'DRY RUN: ' : ''}Moving from PostgreSQL (${new URL(DATABASE_OWNER_URL).host}) to MongoDB database "${MONGODB_DB}"\n`);

  for (const step of STEPS) {
    const sql = step.sql.replaceAll('$K', '$1');
    const docs: Document[] = [];
    if (step.pageBy) {
      let last = 0;
      for (;;) {
        const { rows } = await pg.query<Row>(sql, [last]);
        if (!rows.length) break;
        for (const r of rows) docs.push(step.map(r));
        last = rows[rows.length - 1][step.pageBy];
      }
    } else {
      const { rows } = await pg.query<Row>(sql, step.table === 'participant_contacts' ? [CONTACT_ENC_KEY] : []);
      for (const r of rows) docs.push(step.map(r));
    }
    const { rows: counted } = await pg.query<{ n: number }>(`select count(*)::int as n from ${step.table}`);
    const source = counted[0].n;
    if (docs.length !== source) problems.push(`${step.table}: read ${docs.length} rows but the table has ${source}`);

    // Contact details: what is about to be written must decrypt to exactly what PostgreSQL decrypted.
    let verified = dryRun ? 'not written' : '';
    if (step.table === 'participant_contacts') {
      const bad = docs.filter((d) => decryptContact(d.phone_enc, d._id, 'phone') !== d._plain.phone || decryptContact(d.address_enc, d._id, 'address') !== d._plain.address).length;
      if (bad) problems.push(`participant_contacts: ${bad} value(s) do not decrypt back to the original`);
      for (const d of docs) delete d._plain;
    }

    if (!dryRun && docs.length) {
      if (step.ordered) for (const d of docs) d._id = new ObjectId();
      try {
        for (let i = 0; i < docs.length; i += 1000) await db.collection(step.collection).insertMany(docs.slice(i, i + 1000), { ordered: true });
      } catch (err) {
        throw new Error(`${step.table}: could not be written: ${(err as Error).message}`);
      }
      // Read everything back and compare with what was written.
      const back = await db.collection(step.collection).find({}).sort({ _id: 1 }).toArray();
      let same = back.length === docs.length;
      if (same && step.table !== 'participant_contacts') {
        const byId = new Map(back.map((b) => [String(b._id), b]));
        same = docs.every((d) => isDeepStrictEqual(byId.get(String(d._id)), d));
      } else if (same) {
        for (const b of back) {
          const w = docs.find((d) => d._id === b._id)!;
          if (decryptContact(b.phone_enc, b._id, 'phone') !== decryptContact(w.phone_enc, w._id, 'phone') || decryptContact(b.address_enc, b._id, 'address') !== decryptContact(w.address_enc, w._id, 'address')) same = false;
        }
      }
      verified = same ? 'identical' : 'DIFFERENT';
      if (!same) problems.push(`${step.table}: what was read back from MongoDB differs from what was written`);
    }
    report.push({ table: step.table, source, written: dryRun ? 0 : docs.length, verified: verified || (docs.length ? 'n/a' : 'empty') });
  }

  // --- cross-checks that hold in the source and must still hold
  const cross = async (name: string, ok: boolean, detail = '') => {
    if (!ok) problems.push(`${name}${detail ? `: ${detail}` : ''}`);
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${detail}`}`);
  };
  console.log('');
  const q = async (sql: string) => (await pg.query<{ n: number }>(sql)).rows[0].n;
  await cross('every participant has all ten modules', (await q('select count(*)::int as n from participants p where (select count(*) from crf_modules m where m.participant_uid = p.uid) <> 10')) === 0);
  await cross('every participant has a contact record', (await q('select count(*)::int as n from participants p where not exists (select 1 from participant_contacts c where c.participant_uid = p.uid)')) === 0);
  await cross('no module without its participant', (await q('select count(*)::int as n from crf_modules m where not exists (select 1 from participants p where p.uid = m.participant_uid)')) === 0);
  // Not a fault: deleting an account keeps its audit history, which then names an account that no longer exists.
  const orphaned = await q('select count(*)::int as n from audit_log a where a.user_id is not null and not exists (select 1 from app_users u where u.id = a.user_id)');
  console.log(`NOTE  ${orphaned} audit entr${orphaned === 1 ? 'y names' : 'ies name'} a deleted account; moved as they are (the history is kept on purpose)`);
} catch (err) {
  problems.push((err as Error).message);
} finally {
  await pg.query('rollback').catch(() => {});
  await pg.end();
}

console.log('');
const w = Math.max(...report.map((r) => r.table.length), 5);
console.log(`${'table'.padEnd(w)}  ${'source'.padStart(7)}  ${'written'.padStart(7)}  read back`);
for (const r of report) console.log(`${r.table.padEnd(w)}  ${String(r.source).padStart(7)}  ${String(r.written).padStart(7)}  ${r.verified}`);
console.log('(sessions and failed-login counters are not moved: everyone signs in again)');

if (!problems.length && !dryRun) {
  // The move is itself a recorded event.
  await db.collection(AUDIT_COLLECTION).insertOne({
    _id: new ObjectId(), at: new Date(), user_id: null, table_name: 'system', row_key: 'data-move', action: 'DATA_MOVE',
    changes: report.map((r) => ({ field: r.table, old: r.source, new: r.written })), reason: 'Moved from PostgreSQL to MongoDB',
  });
}
await mongo.close();
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n- ${problems.join('\n- ')}`);
  console.error(dryRun ? '\nThe dry run found problems.' : '\nThe move did NOT finish cleanly. Do not use this database.');
  process.exit(1);
}
console.log(dryRun ? '\nDry run clean: nothing was written.' : '\nMove complete and verified.');
