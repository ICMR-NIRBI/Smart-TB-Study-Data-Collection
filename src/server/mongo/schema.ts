import type { Db, CreateIndexesOptions } from 'mongodb';

/**
 * Every collection the app uses. They mirror the old PostgreSQL tables one to one: same names, same field names
 * (snake_case), and `_id` holds the old primary key as a string (a text id, or "a:b" for a two-part key).
 *
 * The database login the app uses is built from this list (scripts/mongo/setup-auth.mts): it may do exactly the
 * `privileges` listed here and nothing else, so a collection added here needs the set-up script run again.
 */
export type Privilege = 'find' | 'insert' | 'update' | 'remove';

export interface AuditSpec {
  /** Fields that make up the audit row key, joined with ":" (the old audit_capture arguments). */
  keyFields: string[];
  /** Never written to the audit trail: a change to one of these is recorded as `password_changed` instead. */
  secret?: string[];
  /** Housekeeping fields whose changes are not worth recording. */
  noise?: string[];
  /** Record changes inside the `data` object one by one, as `data.<field>`. */
  expandData?: boolean;
}

export interface IndexSpec {
  key: Record<string, 1 | -1>;
  options?: CreateIndexesOptions;
}

export interface CollectionSpec {
  name: string;
  privileges: Privilege[];
  /** Absent: changes to this collection are not audited (sessions, tokens and the like). */
  audit?: AuditSpec;
  indexes?: IndexSpec[];
}

const CI = { locale: 'en', strength: 2 } as const; // case-insensitive comparison, like lower(email)
const RW: Privilege[] = ['find', 'insert', 'update'];

export const AUDIT_COLLECTION = 'audit_log';
export const LOCKS_COLLECTION = 'locks';
/** Named locks the app takes with tx.lock(). Created by the set-up script so no one ever has to create one in a transaction. */
export const LOCK_NAMES = ['admins'] as const;

export const SPECS: CollectionSpec[] = [
  {
    name: 'app_users',
    privileges: [...RW, 'remove'],
    audit: { keyFields: ['_id'], secret: ['password_hash'], noise: ['updated_at', 'updated_by', 'last_sign_in_at'] },
    indexes: [
      { key: { email: 1 }, options: { name: 'email_unique', unique: true } },
      { key: { external_uid: 1 }, options: { name: 'external_uid_unique', unique: true, partialFilterExpression: { external_uid: { $type: 'string' } } } },
    ],
  },
  {
    name: 'module_delegations',
    privileges: [...RW, 'remove'],
    audit: { keyFields: ['user_id', 'module_id'], noise: ['updated_at', 'updated_by'] },
    indexes: [{ key: { user_id: 1 }, options: { name: 'by_user' } }],
  },
  { name: 'sessions', privileges: [...RW, 'remove'], indexes: [{ key: { user_id: 1 }, options: { name: 'by_user' } }] },
  { name: 'login_attempts', privileges: [...RW, 'remove'] },
  {
    name: 'account_setup_tokens',
    // 'remove': deleting an account takes its setup links with it (PostgreSQL did this by cascade).
    privileges: [...RW, 'remove'],
    indexes: [{ key: { user_id: 1 }, options: { name: 'by_user' } }],
  },
  {
    name: 'access_requests',
    privileges: RW,
    audit: { keyFields: ['_id'], secret: ['password_hash'], noise: ['updated_at', 'updated_by'] },
    indexes: [
      // One waiting request per email, whatever the letter case.
      { key: { email: 1 }, options: { name: 'one_pending_per_email', unique: true, collation: CI, partialFilterExpression: { status: 'pending' } } },
      { key: { status: 1, created_at: -1 }, options: { name: 'by_status' } },
    ],
  },
  {
    name: 'roles',
    privileges: RW,
    audit: { keyFields: ['_id'], noise: ['updated_at', 'updated_by'] },
    indexes: [
      // A name can be used by one live role at a time (letter case does not matter).
      { key: { label: 1 }, options: { name: 'label_live_unique', unique: true, collation: CI, partialFilterExpression: { deleted_at: { $type: 'null' } } } },
    ],
  },
  {
    name: 'staff_invites',
    privileges: RW,
    audit: { keyFields: ['_id'], noise: ['updated_at', 'updated_by'] },
    indexes: [{ key: { token_hash: 1 }, options: { name: 'token_unique', unique: true } }],
  },
  // Study data: nothing is ever removed from these.
  { name: 'participants', privileges: RW, audit: { keyFields: ['_id'], noise: ['updated_at', 'updated_by'] } },
  {
    name: 'crf_modules',
    privileges: RW,
    audit: { keyFields: ['participant_uid', 'module_id'], noise: ['updated_at', 'updated_by'], expandData: true },
    indexes: [
      { key: { participant_uid: 1 }, options: { name: 'by_participant' } },
      // A participant id can be used once (Module 1 only, and only when it is filled in).
      {
        key: { 'data.participantId': 1 },
        options: { name: 'participant_id_unique', unique: true, partialFilterExpression: { module_id: 1, 'data.participantId': { $gt: '' } } },
      },
    ],
  },
  { name: 'participant_contacts', privileges: RW, audit: { keyFields: ['_id'], noise: ['updated_at', 'updated_by'] } },
  // Append-only: may be added to and read, never changed or removed.
  {
    name: 'module_edit_reasons',
    privileges: ['find', 'insert'],
    indexes: [{ key: { participant_uid: 1, module_id: 1, at: 1 }, options: { name: 'by_module' } }],
  },
  {
    name: AUDIT_COLLECTION,
    privileges: ['find', 'insert'],
    indexes: [{ key: { table_name: 1, row_key: 1, at: 1 }, options: { name: 'by_row' } }],
  },
  { name: LOCKS_COLLECTION, privileges: RW },
];

export const ALL_COLLECTIONS: readonly string[] = SPECS.map((s) => s.name);

export function specOf(name: string): CollectionSpec {
  const spec = SPECS.find((s) => s.name === name);
  if (!spec) throw new Error(`Unknown collection "${name}"`);
  return spec;
}

/** Creates every collection and index, and the lock documents. Safe to run again. Needs the owner login. */
export async function ensureSchema(db: Db): Promise<void> {
  const have = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  for (const spec of SPECS) {
    if (!have.has(spec.name)) await db.createCollection(spec.name);
    if (spec.indexes?.length) {
      await db.collection(spec.name).createIndexes(spec.indexes.map((i) => ({ key: i.key, ...i.options })));
    }
  }
  for (const name of LOCK_NAMES) {
    await db.collection(LOCKS_COLLECTION).updateOne({ _id: name as never }, { $setOnInsert: { n: 0 } }, { upsert: true });
  }
}
