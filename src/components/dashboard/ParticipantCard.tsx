import React from 'react';
import Link from 'next/link';
import { ChevronRightIcon } from 'lucide-react';
import { StatusBadge } from '../ui/StatusBadge';
import { completedCount, getCurrentModule, getModuleDef, isRecordLocked } from '../../utils/gating';
import { formatDMY } from '../../utils/dates';
import type { Participant, ParticipantStatus } from '../../types/crf';

const BAR: Record<ParticipantStatus, string> = {
  in_progress: 'bg-brand-600',
  completed: 'bg-ok-600',
  ineligible: 'bg-danger-600',
  discontinued: 'bg-lock-500',
};

export function ParticipantCard({ participant, status }: { participant: Participant; status: ParticipantStatus }) {
  const done = completedCount(participant);
  const next = getModuleDef(getCurrentModule(participant));
  const closed = isRecordLocked(participant);
  const m1 = participant.data.m1;

  return (
    <Link
      href={`/p/${participant.uid}`}
      className="group block rounded-2xl border border-line bg-white p-4 transition-[border-color,box-shadow] duration-150 hover:border-brand-200 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold tabular-nums text-ink">{m1.participantId || 'New participant'}</p>
          <p className="text-sm text-ink-muted">Screened {m1.screeningDate ? formatDMY(m1.screeningDate) : '—'}</p>
        </div>
        <StatusBadge status={status} />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-sm text-ink">
          {closed ? (
            <span className="text-ink-muted">Record closed {formatDMY(participant.data.m10.date)}</span>
          ) : (
            <>
              <span className="text-ink-muted">Next:</span> <span className="font-medium">Module {next.id} – {next.short}</span>
            </>
          )}
        </p>
        <ChevronRightIcon className="h-5 w-5 shrink-0 text-ink-muted transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <div
          className="h-2 flex-1 overflow-hidden rounded-full bg-canvas"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={10}
          aria-valuenow={done}
          aria-label="Modules completed"
        >
          <div className={`h-full rounded-full ${BAR[status]}`} style={{ width: `${(done / 10) * 100}%` }} />
        </div>
        <span className="text-sm font-semibold tabular-nums text-ink-soft">{done}/10</span>
      </div>
    </Link>
  );
}
