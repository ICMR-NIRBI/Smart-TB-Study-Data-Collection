import { existsSync, readFileSync, readdirSync, statSync, statfsSync } from 'node:fs';
import { freemem, loadavg, totalmem, uptime as osUptime } from 'node:os';
import { join } from 'node:path';
import { uploadDir } from './images';
import { getDb } from './mongo/client';
import { SYSTEM_LOG_COLLECTION } from './mongo/schema';
import { reader } from './mongo/tx';
import { readSiteSettings } from './siteSettings';

/*
 * The health tiles on System control. Each check says OK, needs attention, or a problem, in plain words, so the
 * system administrator sees at a glance what is wrong before anyone reports it. Read-only: nothing here changes anything.
 */

export type HealthState = 'ok' | 'warn' | 'bad' | 'unknown';
export interface HealthCheck {
  key: string;
  label: string;
  state: HealthState;
  value: string;
  detail: string;
}
export interface Health {
  checks: HealthCheck[];
  counts: { accounts: number; activeAccounts: number; participants: number; photos: number; auditEntries: number };
  app: { version: string; startedAt: string; serverTime: string; node: string };
}

const HOUR = 3600 * 1000;
export const backupDir = () => process.env.SMARTTB_BACKUP_DIR ?? '/opt/smarttb/backups';
const pullStateDir = () => process.env.SMARTTB_PULL_STATE_DIR ?? '/var/lib/smarttb-pull';
const STARTED = new Date();

const ago = (ms: number) => {
  const m = Math.round(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
};
const size = (bytes: number) => (bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : bytes >= 1024 ** 2 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`);

/** The deployed commit, read from the app folder's git data (no git command needed). */
function appVersion(): string {
  try {
    const git = join(process.cwd(), '.git');
    const head = readFileSync(join(git, 'HEAD'), 'utf8').trim();
    if (/^[0-9a-f]{40}$/.test(head)) return head.slice(0, 7);
    const ref = head.replace(/^ref:\s*/, '');
    if (existsSync(join(git, ref))) return readFileSync(join(git, ref), 'utf8').trim().slice(0, 7);
    const packed = readFileSync(join(git, 'packed-refs'), 'utf8').split('\n').find((l) => l.endsWith(` ${ref}`));
    return packed ? packed.slice(0, 7) : 'unknown';
  } catch {
    return 'unknown';
  }
}

function newestFile(dir: string, pattern: RegExp): { name: string; at: number; bytes: number; count: number } | null {
  const files = readdirSync(dir).filter((f) => pattern.test(f));
  if (!files.length) return null;
  let best = { name: '', at: 0, bytes: 0 };
  for (const f of files) {
    const st = statSync(join(dir, f));
    if (st.mtimeMs > best.at) best = { name: f, at: st.mtimeMs, bytes: st.size };
  }
  return { ...best, count: files.length };
}

/** Every photo file kept on disk (originals only), with its time. */
function photoFiles(): { path: string; at: number }[] {
  const root = uploadDir();
  if (!existsSync(root)) return [];
  const out: { path: string; at: number }[] = [];
  for (const dir of readdirSync(root)) {
    const full = join(root, dir);
    if (!statSync(full).isDirectory()) continue;
    for (const f of readdirSync(full)) {
      if (f.endsWith('.tmp') || f.endsWith('.thumb.jpg')) continue;
      out.push({ path: `${dir}/${f}`, at: statSync(join(full, f)).mtimeMs });
    }
  }
  return out;
}

export async function systemHealth(): Promise<Health> {
  const checks: HealthCheck[] = [];
  const now = Date.now();

  // Database
  let dbOk = false;
  try {
    const t0 = Date.now();
    await getDb().command({ ping: 1 });
    dbOk = true;
    const ms = Date.now() - t0;
    checks.push({ key: 'database', label: 'Database', state: ms > 1000 ? 'warn' : 'ok', value: 'Working', detail: `Answered in ${ms} ms` });
  } catch (err) {
    checks.push({ key: 'database', label: 'Database', state: 'bad', value: 'Not responding', detail: (err as Error).message.slice(0, 160) });
  }

  // Disk space where the data, photos and backups are kept
  try {
    const target = existsSync('/opt/smarttb') ? '/opt/smarttb' : process.cwd();
    const fs = statfsSync(target);
    const free = fs.bavail * fs.bsize;
    const total = fs.blocks * fs.bsize;
    const pct = total ? (free / total) * 100 : 0;
    checks.push({ key: 'disk', label: 'Disk space', state: pct < 5 ? 'bad' : pct < 15 ? 'warn' : 'ok', value: `${size(free)} free`, detail: `${pct.toFixed(0)}% of ${size(total)}` });
  } catch {
    checks.push({ key: 'disk', label: 'Disk space', state: 'unknown', value: 'Not visible', detail: '' });
  }

  // Database backups (hourly)
  let newestImages: { at: number } | null = null;
  let backupsVisible = false;
  try {
    const db = newestFile(backupDir(), /^smarttb-2\d{7}T\d{6}Z\.dump\.enc$/);
    newestImages = newestFile(backupDir(), /^smarttb-images-\d{8}T\d{6}Z\.dump\.enc$/);
    backupsVisible = true;
    if (!db) checks.push({ key: 'backup', label: 'Database backup', state: 'bad', value: 'None yet', detail: 'No backup file found' });
    else {
      const age = now - db.at;
      checks.push({
        key: 'backup',
        label: 'Database backup',
        state: age > 3 * HOUR ? 'bad' : age > 1.5 * HOUR ? 'warn' : 'ok',
        value: ago(age),
        detail: `${size(db.bytes)} · ${db.count} kept on the server`,
      });
    }
  } catch {
    checks.push({ key: 'backup', label: 'Database backup', state: 'unknown', value: 'Not visible', detail: `Backups are not readable from here (${backupDir()})` });
  }

  // Photos: every photo should be in an hourly photo archive within about an hour
  const photos = photoFiles();
  try {
    if (!backupsVisible) throw new Error('backups not visible');
    const since = newestImages?.at ?? 0;
    const waiting = photos.filter((p) => p.at > since);
    const overdue = waiting.filter((p) => now - p.at > 2 * HOUR);
    checks.push({
      key: 'photos',
      label: 'Photo backup',
      state: overdue.length ? 'bad' : 'ok',
      value: !photos.length ? 'No photos yet' : waiting.length ? `${waiting.length} waiting` : 'All archived',
      detail: overdue.length
        ? `${overdue.length} photo(s) not archived for over 2 hours`
        : newestImages
          ? `Last photo archive ${ago(now - newestImages.at)}`
          : photos.length
            ? 'First photo archive is due within the hour'
            : '',
    });
  } catch {
    checks.push({ key: 'photos', label: 'Photo backup', state: 'unknown', value: 'Not visible', detail: '' });
  }

  // Photo records whose file is missing on disk
  if (dbOk) {
    const docs = await reader.find<{ file: string }>('crf_images', {}, { projection: { file: 1 }, limit: 20000 });
    const missing = docs.filter((d) => !existsSync(join(uploadDir(), d.file))).length;
    checks.push({
      key: 'photoFiles',
      label: 'Photo files',
      state: missing ? 'bad' : 'ok',
      value: missing ? `${missing} missing` : `${docs.length} present`,
      detail: missing ? 'Restore them from the photo backups (operations guide, section 6)' : 'Every photo record has its file',
    });
  }

  // The desktop copy (the restricted download account notes its last download)
  try {
    // The desktop lists the backups every hour and downloads the new ones; the newer of the two is when it last checked in.
    const seen = ['last-list', 'last-download'].map((f) => join(pullStateDir(), f)).filter((f) => existsSync(f)).map((f) => statSync(f).mtimeMs);
    if (!seen.length) {
      checks.push({ key: 'desktop', label: 'Desktop copy', state: 'unknown', value: 'Not seen yet', detail: 'Shown after the desktop next checks in for backups' });
    } else {
      const age = now - Math.max(...seen);
      checks.push({
        key: 'desktop',
        label: 'Desktop copy',
        state: age > 72 * HOUR ? 'bad' : age > 24 * HOUR ? 'warn' : 'ok',
        value: `Checked in ${ago(age)}`,
        detail: age > 24 * HOUR ? 'Is the desktop on and signed in? The server keeps 3 days.' : 'The desktop is keeping its copy up to date',
      });
    }
  } catch {
    checks.push({ key: 'desktop', label: 'Desktop copy', state: 'unknown', value: 'Not visible', detail: '' });
  }

  // Errors in the last 24 hours, and sign-ins locked right now
  if (dbOk) {
    const dayAgo = new Date(now - 24 * HOUR);
    const errors = await reader.count(SYSTEM_LOG_COLLECTION, { kind: { $in: ['SERVER_ERROR', 'CLIENT_ERROR'] }, at: { $gte: dayAgo } });
    checks.push({ key: 'errors', label: 'Errors (24 h)', state: errors ? 'warn' : 'ok', value: errors ? `${errors}` : 'None', detail: errors ? 'See Errors in the logs below' : '' });
    const locked = await reader.count('login_attempts', { locked_until: { $gt: new Date() } });
    checks.push({ key: 'locked', label: 'Locked sign-ins', state: locked ? 'warn' : 'ok', value: locked ? `${locked}` : 'None', detail: locked ? 'Unlock under Account rescue if they are genuine' : '' });
    const site = await readSiteSettings();
    if (site.maintenance.on) checks.push({ key: 'maintenance', label: 'Maintenance mode', state: 'warn', value: 'On', detail: 'Staff cannot save until it is turned off' });
  }

  // The server itself
  const mem = (1 - freemem() / totalmem()) * 100;
  checks.push({
    key: 'server',
    label: 'Server',
    state: mem > 92 ? 'warn' : 'ok',
    value: `Up ${ago(osUptime() * 1000).replace(' ago', '')}`,
    detail: `Memory ${mem.toFixed(0)}% used · load ${loadavg()[0].toFixed(2)}`,
  });

  const counts = dbOk
    ? {
        accounts: await reader.count('app_users'),
        activeAccounts: await reader.count('app_users', { active: true }),
        participants: await reader.count('participants'),
        photos: await reader.count('crf_images', { replaced_at: null }),
        auditEntries: await reader.count('audit_log'),
      }
    : { accounts: 0, activeAccounts: 0, participants: 0, photos: 0, auditEntries: 0 };

  return { checks, counts, app: { version: appVersion(), startedAt: STARTED.toISOString(), serverTime: new Date().toISOString(), node: process.version } };
}
