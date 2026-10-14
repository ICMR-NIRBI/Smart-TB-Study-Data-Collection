import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { dbSsl } from '../../src/server/dbSsl';

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`${name} is not set. Copy .env.example to .env.local (or the server env file) and fill it in.`);
    process.exit(1);
  }
  return v;
}

export async function connect(url: string): Promise<Client> {
  const client = new Client({ connectionString: url, ssl: isLocalUrl(url) ? undefined : dbSsl() });
  await client.connect();
  return client;
}

export function isLocalUrl(url: string): boolean {
  const host = new URL(url).hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

const MIGRATIONS_DIR = join(process.cwd(), 'db', 'migrations');

/** Applies every migration in db/migrations not yet recorded, each in its own transaction. */
export async function migrate(client: Client): Promise<string[]> {
  await client.query(`create table if not exists schema_migrations (
    name text primary key, applied_at timestamptz not null default now())`);
  const { rows } = await client.query<{ name: string }>('select name from schema_migrations');
  const done = new Set(rows.map((r) => r.name));
  const pending = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql') && !done.has(f))
    .sort();

  for (const name of pending) {
    const sql = readFileSync(join(MIGRATIONS_DIR, name), 'utf8');
    await client.query('begin');
    try {
      await client.query(sql);
      await client.query('insert into schema_migrations (name) values ($1)', [name]);
      await client.query('commit');
    } catch (err) {
      await client.query('rollback');
      throw new Error(`Migration ${name} failed: ${(err as Error).message}`);
    }
  }
  return pending;
}
