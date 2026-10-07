import React from 'react';
import type { ParticipantStatus } from '../../types/crf';

const STATUS: Record<ParticipantStatus, { label: string; cls: string; dot: string }> = {
  in_progress: { label: 'In progress', cls: 'border-warn-200 bg-warn-50 text-warn-700', dot: 'bg-warn-600' },
  completed: { label: 'Completed', cls: 'border-ok-200 bg-ok-50 text-ok-700', dot: 'bg-ok-600' },
  ineligible: { label: 'Ineligible', cls: 'border-danger-200 bg-danger-50 text-danger-700', dot: 'bg-danger-600' },
  discontinued: { label: 'Discontinued', cls: 'border-lock-300 bg-lock-100 text-lock-600', dot: 'bg-lock-500' },
};

export function statusLabel(status: ParticipantStatus): string {
  return STATUS[status].label;
}

export function StatusBadge({ status }: { status: ParticipantStatus }) {
  const s = STATUS[status];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${s.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden="true" />
      {s.label}
    </span>
  );
}
