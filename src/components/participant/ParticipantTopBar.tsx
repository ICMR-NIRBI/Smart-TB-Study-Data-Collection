import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeftIcon, MoreVerticalIcon, ShieldAlertIcon, UserXIcon } from 'lucide-react';
import { StatusBadge } from '../ui/StatusBadge';
import type { ParticipantStatus } from '../../types/crf';

interface ParticipantTopBarProps {
  participantId: string;
  status: ParticipantStatus;
  progress: number;
  canReportAe: boolean;
  canDiscontinue: boolean;
  onReportAe: () => void;
  onDiscontinue: () => void;
}

export function ParticipantTopBar({ participantId, status, progress, canReportAe, canDiscontinue, onReportAe, onDiscontinue }: ParticipantTopBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-30 h-14 border-b border-line bg-white">
      <div className="mx-auto flex h-full max-w-6xl items-center gap-1 px-2 lg:px-6">
        <Link
          href="/"
          aria-label="Back to dashboard"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink transition-colors duration-150 hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
        >
          <ArrowLeftIcon className="h-5 w-5" aria-hidden="true" />
        </Link>
        <div className="min-w-0 flex-1 pl-1">
          <h1 className="truncate font-semibold tabular-nums text-ink">{participantId || 'New participant'}</h1>
          <p className="truncate text-xs text-ink-muted">{progress}/10 modules complete</p>
        </div>
        <div className="mr-1 hidden sm:block">
          <StatusBadge status={status} />
        </div>
        <button
          type="button"
          onClick={onReportAe}
          disabled={!canReportAe}
          aria-label="Report adverse event"
          className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-danger-200 bg-white px-3 text-sm font-semibold text-danger-700 transition-colors duration-150 hover:bg-danger-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ShieldAlertIcon className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Report adverse event</span>
          <span className="sm:hidden">AE</span>
        </button>
        <div ref={menuRef} className="relative">
          <button
            type="button"
            aria-label="More actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
            className="flex h-11 w-11 items-center justify-center rounded-full text-ink transition-colors duration-150 hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
          >
            <MoreVerticalIcon className="h-5 w-5" aria-hidden="true" />
          </button>
          {menuOpen && (
            <div role="menu" className="absolute right-0 top-12 z-40 w-64 rounded-2xl border border-line bg-white p-1.5 shadow-lg">
              <button
                type="button"
                role="menuitem"
                disabled={!canDiscontinue}
                onClick={() => {
                  setMenuOpen(false);
                  onDiscontinue();
                }}
                className="flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-danger-700 transition-colors duration-150 hover:bg-danger-50 disabled:cursor-not-allowed disabled:text-ink-muted disabled:hover:bg-transparent"
              >
                <UserXIcon className="h-5 w-5" aria-hidden="true" />
                <span>
                  Discontinue participant
                  {!canDiscontinue && <span className="block text-xs font-normal text-ink-muted">Not available for this record</span>}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
