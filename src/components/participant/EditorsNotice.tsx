import React from 'react';
import { UsersIcon } from 'lucide-react';
import type { LiveEditor } from '../../contexts/useLiveSync';
import type { ModuleId } from '../../types/crf';

/**
 * Who else has this participant open for entry right now. Amber when someone is in the same module (two people
 * typing into one module can overwrite each other's fields); otherwise a quiet line with a link to their module.
 */
export function EditorsNotice({ editors, selected, onOpen }: { editors: LiveEditor[]; selected: ModuleId; onOpen: (id: ModuleId) => void }) {
  if (!editors.length) return null;
  const same = editors.filter((e) => e.module === selected);
  const elsewhere = editors.filter((e) => e.module !== selected);
  return (
    <div className="space-y-2 motion-safe:animate-fade-in" role="status" aria-live="polite">
      {same.length > 0 && (
        <p className="flex items-start gap-2 rounded-xl border border-warn-200 bg-warn-50 px-3 py-2.5 text-sm text-warn-700">
          <UsersIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-semibold">{same.map((e) => `${e.name} (${e.role})`).join(', ')}</span> {same.length === 1 ? 'is' : 'are'} also entering this module.
            Agree who fills which fields: the last one saved is kept, and you will be warned if yours is changed.
          </span>
        </p>
      )}
      {elsewhere.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
          <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full rounded-full bg-brand-500 opacity-60 motion-safe:animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-600" />
          </span>
          Also working on this participant:
          {elsewhere.map((e) => (
            <button
              key={e.userId}
              type="button"
              onClick={() => onOpen(e.module as ModuleId)}
              className="rounded-full border border-line bg-white px-2 py-0.5 font-medium text-brand-700 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
            >
              {e.name} · Module {e.module}
            </button>
          ))}
        </p>
      )}
    </div>
  );
}
