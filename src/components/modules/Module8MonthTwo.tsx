import React from 'react';
import { SectionCard } from '../ui/SectionCard';
import { InputField } from '../ui/InputField';
import { ChoiceField } from '../ui/ChoiceField';
import { DETECTION_OPTIONS, SMEAR_OPTIONS, YES_NO } from '../../data/options';
import { DRUGS } from '../../data/drugs';
import { calcCompliance, fmt } from '../../utils/clinical';
import { daysBetween } from '../../utils/dates';
import { hasErrorIn } from '../../utils/validation';
import type { M8Data, ModuleProps } from '../../types/crf';

const DST_KEYS: Record<string, 'dstR' | 'dstH' | 'dstZ' | 'dstE'> = { R: 'dstR', H: 'dstH', Z: 'dstZ', E: 'dstE' };

export function Module8MonthTwo({ participant, data, update, readOnly, errors }: ModuleProps<'m8'>) {
  const day = daysBetween(participant.data.m4.startDate, data.evalDate);
  const dayWarning = day !== null && (day < 55 || day > 65) ? `Day ${day} — outside the Day 60 ± 5 window` : undefined;
  const m7 = participant.data.m7;
  const month1 = calcCompliance(m7.dosesDispensed, m7.blistersReturned);
  const failed = data.outcome === 'failure';
  const inconsistent =
    (data.outcome === 'success' && (data.culture === 'positive' || data.smear === 'positive')) ||
    (data.outcome === 'failure' && data.culture === 'negative' && data.smear === 'negative');

  return (
    <div className="space-y-4">
      <SectionCard title="Day 60 evaluation" forceOpen={hasErrorIn(errors, ['evalDate', 'cumulativeCompliance', 'smear', 'smearGrade', 'culture', 'outcome'])}>
        <div className="grid gap-4 sm:grid-cols-2">
          <InputField
            id="evalDate"
            label="Evaluation date"
            kind="date"
            value={data.evalDate}
            onChange={(v) => update({ evalDate: v })}
            required
            readOnly={readOnly}
            error={errors.evalDate}
            warning={dayWarning}
            hint={day !== null ? `Day ${day} of treatment` : undefined}
          />
          <InputField
            id="cumulativeCompliance"
            label="Cumulative 2-month compliance"
            kind="decimal"
            unit="%"
            value={data.cumulativeCompliance}
            onChange={(v) => update({ cumulativeCompliance: v })}
            required
            readOnly={readOnly}
            error={errors.cumulativeCompliance}
            warning={Number(data.cumulativeCompliance) > 0 && Number(data.cumulativeCompliance) < 90 ? 'Below 90% target' : undefined}
            hint={month1 !== null ? `Month 1 compliance was ${fmt(month1, 1)}%` : undefined}
          />
        </div>
        <ChoiceField
          id="m8-smear"
          label="Sputum smear, Day 60"
          options={[
            { value: 'negative', label: 'Negative', tone: 'ok' },
            { value: 'positive', label: 'Positive', tone: 'danger' },
          ]}
          value={data.smear}
          onChange={(v) => update({ smear: v, smearGrade: v === 'negative' ? '' : data.smearGrade })}
          required
          readOnly={readOnly}
          error={errors.smear}
        />
        {data.smear === 'positive' && (
          <ChoiceField id="smearGrade" label="Smear grading" options={SMEAR_OPTIONS} value={data.smearGrade} onChange={(v) => update({ smearGrade: v })} required readOnly={readOnly} error={errors.smearGrade} />
        )}
        <ChoiceField
          id="culture"
          label="Sputum culture"
          options={[
            { value: 'negative', label: 'Negative', description: 'Sterilization achieved', tone: 'ok' },
            { value: 'positive', label: 'Positive', description: 'Growth', tone: 'danger' },
          ]}
          value={data.culture}
          onChange={(v) => update({ culture: v })}
          layout="stack"
          required
          readOnly={readOnly}
          error={errors.culture}
        />
        <ChoiceField
          id="outcome"
          label="Primary outcome"
          options={[
            { value: 'success', label: 'Treatment success', description: 'Sputum sterilization achieved', tone: 'ok' },
            { value: 'failure', label: 'Treatment failure', description: 'Conversion failed', tone: 'danger' },
          ]}
          value={data.outcome}
          onChange={(v) => update({ outcome: v })}
          layout="stack"
          required
          readOnly={readOnly}
          error={errors.outcome}
          warning={inconsistent ? 'Outcome does not match smear / culture results — please verify' : undefined}
        />
      </SectionCard>

      {failed && (
        <SectionCard
          title="8.1 Secondary reflex testing"
          subtitle="Required because conversion failed"
          forceOpen={hasErrorIn(errors, ['lpaPerformed', 'lpaDate', 'labName', 'rifMutation', 'rifMutationText', 'inhMutation', 'inhMutationText', 'dstAvailable', 'dstR', 'dstH', 'dstZ', 'dstE'])}
          badge={<span className="rounded-full bg-danger-50 px-2 py-0.5 text-xs font-semibold text-danger-700 ring-1 ring-danger-200">Required</span>}
        >
          <ChoiceField
            id="lpaPerformed"
            label="LPA performed"
            options={[
              { value: 'yes', label: 'Yes' },
              { value: 'na', label: 'N/A' },
            ]}
            value={data.lpaPerformed}
            onChange={(v) => update({ lpaPerformed: v })}
            required
            readOnly={readOnly}
            error={errors.lpaPerformed}
          />
          {data.lpaPerformed === 'yes' && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <InputField id="lpaDate" label="LPA date" kind="date" value={data.lpaDate} onChange={(v) => update({ lpaDate: v })} required readOnly={readOnly} error={errors.lpaDate} />
                <InputField id="labName" label="NABL lab name / ID" value={data.labName} onChange={(v) => update({ labName: v })} required readOnly={readOnly} error={errors.labName} />
              </div>
              <ChoiceField id="rifMutation" label="Rifampicin resistance mutation" options={DETECTION_OPTIONS} value={data.rifMutation} onChange={(v) => update({ rifMutation: v })} required readOnly={readOnly} error={errors.rifMutation} />
              {data.rifMutation === 'detected' && (
                <InputField id="rifMutationText" label="Rifampicin mutation" placeholder="e.g. rpoB S531L" value={data.rifMutationText} onChange={(v) => update({ rifMutationText: v })} required readOnly={readOnly} error={errors.rifMutationText} />
              )}
              <ChoiceField id="inhMutation" label="Isoniazid resistance mutation" options={DETECTION_OPTIONS} value={data.inhMutation} onChange={(v) => update({ inhMutation: v })} required readOnly={readOnly} error={errors.inhMutation} />
              {data.inhMutation === 'detected' && (
                <InputField id="inhMutationText" label="Isoniazid mutation" placeholder="e.g. katG S315T" value={data.inhMutationText} onChange={(v) => update({ inhMutationText: v })} required readOnly={readOnly} error={errors.inhMutationText} />
              )}
            </>
          )}
          <ChoiceField id="dstAvailable" label="Phenotypic DST available" options={YES_NO} value={data.dstAvailable} onChange={(v) => update({ dstAvailable: v })} required readOnly={readOnly} error={errors.dstAvailable} />
          {data.dstAvailable === 'yes' && (
            <div className="grid grid-cols-2 gap-4">
              {DRUGS.map((d) => {
                const key = DST_KEYS[d.key];
                return (
                  <ChoiceField
                    key={d.key}
                    id={key}
                    label={`${d.name} resistant`}
                    options={[
                      { value: 'yes', label: 'Yes', tone: 'danger' },
                      { value: 'no', label: 'No' },
                    ]}
                    value={data[key]}
                    onChange={(v) => update({ [key]: v } as Partial<M8Data>)}
                    required
                    readOnly={readOnly}
                    error={errors[key]}
                  />
                );
              })}
            </div>
          )}
        </SectionCard>
      )}
    </div>
  );
}
