/**
 * Checks that a database can run SMART-TB before anything is installed on it. Changes nothing: every test
 * runs inside a transaction that is rolled back. Use it on trial day against the managed database.
 * Run: npm run db:preflight
 */
import { connect, isLocalUrl, requireEnv } from './lib';

type Result = { check: string; ok: boolean; detail: string };

async function main() {
  const url = requireEnv('DATABASE_OWNER_URL');
  const results: Result[] = [];
  const add = (check: string, ok: boolean, detail: string) => results.push({ check, ok, detail });

  let client;
  try {
    client = await connect(url);
    add('Connect as owner', true, new URL(url).host);
  } catch (err) {
    add('Connect as owner', false, (err as Error).message);
    return report(results);
  }

  const { rows: v } = await client.query<{ num: number; ver: string }>(
    "select current_setting('server_version_num')::int as num, current_setting('server_version') as ver",
  );
  add('PostgreSQL 13 or newer (pgcrypto is a trusted extension from 13)', v[0].num >= 130000, v[0].ver);

  const { rows: ssl } = await client.query<{ ssl: boolean | null }>('select ssl from pg_stat_ssl where pid = pg_backend_pid()');
  add('Encrypted connection (SSL)', !!ssl[0]?.ssl || isLocalUrl(url), ssl[0]?.ssl ? 'on' : isLocalUrl(url) ? 'not needed (local)' : 'off — set DATABASE_SSL_CA');

  const { rows: me } = await client.query<{ rolsuper: boolean; rolcreaterole: boolean; can_create: boolean }>(
    "select r.rolsuper, r.rolcreaterole, has_database_privilege(current_database(), 'CREATE') as can_create from pg_roles r where r.rolname = current_user",
  );
  add('Owner can create schemas/extensions in this database', me[0].can_create || me[0].rolsuper, `CREATE privilege: ${me[0].can_create}`);

  const { rows: avail } = await client.query("select 1 from pg_available_extensions where name = 'pgcrypto'");
  add('pgcrypto is installed on the server', avail.length > 0, avail.length ? 'available' : 'not available');

  const tx = async (name: string, sql: string[], detail = 'ok') => {
    try {
      await client.query('begin');
      for (const s of sql) await client.query(s);
      add(name, true, detail);
    } catch (err) {
      add(name, false, (err as Error).message);
    } finally {
      await client.query('rollback').catch(() => {});
    }
  };

  await tx('pgcrypto can be enabled and encrypts/decrypts', [
    'create extension if not exists pgcrypto',
    "do $$ begin if pgp_sym_decrypt(pgp_sym_encrypt('9876543210', 'k'), 'k') <> '9876543210' then raise exception 'round trip failed'; end if; end $$",
  ]);
  await tx('Audit triggers can be created (PL/pgSQL)', [
    'create temp table preflight_t (id int)',
    "create function pg_temp.preflight_fn() returns trigger language plpgsql as $$ begin return new; end $$",
    'create trigger preflight_trg before insert on preflight_t for each row execute function pg_temp.preflight_fn()',
  ]);
  await client.end();

  // The restricted app role: fine if it already logs in; otherwise the admin user (who runs db:setup) must be able to create it.
  const appUrl = process.env.DATABASE_URL;
  let appLogsIn = false;
  if (appUrl) {
    try {
      const app = await connect(appUrl);
      await app.query('select 1');
      await app.end();
      appLogsIn = true;
      add('Restricted app role exists and can log in', true, decodeURIComponent(new URL(appUrl).username));
    } catch {
      /* checked below */
    }
  }
  if (!appLogsIn) {
    const adminUrl = process.env.PG_ADMIN_URL;
    if (!adminUrl) {
      add('Restricted app role can be created', false, 'PG_ADMIN_URL not set');
    } else {
      const admin = await connect(adminUrl);
      try {
        await admin.query('begin');
        await admin.query('create role smarttb_preflight_role nologin');
        add('Restricted app role can be created (run npm run db:setup)', true, 'admin user has CREATEROLE');
      } catch (err) {
        add('Restricted app role can be created', false, `${(err as Error).message} — ask the provider to grant CREATEROLE`);
      } finally {
        await admin.query('rollback').catch(() => {});
        await admin.end();
      }
    }
  }

  report(results);
}

function report(results: Result[]) {
  const width = Math.max(...results.map((r) => r.check.length));
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.check.padEnd(width)}  ${r.detail}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed ? `\n${failed} check(s) failed — do not install yet.` : '\nAll checks passed — safe to run db:migrate.');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
