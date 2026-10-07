import React from 'react';
import { Trash2Icon } from 'lucide-react';
import { InputField } from '../../ui/InputField';
import { ChoiceField } from '../../ui/ChoiceField';
import { CheckToggle } from '../../ui/CheckToggle';
import { Alert } from '../../ui/Alert';
import { YES_NO } from '../../../data/options';
import type { AdverseEvent } from '../../../types/crf';

interface AdverseEventCardProps {
  index: number;
  event: AdverseEvent;
  readOnly: boolean;
  errors: Record<string, string>;
  onChange: (patch: Partial<AdverseEvent>) => void;
  onRemove: () => void;
}

export function AdverseEventCard({ index, event, readOnly, errors, onChange, onRemove }: AdverseEventCardProps) {
  const k = (field: string) => errors[`ae.${event.id}.${field}`];
  const idp = `ae-${event.id}`;
  const isSae = event.sae === 'yes';

  return (
    <article className={`rounded-2xl border bg-white ${isSae ? 'border-danger-200' : 'border-line'}`} aria-labelledby={`${idp}-title`}>
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-ink-muted">Adverse event {index + 1}</p>
          <h3 id={`${idp}-title`} className="truncate font-semibold text-ink">
            {event.term || 'Untitled event'}
          </h3>
        </div>
        {isSae && <span className="shrink-0 rounded-md bg-danger-600 px-2 py-1 text-xs font-bold text-white">SAE</span>}
        {event.grade && (
          <span className="shrink-0 rounded-md bg-canvas px-2 py-1 text-xs font-semibold text-ink-soft ring-1 ring-line">Grade {event.grade}</span>
        )}
        {!readOnly && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove adverse event ${index + 1}`}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors duration-150 hover:bg-danger-50 hover:text-danger-700"
          >
            <Trash2Icon className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
      </header>
      <div className="space-y-4 p-4">
        <InputField id={`${idp}-term`} label="AE term" value={event.term} onChange={(v) => onChange({ term: v })} placeholder="e.g. Drug-induced hepatitis" required readOnly={readOnly} error={k('term')} />
        <div className="grid grid-cols-2 gap-4">
          <InputField id={`${idp}-start`} label="Start date" kind="date" value={event.startDate} onChange={(v) => onChange({ startDate: v })} required readOnly={readOnly} error={k('startDate')} />
          {event.ongoing ? (
            <div className="flex flex-col justify-end">
              <p className="mb-1.5 text-sm font-medium text-ink">Stop date</p>
              <p className="flex min-h-[48px] items-center rounded-xl border border-line bg-canvas px-3 text-ink-muted">Ongoing</p>
            </div>
          ) : (
            <InputField id={`${idp}-stop`} label="Stop date" kind="date" value={event.stopDate} onChange={(v) => onChange({ stopDate: v })} required readOnly={readOnly} error={k('stopDate')} />
          )}
        </div>
        <CheckToggle label="Event ongoing" checked={event.ongoing} onChange={(v) => onChange({ ongoing: v, stopDate: v ? '' : event.stopDate })} readOnly={readOnly} />
        <ChoiceField
          id={`${idp}-grade`}
          label="Severity (CTCAE grade)"
          options={[
            { value: '1', label: '1' },
            { value: '2', label: '2' },
            { value: '3', label: '3', tone: 'warn' },
            { value: '4', label: '4', tone: 'danger' },
          ]}
          value={event.grade}
          onChange={(v) => onChange({ grade: v })}
          required
          readOnly={readOnly}
          error={k('grade')}
        />
        <ChoiceField
          id={`${idp}-rel`}
          label="Relationship to anti-TB drugs"
          options={[
            { value: 'definite', label: 'Definite' },
            { value: 'probable', label: 'Probable' },
            { value: 'possible', label: 'Possible' },
            { value: 'unlikely', label: 'Unlikely' },
          ]}
          value={event.relationship}
          onChange={(v) => onChange({ relationship: v })}
          columns={2}
          required
          readOnly={readOnly}
          error={k('relationship')}
        />
        <ChoiceField
          id={`${idp}-sae`}
          label="Serious adverse event (SAE)"
          options={YES_NO.map((o) => (o.value === 'yes' ? { ...o, tone: 'danger' as const } : o))}
          value={event.sae}
          onChange={(v) => onChange({ sae: v })}
          required
          readOnly={readOnly}
          error={k('sae')}
        />
        {isSae && (
          <Alert tone="danger" title="Report this SAE within 24 hours">
            Notify the PI, the Institutional Ethics Committee and the sponsor within 24 h of awareness, per protocol.
          </Alert>
        )}
        <ChoiceField
          id={`${idp}-action`}
          label="Action taken with regimen"
          options={[
            { value: 'none', label: 'None' },
            { value: 'interrupted', label: 'Interrupted', tone: 'warn' },
            { value: 'stopped', label: 'Stopped', tone: 'danger' },
          ]}
          value={event.action}
          onChange={(v) => onChange({ action: v })}
          required
          readOnly={readOnly}
          error={k('action')}
        />
        <ChoiceField
          id={`${idp}-outcome`}
          label="Outcome"
          options={[
            { value: 'resolved', label: 'Resolved', tone: 'ok' },
            { value: 'ongoing', label: 'Ongoing', tone: 'warn' },
          ]}
          value={event.outcome}
          onChange={(v) => onChange({ outcome: v })}
          required
          readOnly={readOnly}
          error={k('outcome')}
        />
      </div>
    </article>
  );
}
