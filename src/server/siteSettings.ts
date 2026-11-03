import { ApiError } from './errors';
import { reader, type Reads, type Tx } from './mongo/tx';
import { requireReason } from './staff';

/*
 * Site-wide switches the system administrator sets from System control:
 *  - maintenance mode: data entry is paused for everyone except the system administrator (reading still works);
 *  - an announcement banner shown to everyone signed in (for example "Server maintenance at 18:00").
 * One document, `app_settings/site`; every change is in the audit trail with its reason.
 */

export const SETTINGS_COLLECTION = 'app_settings';
const SITE_ID = 'site';

export interface SiteSettings {
  maintenance: { on: boolean; message: string; since: string | null; by: string };
  announcement: { text: string; tone: 'info' | 'warn'; until: string | null; by: string } | null;
}

interface SiteDoc {
  _id: string;
  maintenance_on: boolean;
  maintenance_message: string;
  maintenance_since: Date | null;
  maintenance_by: string;
  announcement_text: string;
  announcement_tone: 'info' | 'warn';
  announcement_until: Date | null;
  announcement_by: string;
}

const EMPTY: SiteSettings = { maintenance: { on: false, message: '', since: null, by: '' }, announcement: null };

function toSettings(d: SiteDoc | null): SiteSettings {
  if (!d) return EMPTY;
  const live = !!d.announcement_text && (!d.announcement_until || d.announcement_until.getTime() > Date.now());
  return {
    maintenance: { on: !!d.maintenance_on, message: d.maintenance_message ?? '', since: d.maintenance_since?.toISOString() ?? null, by: d.maintenance_by ?? '' },
    announcement: live ? { text: d.announcement_text, tone: d.announcement_tone ?? 'info', until: d.announcement_until?.toISOString() ?? null, by: d.announcement_by ?? '' } : null,
  };
}

export async function readSiteSettings(q: Reads = reader): Promise<SiteSettings> {
  return toSettings(await q.findOne<SiteDoc>(SETTINGS_COLLECTION, { _id: SITE_ID as never }));
}

// Every saving request checks maintenance mode, so the answer is kept for a few seconds.
let cached: { at: number; value: SiteSettings } | null = null;
export async function siteSettingsCached(): Promise<SiteSettings> {
  if (cached && Date.now() - cached.at < 5000) return cached.value;
  const value = await readSiteSettings().catch(() => EMPTY);
  cached = { at: Date.now(), value };
  return value;
}
export function forgetCachedSiteSettings() {
  cached = null;
}

const cleanText = (raw: unknown, max: number) => (typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, max) : '');

async function save(tx: Tx, set: Partial<SiteDoc>) {
  await tx.updateOne(SETTINGS_COLLECTION, { _id: SITE_ID as never }, { $set: set }, { upsert: true });
  forgetCachedSiteSettings();
}

/** Turns maintenance mode on or off. On: saving is refused for everyone but the system administrator. */
export async function setMaintenance(tx: Tx, actor: { name: string }, body: Record<string, unknown>): Promise<SiteSettings> {
  requireReason(body.reason);
  const on = body.on === true;
  const message = cleanText(body.message, 200);
  if (on && message.length < 5) throw new ApiError(400, 'Write a short message for the staff, e.g. "Back by 18:00"');
  await save(tx, { maintenance_on: on, maintenance_message: on ? message : '', maintenance_since: on ? new Date() : null, maintenance_by: on ? actor.name : '' });
  return readSiteSettings(tx);
}

/** Shows (or clears, with an empty text) a banner to everyone signed in, for `hours` hours (0 = until cleared). */
export async function setAnnouncement(tx: Tx, actor: { name: string }, body: Record<string, unknown>): Promise<SiteSettings> {
  const text = cleanText(body.text, 240);
  const hours = Number(body.hours ?? 0);
  if (!Number.isFinite(hours) || hours < 0 || hours > 24 * 30) throw new ApiError(400, 'Choose how long to show it (up to 30 days)');
  const tone = body.tone === 'warn' ? 'warn' : 'info';
  await save(tx, {
    announcement_text: text,
    announcement_tone: tone,
    announcement_until: text && hours > 0 ? new Date(Date.now() + hours * 3600 * 1000) : null,
    announcement_by: text ? actor.name : '',
  });
  return readSiteSettings(tx);
}
