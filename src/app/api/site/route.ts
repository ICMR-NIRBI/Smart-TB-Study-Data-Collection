import { NextResponse } from 'next/server';
import { getSessionUser } from '../../../server/auth';
import { siteSettingsCached } from '../../../server/siteSettings';

/** The announcement banner and maintenance mode, for everyone signed in (the app checks it every minute). */
export async function GET() {
  const user = await getSessionUser().catch(() => null);
  if (!user) return NextResponse.json({ maintenance: null, announcement: null, demo: false }, { headers: { 'Cache-Control': 'no-store' } });
  const site = await siteSettingsCached();
  return NextResponse.json(
    { maintenance: site.maintenance.on ? { message: site.maintenance.message, since: site.maintenance.since } : null, announcement: site.announcement, demo: site.demo.on },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
