/*
 * Backup and restore of one MongoDB database, using only the Node driver (no extra MongoDB tools on the server).
 *
 * File format: gzip of one JSON object per line.
 *   { t: 'header', v: 1, db, at }
 *   { t: 'collection', name, indexes: [ ...index specs ] }
 *   { t: 'doc', c: collectionName, d: <extended JSON document> }
 * Extended JSON keeps ObjectIds, dates and binary values exact.
 *
 * The backup reads every collection inside one snapshot transaction, so all collections are from the same moment.
 * That is right for this study's data size; if the data ever grows to hundreds of megabytes, switch to mongodump
 * with --oplog instead.
 */
import { createGunzip, createGzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { EJSON } from 'bson';
import type { Db, Document, IndexDescription } from 'mongodb';
import type { Readable, Writable } from 'node:stream';

const BATCH = 500;

async function write(out: Writable, line: unknown) {
  if (!out.write(`${JSON.stringify(line)}\n`)) await new Promise<void>((resolve) => out.once('drain', resolve));
}

/** Writes the database as a gzip stream to `out`. Returns how many documents were written. */
export async function dumpDatabase(db: Db, out: Writable): Promise<number> {
  const gzip = createGzip();
  // `end: false`: standard output never reports "finished", so the end is detected on the gzip side instead and the
  // output is flushed explicitly.
  gzip.pipe(out, { end: false });
  const finished = new Promise<void>((resolve, reject) => {
    gzip.once('end', resolve);
    gzip.once('error', reject);
    out.once('error', reject);
  });

  // Collection and index lists cannot be read inside a transaction, so they come first; the documents are then
  // read inside one snapshot, so all collections are from the same moment.
  const names = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name).filter((n) => !n.startsWith('system.')).sort();
  const indexes: Record<string, Document[]> = {};
  for (const name of names) indexes[name] = (await db.collection(name).listIndexes().toArray()).filter((i) => i.name !== '_id_');

  const session = db.client.startSession();
  let total = 0;
  try {
    session.startTransaction({ readConcern: { level: 'snapshot' } });
    await write(gzip, { t: 'header', v: 1, db: db.databaseName, at: new Date().toISOString() });
    for (const name of names) {
      await write(gzip, { t: 'collection', name, indexes: indexes[name] });
      for await (const doc of db.collection(name).find({}, { session })) {
        await write(gzip, { t: 'doc', c: name, d: EJSON.serialize(doc, { relaxed: false }) });
        total++;
      }
    }
    await session.commitTransaction();
  } catch (err) {
    await session.abortTransaction().catch(() => {});
    gzip.destroy(err as Error);
    throw err;
  } finally {
    await session.endSession();
  }
  gzip.end();
  await finished;
  await new Promise<void>((resolve) => out.write(Buffer.alloc(0), () => resolve()));
  return total;
}

export interface LoadOptions {
  /** Drop the collections in the backup first. Without it, loading into a database that already has documents is refused. */
  replace?: boolean;
}

/** Reads a gzip stream made by dumpDatabase into `db`. Returns documents loaded per collection. */
export async function loadDatabase(db: Db, input: Readable, options: LoadOptions = {}): Promise<Record<string, number>> {
  const lines = createInterface({ input: input.pipe(createGunzip()), crlfDelay: Infinity });
  const counts: Record<string, number> = {};
  const pending: Record<string, Document[]> = {};
  const indexSpecs: Record<string, IndexDescription[]> = {};
  let sawHeader = false;

  const flush = async (name: string) => {
    const docs = pending[name];
    if (docs?.length) {
      await db.collection(name).insertMany(docs, { ordered: true });
      pending[name] = [];
    }
  };

  for await (const line of lines) {
    if (!line) continue;
    const row = JSON.parse(line) as { t: string; v?: number; name?: string; indexes?: IndexDescription[]; c?: string; d?: unknown };
    if (row.t === 'header') {
      if (row.v !== 1) throw new Error(`Unknown backup format version ${row.v}`);
      sawHeader = true;
    } else if (!sawHeader) {
      throw new Error('This is not a SMART-TB backup (header missing)');
    } else if (row.t === 'collection') {
      const name = row.name!;
      const existing = await db.listCollections({ name }).toArray();
      if (existing.length) {
        if (options.replace) await db.collection(name).drop();
        else if ((await db.collection(name).estimatedDocumentCount()) > 0) {
          throw new Error(`Collection "${name}" already has documents. Use the replace option to overwrite it.`);
        }
      }
      if (!(await db.listCollections({ name }).toArray()).length) await db.createCollection(name);
      counts[name] = 0;
      pending[name] = [];
      indexSpecs[name] = row.indexes ?? [];
    } else if (row.t === 'doc') {
      const name = row.c!;
      pending[name].push(EJSON.deserialize(row.d as Document) as Document);
      counts[name]++;
      if (pending[name].length >= BATCH) await flush(name);
    }
  }
  for (const name of Object.keys(pending)) await flush(name);

  // Indexes go in after the documents so a large load is not slowed down.
  for (const [name, specs] of Object.entries(indexSpecs)) {
    if (specs.length) {
      await db.collection(name).createIndexes(
        specs.map((spec) => Object.fromEntries(Object.entries(spec).filter(([k]) => k !== 'v' && k !== 'ns')) as IndexDescription),
      );
    }
  }
  return counts;
}
