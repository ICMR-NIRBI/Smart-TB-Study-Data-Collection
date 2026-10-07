import React from 'react';
import { InputField } from '../ui/InputField';
import { ChoiceField } from '../ui/ChoiceField';
import { CalcField } from '../ui/CalcField';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { calcCompliance, fmt, toNum } from '../../utils/clinical';
import { daysBetween } from '../../utils/dates';
import type { ModuleProps } from '../../types/crf';

export function Module7MonthOne({ participant, data, update, readOnly, errors, onOpenModule }: ModuleProps<'m7'>) {
  const start = participant.data.m4.startDate;
  const day = daysBetween(start, data.visitDate);
  const dayWarning = day !== null && (day < 27 || day > 33) ? `Day ${day} — outside the Day 30 ± 3 window` : undefined;
  const compliance = calcCompliance(data.dosesDispensed, data.blistersReturned);
  const baseline = toNum(participant.data.m3.weight);
  const current = toNum(data.weight);
  const delta = baseline !== null && current !== null ? current - baseline : null;

  return (
    <div className="space-y-5">
      <InputField
        id="visitDate"
        label="Visit date"
        kind="date"
        value={data.visitDate}
        onChange={(v) => update({ visitDate: v })}
        required
        readOnly={readOnly}
        error={errors.visitDate}
        warning={dayWarning}
        hint={day !== null ? `Day ${day} of treatment` : undefined}
      />

      <section aria-labelledby="adherence-heading" className="space-y-4 rounded-2xl border border-line bg-white p-4">
        <h3 id="adherence-heading" className="font-semibold text-ink">
          Adherence
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <InputField id="dosesDispensed" label="Doses dispensed" kind="integer" value={data.dosesDispensed} onChange={(v) => update({ dosesDispensed: v })} required readOnly={readOnly} error={errors.dosesDispensed} />
          <InputField id="blistersReturned" label="Empty blisters returned" kind="integer" value={data.blistersReturned} onChange={(v) => update({ blistersReturned: v })} required readOnly={readOnly} error={errors.blistersReturned} />
        </div>
        <CalcField
          label="Compliance"
          value={fmt(compliance, 1)}
          unit="%"
          tone={compliance === null ? 'default' : compliance >= 90 ? 'ok' : 'warn'}
          note={compliance === null ? 'Returned empty blisters ÷ doses dispensed × 100 · target ≥90%' : compliance >= 90 ? 'Meets ≥90% target' : 'Below 90% target — counsel on adherence'}
        />
      </section>

      <section aria-labelledby="clinical-heading" className="space-y-4 rounded-2xl border border-line bg-white p-4">
        <h3 id="clinical-heading" className="font-semibold text-ink">
          Clinical response
        </h3>
        <ChoiceField
          id="cough"
          label="Cough"
          options={[
            { value: 'resolved', label: 'Resolved', tone: 'ok' },
            { value: 'improved', label: 'Improved' },
            { value: 'unchanged', label: 'Unchanged / worse', tone: 'warn' },
          ]}
          value={data.cough}
          onChange={(v) => update({ cough: v })}
          layout="stack"
          required
          readOnly={readOnly}
          error={errors.cough}
        />
        <ChoiceField
          id="fever"
          label="Fever"
          options={[
            { value: 'resolved', label: 'Resolved', tone: 'ok' },
            { value: 'persistent', label: 'Persistent', tone: 'warn' },
          ]}
          value={data.fever}
          onChange={(v) => update({ fever: v })}
          required
          readOnly={readOnly}
          error={errors.fever}
        />
        <div className="grid grid-cols-2 gap-4">
          <InputField id="m7-weight" label="Weight" kind="decimal" unit="kg" value={data.weight} onChange={(v) => update({ weight: v })} required readOnly={readOnly} error={errors.weight} />
          <CalcField
            label="Δ from baseline"
            value={delta === null ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}`}
            unit="kg"
            tone={delta === null ? 'default' : delta < 0 ? 'warn' : 'ok'}
            note={baseline !== null ? `Baseline ${baseline} kg` : 'Baseline weight missing'}
          />
        </div>
      </section>

      <ChoiceField
        id="adr"
        label="Adverse drug reaction reported"
        options={[
          { value: 'none', label: 'None', tone: 'ok' },
          { value: 'present', label: 'Present', tone: 'danger' },
        ]}
        value={data.adr}
        onChange={(v) => update({ adr: v })}
        required
        readOnly={readOnly}
        error={errors.adr}
      />
      {data.adr === 'present' && (
        <Alert
          tone="warn"
          title="Document the reaction in the safety log"
          action={
            <Button variant="secondary" size="sm" onClick={() => onOpenModule(9)}>
              Open Module 9 – Adverse events
            </Button>
          }
        >
          This does not block Month 1 completion.
        </Alert>
      )}
    </div>
  );
}
