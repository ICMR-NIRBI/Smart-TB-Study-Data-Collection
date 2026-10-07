import React from 'react';
import { getVisitWindows } from '../../utils/gating';
import { formatShortDM } from '../../utils/dates';

const STATE_CLS = {
  open: 'border-brand-200 bg-brand-50 text-brand-800',
  upcoming: 'border-line bg-white text-ink-soft',
  past: 'border-line bg-canvas text-ink-muted',
};

export function VisitWindowChips({ startDate }: { startDate: string }) {
  const windows = getVisitWindows(startDate);
  if (windows.length === 0) return null;
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-ink-muted">Visit windows from treatment start</p>
      <ul className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0">
        {windows.map((w) => (
          <li key={w.key} className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs ${STATE_CLS[w.state]}`}>
            <span className="font-semibold">
              {w.label} · D{w.fromDay}–{w.toDay}
            </span>{' '}
            <span className="tabular-nums">
              {formatShortDM(w.from)}–{formatShortDM(w.to)}
            </span>
            {w.state === 'open' && <span className="ml-1 font-semibold">· open now</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
