'use client';

import React, { useEffect, useState } from 'react';
import { InfoIcon, TriangleAlertIcon, WrenchIcon } from 'lucide-react';

interface SiteState {
  maintenance: { message: string; since: string | null } | null;
  announcement: { text: string; tone: 'info' | 'warn'; until: string | null } | null;
}

/**
 * The announcement and maintenance notice set on System control, shown at the top of every signed-in page.
 * Checked when the page opens and every minute after.
 */
export function SiteBanner() {
  const [site, setSite] = useState<SiteState | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch('/api/site', { cache: 'no-store', credentials: 'same-origin' });
        if (res.ok && alive) setSite((await res.json()) as SiteState);
      } catch {
        /* keep the last answer */
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  if (!site?.maintenance && !site?.announcement) return null;
  return (
    <div className="sticky top-0 z-50 space-y-px">
      {site.maintenance && (
        <div role="alert" className="flex items-start gap-2.5 bg-warn-600 px-4 py-2.5 text-sm text-white">
          <WrenchIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p className="min-w-0 flex-1">
            <span className="font-semibold">Maintenance: saving is paused.</span> You can still view records. {site.maintenance.message}
          </p>
        </div>
      )}
      {site.announcement && (
        <div role="status" className={`flex items-start gap-2.5 px-4 py-2.5 text-sm ${site.announcement.tone === 'warn' ? 'bg-warn-100 text-warn-700' : 'bg-brand-600 text-white'}`}>
          {site.announcement.tone === 'warn' ? <TriangleAlertIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
          <p className="min-w-0 flex-1 break-words">{site.announcement.text}</p>
        </div>
      )}
    </div>
  );
}
