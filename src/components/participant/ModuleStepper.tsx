import React, { useEffect, useRef } from 'react';
import { CheckIcon, LockIcon } from 'lucide-react';
import { MODULES } from '../../data/modules';
import { getAccess, isPreviewOnly, lockReason } from '../../utils/gating';
import { formatTimestamp } from '../../utils/dates';
import type { ModuleAccess, ModuleId, Participant } from '../../types/crf';

interface ModuleStepperProps {
  participant: Participant;
  selected: ModuleId;
  onSelect: (id: ModuleId) => void;
  orientation: 'horizontal' | 'vertical';
}

function Indicator({ access, id }: { access: ModuleAccess; id: number }) {
  const base = 'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums';
  if (access === 'complete')
    return (
      <span className={`${base} bg-ok-600 text-white`}>
        <CheckIcon className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
      </span>
    );
  if (access === 'current') return <span className={`${base} bg-brand-600 text-white`}>{id}</span>;
  if (access === 'open') return <span className={`${base} border-2 border-brand-600 bg-white text-brand-700`}>{id}</span>;
  return (
    <span className={`${base} bg-lock-100 text-lock-500`}>
      <LockIcon className="h-3.5 w-3.5" aria-hidden="true" />
    </span>
  );
}

const STATE_TEXT: Record<ModuleAccess, string> = {
  complete: 'Completed',
  current: 'Current',
  open: 'Available anytime',
  locked: 'Locked',
};

export function ModuleStepper({ participant, selected, onSelect, orientation }: ModuleStepperProps) {
  const listRef = useRef<HTMLOListElement>(null);
  const itemRefs = useRef<Partial<Record<ModuleId, HTMLButtonElement | null>>>({});

  useEffect(() => {
    if (orientation !== 'horizontal') return;
    const list = listRef.current;
    const el = itemRefs.current[selected];
    if (!list || !el) return;
    list.scrollTo({ left: el.offsetLeft - list.clientWidth / 2 + el.clientWidth / 2, behavior: 'smooth' });
  }, [selected, orientation]);

  const items = MODULES.map((m) => ({ m, access: getAccess(participant, m.id) }));

  if (orientation === 'horizontal') {
    return (
      <nav aria-label="CRF modules">
        <ol ref={listRef} className="scrollbar-none flex gap-2 overflow-x-auto px-4 py-2.5">
          {items.map(({ m, access }) => {
            const isSel = m.id === selected;
            const locked = access === 'locked';
            return (
              <li key={m.id} className="shrink-0">
                <button
                  ref={(el) => {
                    itemRefs.current[m.id] = el;
                  }}
                  type="button"
                  onClick={() => onSelect(m.id)}
                  aria-current={isSel ? 'step' : undefined}
                  aria-label={`Module ${m.id}, ${m.short}: ${locked ? `${lockReason(participant, m.id)}, view only` : STATE_TEXT[access]}`}
                  className={`flex h-11 items-center gap-2 whitespace-nowrap rounded-full border pl-1.5 pr-3.5 text-sm font-medium transition-[background-color,border-color,color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 ${
                    isSel
                      ? 'border-brand-600 bg-brand-50 text-brand-800'
                      : locked
                        ? 'border-line bg-white text-lock-500 hover:border-line-strong'
                        : 'border-line bg-white text-ink-soft hover:border-line-strong'
                  }`}
                >
                  <Indicator access={access} id={m.id} />
                  {m.step}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
    );
  }

  return (
    <nav aria-label="CRF modules">
      <ol className="space-y-1">
        {items.map(({ m, access }) => {
          const isSel = m.id === selected;
          const locked = access === 'locked';
          const meta = participant.meta[m.id];
          const sub =
            access === 'complete'
              ? `Completed ${formatTimestamp(meta.completedAt).slice(0, 10)}${meta.editing ? ' · editing' : ''}`
              : locked || isPreviewOnly(participant, m.id)
                ? `${lockReason(participant, m.id)} · view only`
                : STATE_TEXT[access];
          return (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => onSelect(m.id)}
                aria-current={isSel ? 'step' : undefined}
                className={`flex min-h-[56px] w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 ${
                  isSel ? 'bg-white shadow-sm ring-1 ring-brand-200' : 'hover:bg-white'
                }`}
              >
                <Indicator access={access} id={m.id} />
                <span className="min-w-0">
                  <span className={`block truncate text-sm font-semibold ${locked ? 'text-lock-500' : isSel ? 'text-brand-800' : 'text-ink'}`}>
                    {m.id}. {m.short}
                  </span>
                  <span className={`block truncate text-xs ${access === 'complete' ? 'text-ok-700' : 'text-ink-muted'}`}>{sub}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
