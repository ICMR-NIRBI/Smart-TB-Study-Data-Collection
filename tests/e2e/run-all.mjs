// Runs every end-to-end suite against a local test server and prints one line per suite.
//   npm run test:e2e                 starts its own server on port 3100, runs everything, stops it
//   npm run test:e2e -- roles invites   runs only the suites whose names contain one of the words
//   BASE=http://localhost:3000 npm run test:e2e   uses a server that is already running (not started or stopped here)
//   The MongoDB addresses come from .env.mongo.local (made by npm run db:bootstrap and db:setup).
// The suites create accounts and participants, so this only ever runs against localhost and the local test database.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const external = !!process.env.BASE;
const BASE = process.env.BASE ?? 'http://localhost:3100';
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error(`Refusing to run against ${BASE}: the suites create test accounts, so only localhost is allowed.`);
  process.exit(2);
}

const wanted = process.argv.slice(2);
const suites = readdirSync(here)
  .filter((f) => /^e2e-.*\.mjs$/.test(f))
  .filter((f) => !wanted.length || wanted.some((w) => f.includes(w)))
  .sort();
if (!suites.length) {
  console.error('No suite matches.');
  process.exit(2);
}

// MongoDB is the database. E2E_DB=postgres only exists for a reference run against an old checkout of the PostgreSQL version.
const mongo = process.env.E2E_DB !== 'postgres';
/** KEY=value lines of an env file (the app itself reads .env.local; MongoDB's addresses live in a second file). */
const readEnv = (file) =>
  existsSync(join(root, file))
    ? Object.fromEntries(readFileSync(join(root, file), 'utf8').split(/\r?\n/).map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2]]))
    : {};
const dbEnv = mongo ? readEnv('.env.mongo.local') : {};
const envFiles = mongo ? ['--env-file=.env.local', '--env-file=.env.mongo.local'] : ['--env-file=.env.local'];

let server = null;
if (!external) {
  // Production-like gating: modules open in sequence, as on the live server.
  // Found by walking up from the project folder, so a checkout nested inside another project works too.
  const nextBin = createRequire(join(root, 'package.json')).resolve('next/dist/bin/next');
  server = spawn(process.execPath, ['--require', './scripts/exfat-readlink-fix.cjs', nextBin, 'dev', '-p', '3100'], {
    cwd: root,
    env: { ...process.env, ...dbEnv, NEXT_PUBLIC_CRF_PREVIEW: 'false' },
    stdio: 'ignore',
  });
}
const stop = () => {
  if (!server?.pid) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
  else server.kill('SIGTERM');
};
process.on('exit', stop);

async function waitUntilUp() {
  for (let i = 0; i < 90; i++) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

if (!(await waitUntilUp())) {
  console.error(`The server at ${BASE} did not come up.`);
  stop();
  process.exit(2);
}

let failed = 0;
for (const file of suites) {
  const started = Date.now();
  const run = spawnSync(process.execPath, [...envFiles, join(here, file)], { cwd: root, env: { ...process.env, BASE }, encoding: 'utf8' });
  const out = `${run.stdout ?? ''}${run.stderr ?? ''}`;
  const summary = out.match(/(\d+) passed, (\d+) failed/);
  const ok = run.status === 0 && summary && summary[2] === '0';
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${file.padEnd(22)} ${summary ? `${summary[1]} passed, ${summary[2]} failed` : 'did not finish'}  (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  if (!ok) console.log(out.split('\n').filter((l) => /^FAIL|Error|error/.test(l)).slice(0, 10).join('\n'));
}

stop();
console.log(failed ? `\n${failed} suite(s) failed` : '\nAll suites passed');
process.exit(failed ? 1 : 0);
