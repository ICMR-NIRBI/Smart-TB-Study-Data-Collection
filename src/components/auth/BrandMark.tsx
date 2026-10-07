import React, { useId } from 'react';

interface BrandMarkProps {
  tone?: 'dark' | 'light';
}

export function BrandMark({ tone = 'dark' }: BrandMarkProps) {
  const gid = useId().replace(/:/g, '');
  const dark = tone === 'dark';
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 40 40" className="h-10 w-10 shrink-0" aria-hidden="true">
        <defs>
          <linearGradient id={`bm-${gid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#00684A" />
            <stop offset="100%" stopColor="#00C46A" />
          </linearGradient>
        </defs>
        <rect width="40" height="40" rx="11" fill={`url(#bm-${gid})`} />
        <path d="M7 30 L7 10" stroke="#E9FBF1" strokeOpacity="0.45" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M7 30 L33 30" stroke="#E9FBF1" strokeOpacity="0.45" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M8 29 C 11 18, 12.5 11, 15.5 11 C 19 11, 21 22, 33 26" fill="none" stroke="#FFFFFF" strokeWidth="2.6" strokeLinecap="round" />
        <circle cx="15.5" cy="11" r="2.4" fill="#B8F5D3" />
        <path d="M8 24 L33 24" stroke="#B8F5D3" strokeWidth="1.2" strokeDasharray="2 2.2" />
      </svg>
      <div className="leading-none">
        <span className={`block text-[20px] font-bold tracking-tight ${dark ? 'text-forest-900' : 'text-white'}`}>
          SMART<span className={dark ? 'text-forest-600' : 'text-forest-300'}>-TB</span>
        </span>
        <span className={`mt-1 block text-[10.5px] font-semibold uppercase tracking-[0.16em] ${dark ? 'text-ink-muted' : 'text-white/70'}`}>
          Clinical Data Platform
        </span>
      </div>
    </div>
  );
}
