import { Pool, type PoolClient } from 'pg';
import { dbSsl } from './dbSsl';

const globalForPool = globalThis as unknown as { smarttbPool?: Pool };

/** One pool per server process (kept across dev hot reloads). */
export function getPool(): Pool {
  if (!globalForPool.smarttbPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is not set — see web/.env.example');
    globalForPool.smarttbPool = new Pool({ connectionString, ssl: dbSsl(), max: 10, idleTimeoutMillis: 30_000 });
  }
  return globalForPool.smarttbPool;
}

export interface TxContext {
  /** Recorded as the author of every audited change in this transaction. */
  userId?: string;
  /** Recorded alongside every audited change (e.g. the reason a locked module was reopened). */
  reason?: string;
}

export async function setAuditContext(client: PoolClient, ctx: TxContext): Promise<void> {
  await client.query("select set_config('app.user_id', $1, true), set_config('app.reason', $2, true)", [
    ctx.userId ?? '',
    ctx.reason ?? '',
  ]);
}

export async function withTransaction<T>(ctx: TxContext, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    await setAuditContext(client, ctx);
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
