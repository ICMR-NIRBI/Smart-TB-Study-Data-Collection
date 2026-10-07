import React from 'react';
import { CalculatorIcon } from 'lucide-react';
import { SegmentedControl } from '../ui/SegmentedControl';
import { InputField } from '../ui/InputField';
import { SignaturePad } from '../ui/SignaturePad';
import { EXCLUSION_CRITERIA, INCLUSION_CRITERIA, type Criterion } from '../../data/criteria';
import { evaluateEligibility } from '../../utils/clinical';
import type { ModuleProps, YesNo } from '../../types/crf';
import type { SegmentOption } from '../../types/ui';

const INCLUSION_OPTIONS: SegmentOption<'yes' | 'no'>[] = [
  { value: 'yes', label: 'Yes', tone: 'ok' },
  { value: 'no', label: 'No', tone: 'danger' },
];
const EXCLUSION_OPTIONS: SegmentOption<'yes' | 'no'>[] = [
  { value: 'yes', label: 'Yes', tone: 'danger' },
  { value: 'no', label: 'No', tone: 'ok' },
];

export function Module2Eligibility({ data, update, readOnly, errors }: ModuleProps<'m2'>) {
  const result = evaluateEligibility(data);

  const renderGroup = (kind: 'inc' | 'exc', heading: string, help: string, criteria: Criterion[]) => {
    const answers = kind === 'inc' ? data.inclusion : data.exclusion;
    const setAnswer = (key: string, v: YesNo) =>
      kind === 'inc' ? update({ inclusion: { ...data.inclusion, [key]: v } }) : update({ exclusion: { ...data.exclusion, [key]: v } });
    return (
      <section aria-labelledby={`${kind}-heading`} className="rounded-2xl border border-line bg-white">
        <div className="border-b border-line px-4 py-3">
          <h3 id={`${kind}-heading`} className="font-semibold text-ink">
            {heading}
          </h3>
          <p className="text-sm text-ink-muted">{help}</p>
        </div>
        <ul className="divide-y divide-line px-4">
          {criteria.map((c) => {
            const id = `${kind}-${c.key}`;
            const err = errors[`${kind}.${c.key}`];
            return (
              <li key={c.key} className="py-3" data-field="true" data-field-error={err ? 'true' : undefined}>
                <div className="sm:flex sm:items-center sm:justify-between sm:gap-6">
                  <p id={`${id}-label`} className="text-[15px] leading-snug text-ink">
                    {c.label}
                  </p>
                  <div className="mt-2 shrink-0 sm:mt-0 sm:w-44">
                    <SegmentedControl
                      options={kind === 'inc' ? INCLUSION_OPTIONS : EXCLUSION_OPTIONS}
                      value={answers[c.key] ?? ''}
                      onChange={(v) => setAnswer(c.key, v)}
                      readOnly={readOnly}
                      invalid={!!err}
                      labelledBy={`${id}-label`}
                    />
                  </div>
                </div>
                {err && <p className="mt-1.5 text-sm text-danger-700">{err}</p>}
              </li>
            );
          })}
        </ul>
      </section>
    );
  };

  const resultTone =
    result.eligible === true ? 'border-ok-200 bg-ok-50' : result.eligible === false ? 'border-danger-200 bg-danger-50' : 'border-line bg-canvas';
  const resultText = result.eligible === true ? 'Yes' : result.eligible === false ? 'No' : 'Pending';
  const resultColor = result.eligible === true ? 'text-ok-700' : result.eligible === false ? 'text-danger-700' : 'text-ink-muted';

  return (
    <div className="space-y-5">
      {renderGroup('inc', 'Inclusion criteria', 'All must be Yes', INCLUSION_CRITERIA)}
      {renderGroup('exc', 'Exclusion criteria', 'All must be No', EXCLUSION_CRITERIA)}

      <div className={`rounded-2xl border p-4 ${resultTone}`} aria-live="polite">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-ink-soft">Participant fully eligible</p>
          <span className="inline-flex items-center gap-1 rounded-md bg-white px-1.5 py-0.5 text-[11px] font-medium text-ink-muted ring-1 ring-line">
            <CalculatorIcon className="h-3 w-3" aria-hidden="true" />
            calculated
          </span>
        </div>
        <p className={`mt-1 text-3xl font-semibold ${resultColor}`}>{resultText}</p>
        {result.eligible === null && (
          <p className="mt-1 text-sm text-ink-muted">
            {result.answered} of {result.total} criteria answered
          </p>
        )}
        {result.eligible === false && (
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-danger-700">
            {result.failedInclusion.map((c) => (
              <li key={c.key}>Inclusion not met: {c.label}</li>
            ))}
            {result.positiveExclusion.map((c) => (
              <li key={c.key}>Exclusion present: {c.label}</li>
            ))}
          </ul>
        )}
        {result.eligible === false && !readOnly && (
          <p className="mt-2 text-sm text-ink-soft">
            Completing this module marks the participant as <strong>Ineligible – screen failure</strong> and routes to Module 10.
          </p>
        )}
      </div>

      <section aria-labelledby="inv-signoff" className="space-y-4 rounded-2xl border border-line bg-white p-4">
        <h3 id="inv-signoff" className="font-semibold text-ink">
          Investigator sign-off
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <InputField
            id="investigatorName"
            label="Investigator name"
            value={data.investigatorName}
            onChange={(v) => update({ investigatorName: v })}
            required
            readOnly={readOnly}
            error={errors.investigatorName}
          />
          <InputField
            id="m2-signDate"
            label="Date"
            kind="date"
            value={data.signDate}
            onChange={(v) => update({ signDate: v })}
            required
            readOnly={readOnly}
            error={errors.signDate}
          />
        </div>
        <SignaturePad
          id="m2-signature"
          label="Investigator signature"
          value={data.signature}
          onChange={(v) => update({ signature: v })}
          readOnly={readOnly}
          required
          error={errors.signature}
        />
      </section>
    </div>
  );
}
