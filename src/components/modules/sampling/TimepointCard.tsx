import React, { useEffect, useId, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDownIcon } from 'lucide-react';
import { InputField } from '../../ui/InputField';
import { CheckToggle } from '../../ui/CheckToggle';
import { TextAreaField } from '../../ui/TextAreaField';
import { Button } from '../../ui/Button';
import { addHoursToTime, crossesMidnight, isValidTime, nowTime, timeDeviation } from '../../../utils/dates';
import { imagePrefix, isTimepointComplete } from '../../../utils/sampling';
import type { TimepointDef } from '../../../data/timepoints';
import type { TimepointEntry } from '../../../types/crf';

interface TimepointCardProps {
  def: TimepointDef;
  entry: TimepointEntry;
  t0: string;
  readOnly: boolean;
  errors: Record<string, string>;
  onChange: (patch: Partial<TimepointEntry>) => void;
}

type CardState = 'complete' | 'deviation' | 'partial' | 'pending';

const PILL: Record<CardState, { label: string; cls: string }> = {
  complete: { label: 'Complete', cls: 'bg-ok-600 text-white' },
  deviation: { label: 'Deviation', cls: 'bg-warn-600 text-white' },
  partial: { label: 'In progress', cls: 'bg-brand-50 text-brand-700 ring-1 ring-brand-200' },
  pending: { label: 'Pending', cls: 'bg-canvas text-ink-muted ring-1 ring-line' },
};

const DOT: Record<CardState, string> = {
  complete: 'border-ok-600 bg-ok-600',
  deviation: 'border-warn-600 bg-warn-600',
  partial: 'border-brand-600 bg-white',
  pending: 'border-line-strong bg-white',
};

export function TimepointCard({ def, entry, t0, readOnly, errors, onChange }: TimepointCardProps) {
  const prefix = `tp.${def.key}`;
  const cardError = errors[prefix];
  const anyError = Object.keys(errors).some((k) => k === prefix || k.startsWith(`${prefix}.`));
  const [open, setOpen] = useState(false);
  const bodyId = useId();

  useEffect(() => {
    if (anyError) setOpen(true);
  }, [anyError]);

  const scheduled = t0 ? addHoursToTime(t0, def.hours) : '';
  const nextDay = t0 ? crossesMidnight(t0, def.hours) : false;
  const deviation = scheduled && isValidTime(entry.actual) ? timeDeviation(scheduled, entry.actual) : null;
  const deviated = deviation !== null && deviation > 10;
  const complete = isTimepointComplete(def, entry);
  const started = !!entry.actual || entry.blood || entry.salivaSwab || entry.salivaPaper;
  const state: CardState = complete ? (deviated ? 'deviation' : 'complete') : deviated ? 'deviation' : started ? 'partial' : 'pending';

  const cardTone = anyError
    ? 'border-danger-600 bg-white'
    : state === 'complete'
      ? 'border-ok-200 bg-ok-50'
      : state === 'deviation'
        ? 'border-warn-200 bg-warn-50'
        : 'border-line bg-white';

  return (
    <li className="relative pl-10" data-field="true" data-field-error={cardError ? 'true' : undefined}>
      <span
        aria-hidden="true"
        className={`absolute left-[9px] top-5 h-[18px] w-[18px] rounded-full border-[3px] ring-4 ring-canvas ${DOT[state]}`}
      />
      <div className={`rounded-2xl border transition-colors duration-200 ${cardTone}`}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-[64px] w-full items-center gap-3 rounded-2xl px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600"
        >
          <div className="w-16 shrink-0">
            <p className="text-lg font-semibold tabular-nums text-ink">{def.label}</p>
            {def.note && <p className="text-xs text-ink-muted">{def.note}</p>}
          </div>
          <div className="min-w-0 flex-1 text-sm">
            <p className="text-ink-soft">
              Scheduled <span className="font-semibold tabular-nums text-ink">{scheduled || '--:--'}</span>
              {nextDay && <span className="text-ink-muted"> +1d</span>}
            </p>
            <p className="text-ink-muted">
              Actual <span className="tabular-nums">{entry.actual || '—'}</span>
              {deviated && <span className="font-medium text-warn-700"> · {deviation} min off</span>}
            </p>
          </div>
          <span className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${PILL[state].cls}`}>{PILL[state].label}</span>
          <ChevronDownIcon className={`h-5 w-5 shrink-0 text-ink-muted transition-transform duration-200 ease-out ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
        {cardError && !open && <p className="px-4 pb-3 text-sm text-danger-700">{cardError}</p>}
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              id={bodyId}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
              className="overflow-hidden"
            >
              <div className="space-y-4 border-t border-line/70 px-4 py-4">
                {cardError && <p className="text-sm font-medium text-danger-700">{cardError}</p>}
                <InputField
                  id={`${prefix}-actual`}
                  label="Actual time taken"
                  kind="time"
                  value={entry.actual}
                  onChange={(v) => onChange({ actual: v })}
                  readOnly={readOnly}
                  error={errors[`${prefix}.actual`]}
                  warning={deviated ? `Deviates ${deviation} min from scheduled ${scheduled} — note the reason below` : undefined}
                  action={
                    <Button variant="secondary" onClick={() => onChange({ actual: nowTime() })}>
                      Now
                    </Button>
                  }
                />
                {!def.salivaOnly && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <CheckToggle label="Blood collected" description="1.5–2.0 mL in EDTA" checked={entry.blood} onChange={(v) => onChange({ blood: v })} readOnly={readOnly} />
                    <InputField
                      id={`${prefix}-bloodImg`}
                      label="Blotting-paper blood image ID"
                      kind="integer"
                      prefix={imagePrefix('BL', def.hours)}
                      placeholder="0000"
                      maxLength={4}
                      value={entry.bloodImg}
                      onChange={(v) => onChange({ bloodImg: v })}
                      readOnly={readOnly}
                      error={errors[`${prefix}.bloodImg`]}
                    />
                    <CheckToggle label="Plasma separated" description="Immediately after collection" checked={entry.plasma} onChange={(v) => onChange({ plasma: v })} readOnly={readOnly} />
                    <InputField
                      id={`${prefix}-plasmaImg`}
                      label="Plasma light-box image ID"
                      kind="integer"
                      prefix={imagePrefix('PL', def.hours)}
                      placeholder="0000"
                      maxLength={4}
                      value={entry.plasmaImg}
                      onChange={(v) => onChange({ plasmaImg: v })}
                      readOnly={readOnly}
                      error={errors[`${prefix}.plasmaImg`]}
                    />
                    <CheckToggle
                      label="Rifampicin stabilizer added"
                      description="Ascorbic acid / phosphate buffer"
                      checked={entry.stabilizer}
                      onChange={(v) => onChange({ stabilizer: v })}
                      readOnly={readOnly}
                    />
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <CheckToggle label="Saliva swab collected" checked={entry.salivaSwab} onChange={(v) => onChange({ salivaSwab: v })} readOnly={readOnly} />
                  <CheckToggle label="Saliva paper collected" checked={entry.salivaPaper} onChange={(v) => onChange({ salivaPaper: v })} readOnly={readOnly} />
                </div>
                <TextAreaField
                  id={`${prefix}-comments`}
                  label="Deviation / comments"
                  value={entry.comments}
                  onChange={(v) => onChange({ comments: v })}
                  readOnly={readOnly}
                  rows={2}
                  placeholder="e.g. sample missed, haemolysed, drawn late"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </li>
  );
}
