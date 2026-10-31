import { ObjectId, type ClientSession, type Db, type Document, type Filter, type FindOptions, type UpdateFilter } from 'mongodb';
import { auditKey, diffForAudit, type AuditChange } from './audit';
import { getClient, getDb } from './client';
import { AUDIT_COLLECTION, LOCKS_COLLECTION, specOf } from './schema';

type Doc = Document;

export interface TxContext {
  /** Who is acting, recorded on every audit entry. */
  userId?: string | null;
  /** Why (for staff changes, a typed reason), recorded on every audit entry. */
  reason?: string | null;
}

/**
 * The one way the app changes data. Everything inside `withTransaction` happens together or not at all, and every
 * change to an audited collection writes its audit entry in the same transaction, so a change without a record
 * cannot happen. (The app's database login cannot change or delete audit entries afterwards.)
 */
export class Tx {
  constructor(
    readonly session: ClientSession,
    readonly db: Db,
    public actor: string | null,
    public reason: string | null,
  ) {}

  // --- who and why (the old app.user_id and app.reason settings)
  setActor(userId: string | null) {
    this.actor = userId;
  }
  setReason(reason: string | null) {
    this.reason = reason;
  }

  // --- reading (inside the transaction's snapshot)
  findOne<T extends Doc = Doc>(name: string, filter: Filter<Doc> = {}, options: FindOptions = {}): Promise<T | null> {
    return this.db.collection(name).findOne(filter, { ...options, session: this.session }) as Promise<T | null>;
  }
  find<T extends Doc = Doc>(name: string, filter: Filter<Doc> = {}, options: FindOptions = {}): Promise<T[]> {
    return this.db.collection(name).find(filter, { ...options, session: this.session }).toArray() as unknown as Promise<T[]>;
  }
  count(name: string, filter: Filter<Doc> = {}): Promise<number> {
    return this.db.collection(name).countDocuments(filter, { session: this.session });
  }

  /**
   * Waits for any other transaction holding the same named lock (it conflicts and the loser is retried). Use it when a
   * rule spans several documents, such as "at least one administrator must remain", where reading is not enough.
   */
  async lock(name: string): Promise<void> {
    await this.db.collection(LOCKS_COLLECTION).updateOne({ _id: name as never }, { $inc: { n: 1 } }, { session: this.session, upsert: true });
  }

  // --- writing
  async insertOne(name: string, doc: Doc): Promise<void> {
    await this.db.collection(name).insertOne(doc, { session: this.session });
    await this.auditChange(name, null, doc);
  }

  /**
   * Changes the first matching document; returns it as it is now, or null if nothing matched. With `upsert`, a
   * document is created from the filter and update when none matches.
   */
  async updateOne(name: string, filter: Filter<Doc>, update: UpdateFilter<Doc>, opts: { upsert?: boolean } = {}): Promise<Doc | null> {
    const col = this.db.collection(name);
    const upsert = opts.upsert === true;
    if (!specOf(name).audit) return col.findOneAndUpdate(filter, update, { session: this.session, returnDocument: 'after', upsert });
    const before = await col.findOne(filter, { session: this.session });
    if (!before) {
      if (!upsert) return null;
      const created = await col.findOneAndUpdate(filter, update, { session: this.session, returnDocument: 'after', upsert: true });
      if (created) await this.auditChange(name, null, created);
      return created;
    }
    const after = await col.findOneAndUpdate({ _id: before._id }, update, { session: this.session, returnDocument: 'after' });
    if (after) await this.auditChange(name, before, after);
    return after;
  }

  /** Changes every matching document, each with its own audit entry. Returns how many matched. */
  async updateMany(name: string, filter: Filter<Doc>, update: UpdateFilter<Doc>): Promise<number> {
    const col = this.db.collection(name);
    if (!specOf(name).audit) return (await col.updateMany(filter, update, { session: this.session })).matchedCount;
    const docs = await this.find(name, filter);
    for (const d of docs) await this.updateOne(name, { _id: d._id }, update);
    return docs.length;
  }

  /** Removes the first matching document; returns it, or null if nothing matched. */
  async deleteOne(name: string, filter: Filter<Doc>): Promise<Doc | null> {
    const before = await this.db.collection(name).findOne(filter, { session: this.session });
    if (!before) return null;
    await this.db.collection(name).deleteOne({ _id: before._id }, { session: this.session });
    await this.auditChange(name, before, null);
    return before;
  }

  async deleteMany(name: string, filter: Filter<Doc>): Promise<number> {
    const spec = specOf(name);
    if (!spec.audit) return (await this.db.collection(name).deleteMany(filter, { session: this.session })).deletedCount;
    const docs = await this.find(name, filter);
    for (const d of docs) await this.deleteOne(name, { _id: d._id });
    return docs.length;
  }

  // --- audit
  private async auditChange(name: string, before: Doc | null, after: Doc | null): Promise<void> {
    const spec = specOf(name).audit;
    if (!spec) return;
    const changes = diffForAudit(spec, before, after);
    if (!changes.length) return;
    const action = !before ? 'INSERT' : !after ? 'DELETE' : 'UPDATE';
    await this.record(name, auditKey(spec, (after ?? before)!), action, changes);
  }

  /** Writes an audit entry of its own: sign-ins, setup links and other events that are not a plain field change. */
  async record(table: string, rowKey: string, action: string, changes: AuditChange[] = [], override: { actor?: string | null; reason?: string | null } = {}): Promise<void> {
    await this.db.collection(AUDIT_COLLECTION).insertOne(
      {
        _id: new ObjectId(),
        at: new Date(),
        user_id: override.actor !== undefined ? override.actor : this.actor,
        table_name: table,
        row_key: rowKey,
        action,
        changes,
        reason: (override.reason !== undefined ? override.reason : this.reason) || null,
      },
      { session: this.session },
    );
  }
}

/**
 * Runs `fn` as one transaction. If another transaction touches the same documents at the same moment, MongoDB makes
 * one of them start over, so `fn` can run more than once: keep anything with outside effects (sending, logging)
 * out of it, and do slow pure work such as hashing a password before or inside, as you like.
 */
export async function withTransaction<T>(ctx: TxContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const session = getClient().startSession();
  try {
    return (await session.withTransaction(() => fn(new Tx(session, getDb(), ctx.userId ?? null, ctx.reason ?? null)), {
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
    })) as T;
  } finally {
    await session.endSession();
  }
}

/** What read-only code needs: satisfied by a transaction (its snapshot) and by `reader` (outside one). */
export type Reads = Pick<Tx, 'findOne' | 'find' | 'count'>;

/** Read-only access outside a transaction: nothing here can change data. */
export const reader: Reads = {
  findOne: <T extends Doc = Doc>(name: string, filter: Filter<Doc> = {}, options: FindOptions = {}) => getDb().collection(name).findOne(filter, options) as Promise<T | null>,
  find: <T extends Doc = Doc>(name: string, filter: Filter<Doc> = {}, options: FindOptions = {}) => getDb().collection(name).find(filter, options).toArray() as unknown as Promise<T[]>,
  count: (name: string, filter: Filter<Doc> = {}) => getDb().collection(name).countDocuments(filter),
};
