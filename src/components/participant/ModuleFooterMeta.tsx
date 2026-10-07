import React from 'react';
import { HistoryIcon, UserCheckIcon } from 'lucide-react';
import { formatTimestamp } from '../../utils/dates';
import type { ModuleMeta } from '../../types/crf';

export function ModuleFooterMeta({ meta }: { meta: ModuleMeta }) {
  if (!meta.completed && !meta.draftSavedAt && meta.edits.length === 0) return null;
  return (
    <footer className="mt-6 space-y-3 border-t border-line pt-4 text-sm text-ink-soft">
      {meta.completed ? (
        <p className="flex items-start gap-2">
          <UserCheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-ok-600" aria-hidden="true" />
          <span>
            Completed by <strong className="text-ink">{meta.completedBy}</strong> ({meta.completedRole}) on{' '}
            <span className="tabular-nums">{formatTimestamp(meta.completedAt)}</span>
          </span>
        </p>
      ) : (
        meta.draftSavedAt && <p className="text-ink-muted">Draft saved on this device · {formatTimestamp(meta.draftSavedAt)}</p>
      )}
      {meta.edits.length > 0 && (
        <div>
          <p className="mb-1.5 flex items-center gap-2 font-medium text-ink">
            <HistoryIcon className="h-4 w-4 text-ink-muted" aria-hidden="true" />
            Edit audit trail
          </p>
          <ul className="space-y-1.5 border-l-2 border-line pl-3">
            {meta.edits.map((e, i) => (
              <li key={`${e.at}-${i}`}>
                <span className="tabular-nums text-ink-muted">{formatTimestamp(e.at)}</span> · {e.by} ({e.role})
                <span className="block text-ink">“{e.reason}”</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </footer>
  );
}
