import React from 'react';
import { SectionCard } from '../ui/SectionCard';
import { InputField } from '../ui/InputField';
import { ChoiceField } from '../ui/ChoiceField';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { WEIGHT_BANDS, YES_NO } from '../../data/options';
import { DRUGS } from '../../data/drugs';
import { suggestWeightBand } from '../../utils/clinical';
import { daysBetween, nowTime } from '../../utils/dates';
import { hasErrorIn } from '../../utils/validation';
import type { M4Data, ModuleProps } from '../../types/crf';

export function Module4Treatment({ participant, data, update, readOnly, errors, onOpenModule }: ModuleProps<'m4'>) {
  const baselineWeight = participant.data.m3.weight;
  const suggested = suggestWeightBand(baselineWeight);
  const suggestedLabel = WEIGHT_BANDS.find((b) => b.value === suggested)?.label;
  const revisitDay = daysBetween(data.startDate, data.revisitDate);
  const revisitWarning =
    revisitDay !== null && (revisitDay < 7 || revisitDay > 9) ? `Day ${revisitDay} — outside the Day 7–9 window` : undefined;

  return (
    <div className="space-y-4">
      <SectionCard title="4.1 Treatment initiation" forceOpen={hasErrorIn(errors, ['startDate', 'weightBand', 'doseR', 'doseH', 'doseZ', 'doseE'])}>
        <InputField
          id="startDate"
          label="Date treatment started (Day 0)"
          kind="date"
          value={data.startDate}
          onChange={(v) => update({ startDate: v })}
          required
          readOnly={readOnly}
          error={errors.startDate}
        />
        <ChoiceField
          id="weightBand"
          label="Weight band (kg)"
          options={WEIGHT_BANDS}
          value={data.weightBand}
          onChange={(v) => update({ weightBand: v })}
          columns={5}
          required
          readOnly={readOnly}
          error={errors.weightBand}
          hint={
            suggestedLabel ? (
              <span className="flex flex-wrap items-center gap-x-2">
                Suggested from baseline weight {baselineWeight} kg: <strong className="text-ink">{suggestedLabel} kg</strong>
                {!readOnly && data.weightBand !== suggested && (
                  <button
                    type="button"
                    onClick={() => update({ weightBand: suggested })}
                    className="min-h-[44px] font-semibold text-brand-700 underline-offset-2 hover:underline"
                  >
                    Apply
                  </button>
                )}
              </span>
            ) : undefined
          }
        />
        <fieldset>
          <legend className="mb-3 text-sm font-semibold text-ink-soft">Daily dose</legend>
          <div className="grid grid-cols-2 gap-4">
            {DRUGS.map((d) => (
              <InputField
                key={d.key}
                id={d.doseKey}
                label={`${d.name} (${d.key})`}
                kind="integer"
                unit="mg"
                value={data[d.doseKey]}
                onChange={(v) => update({ [d.doseKey]: v } as Partial<M4Data>)}
                required
                readOnly={readOnly}
                error={errors[d.doseKey]}
              />
            ))}
          </div>
        </fieldset>
      </SectionCard>

      <SectionCard
        title="4.2 Day 7 (+2) revisit"
        forceOpen={hasErrorIn(errors, ['revisitDate', 'missedDoses', 'daysMissed', 'consecutiveDays', 'toxicity', 'admitted', 'dinnerTime'])}
      >
        <InputField
          id="revisitDate"
          label="Revisit date"
          kind="date"
          value={data.revisitDate}
          onChange={(v) => update({ revisitDate: v })}
          required
          readOnly={readOnly}
          error={errors.revisitDate}
          warning={revisitWarning}
          hint={revisitDay !== null ? `Day ${revisitDay} of treatment` : undefined}
        />
        <ChoiceField
          id="missedDoses"
          label="Missed doses, Day 1–7"
          options={[
            { value: 'none', label: 'None (100%)', tone: 'ok' },
            { value: 'missed', label: 'Missed', tone: 'warn' },
          ]}
          value={data.missedDoses}
          onChange={(v) => update({ missedDoses: v })}
          required
          readOnly={readOnly}
          error={errors.missedDoses}
        />
        {data.missedDoses === 'missed' && (
          <div className="grid grid-cols-2 gap-4 rounded-xl bg-warn-50 p-3">
            <InputField
              id="daysMissed"
              label="Days missed"
              kind="integer"
              unit="days"
              value={data.daysMissed}
              onChange={(v) => update({ daysMissed: v })}
              required
              readOnly={readOnly}
              error={errors.daysMissed}
            />
            <InputField
              id="consecutiveDays"
              label="Consecutive full-dose days"
              kind="integer"
              unit="days"
              value={data.consecutiveDays}
              onChange={(v) => update({ consecutiveDays: v })}
              required
              readOnly={readOnly}
              error={errors.consecutiveDays}
              hint="≥7 required to proceed"
            />
          </div>
        )}
        <ChoiceField
          id="toxicity"
          label="Signs of drug toxicity / hepatotoxicity / jaundice"
          options={[
            { value: 'present', label: 'Present', tone: 'danger' },
            { value: 'absent', label: 'Absent', tone: 'ok' },
          ]}
          value={data.toxicity}
          onChange={(v) => update({ toxicity: v })}
          required
          readOnly={readOnly}
          error={data.toxicity === 'present' ? undefined : errors.toxicity}
        />
        {data.toxicity === 'present' && (
          <Alert
            tone="danger"
            title="PK sampling halted"
            action={
              <Button variant="danger" size="sm" onClick={() => onOpenModule(9)}>
                Report adverse event
              </Button>
            }
          >
            Module 5 stays locked while toxicity is present. Document the event in Module 9 and discuss discontinuation with the PI.
          </Alert>
        )}
        <ChoiceField
          id="admitted"
          label="Admitted to PK inpatient unit evening before sampling"
          options={YES_NO}
          value={data.admitted}
          onChange={(v) => update({ admitted: v })}
          required
          readOnly={readOnly}
          error={errors.admitted}
        />
        <InputField
          id="dinnerTime"
          label="Time dinner finished on eve of sampling"
          kind="time"
          value={data.dinnerTime}
          onChange={(v) => update({ dinnerTime: v })}
          required
          readOnly={readOnly}
          error={errors.dinnerTime}
          hint="24-hour clock — used to verify ≥8 h fasting before T0"
          action={
            <Button variant="secondary" size="md" onClick={() => update({ dinnerTime: nowTime() })}>
              Now
            </Button>
          }
        />
      </SectionCard>
    </div>
  );
}
