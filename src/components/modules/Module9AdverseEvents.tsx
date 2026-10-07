import React from 'react';
import { PlusIcon, ShieldCheckIcon } from 'lucide-react';
import { Button } from '../ui/Button';
import { CheckToggle } from '../ui/CheckToggle';
import { AdverseEventCard } from './safety/AdverseEventCard';
import { emptyAdverseEvent } from '../../utils/participant';
import type { AdverseEvent, ModuleProps } from '../../types/crf';

export function Module9AdverseEvents({ data, update, readOnly, errors }: ModuleProps<'m9'>) {
  const saeCount = data.events.filter((e) => e.sae === 'yes').length;

  const updateEvent = (id: string, patch: Partial<AdverseEvent>) =>
    update({ events: data.events.map((ev) => (ev.id === id ? { ...ev, ...patch } : ev)) });
  const removeEvent = (id: string) => update({ events: data.events.filter((ev) => ev.id !== id) });
  const addEvent = () => update({ events: [...data.events, emptyAdverseEvent()], noEvents: false });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-soft">
        <span>
          <span className="font-semibold tabular-nums text-ink">{data.events.length}</span> event{data.events.length === 1 ? '' : 's'} logged
        </span>
        {saeCount > 0 && (
          <span className="font-semibold text-danger-700">
            {saeCount} SAE{saeCount === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {errors.events && (
        <p className="rounded-xl bg-danger-50 px-3 py-2 text-sm font-medium text-danger-700" data-field="true" data-field-error="true">
          {errors.events}
        </p>
      )}

      {data.events.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line-strong bg-white px-4 py-6 text-center">
          <ShieldCheckIcon className="mx-auto h-8 w-8 text-ink-muted" aria-hidden="true" />
          <p className="mt-2 font-medium text-ink">No adverse events logged</p>
          <p className="text-sm text-ink-muted">Add an event, or confirm there are none to complete this log.</p>
        </div>
      )}

      {data.events.map((ev, i) => (
        <AdverseEventCard
          key={ev.id}
          index={i}
          event={ev}
          readOnly={readOnly}
          errors={errors}
          onChange={(patch) => updateEvent(ev.id, patch)}
          onRemove={() => removeEvent(ev.id)}
        />
      ))}

      {!readOnly && (
        <Button variant="secondary" icon={<PlusIcon className="h-5 w-5" aria-hidden="true" />} onClick={addEvent} className="w-full">
          Add adverse event
        </Button>
      )}

      {data.events.length === 0 && (
        <CheckToggle
          label="No adverse events"
          description="Confirm no adverse drug reactions occurred during the study period"
          checked={data.noEvents}
          onChange={(v) => update({ noEvents: v })}
          readOnly={readOnly}
        />
      )}
    </div>
  );
}
