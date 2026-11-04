'use client';

import React, { useEffect, useState } from 'react';
import { EyeIcon, InfoIcon, TriangleAlertIcon, WrenchIcon } from 'lucide-react';
import { setDemoMode } from '../../hooks/usePreviewMode';

interface SiteState {
  maintenance: { message: string; since: string | null } | null;
  announcement: { text: string; tone: 'info' | 'warn'; until: string | null } | null;
  demo?: boolean;
}

/**
 * The announcement, maintenance notice and demo-mode notice set on System control, shown at the top of every signed-in page.
 * Also passes the demo-mode switch on to the module pages.
 * Checked when the page opens and every minute after.
 */
export function SiteBanner() {
  const [site, setSite] = useState<SiteState | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch('/api/site', { cache: 'no-store', credentials: 'same-origin' });
        if (res.ok && alive) {
          const next = (await res.json()) as SiteState;
          setSite(next);
          setDemoMode(next.demo === true);
        }
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

  if (!site?.maintenance && !site?.announcement && !site?.demo) return null;
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
      {site.demo && (
        <div role="status" className="flex items-start gap-2.5 bg-brand-50 px-4 py-2 text-sm text-brand-800">
          <EyeIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p className="min-w-0 flex-1">
            <span className="font-semibold">Demo mode:</span> every module can be opened and stepped through. Saving and locking work as usual.
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
