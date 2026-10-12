import React from 'react';
import { SectionCard } from '../ui/SectionCard';
import { InputField } from '../ui/InputField';
import { ChoiceField } from '../ui/ChoiceField';
import { CalcField } from '../ui/CalcField';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { SignOffFields } from '../ui/SignOffFields';
import { TimepointCard } from './sampling/TimepointCard';
import { MEALS, TIMEPOINTS } from '../../data/timepoints';
import { YES_NO } from '../../data/options';
import { fastingHours, fmt } from '../../utils/clinical';
import { addHoursToTime, daysBetween, nowTime } from '../../utils/dates';
import { sampleCounters } from '../../utils/sampling';
import { hasErrorIn } from '../../utils/validation';
import type { M5Data, ModuleProps, TimepointEntry } from '../../types/crf';

export function Module5PkSampling({ participant, data, update, readOnly, errors }: ModuleProps<'m5'>) {
  const m4 = participant.data.m4;
  const fasting = fastingHours(m4.dinnerTime, data.t0);
  const day = daysBetween(m4.startDate, data.samplingDate);
  const dayWarning = day !== null && (day < 8 || day > 10) ? `Day ${day} — outside the Day 8–10 sampling window` : undefined;
  const counters = sampleCounters(data);

  const updateTp = (key: string, patch: Partial<TimepointEntry>) =>
    update({ timepoints: { ...data.timepoints, [key]: { ...data.timepoints[key], ...patch } } });

  const counterItems = [
    { label: 'Blood', value: counters.blood, total: counters.bloodTotal },
    { label: 'Saliva', value: counters.saliva, total: counters.salivaTotal },
    { label: 'Images', value: counters.images, total: counters.imagesTotal },
  ];

  return (
    <div className="space-y-4">
      <SectionCard title="Dosing & fasting" forceOpen={hasErrorIn(errors, ['samplingDate', 't0', 'fastingConfirmed'])}>
        <div className="grid gap-4 sm:grid-cols-2">
          <InputField
            id="samplingDate"
            label="Sampling date"
            kind="date"
            value={data.samplingDate}
            onChange={(v) => update({ samplingDate: v })}
            required
            readOnly={readOnly}
            error={errors.samplingDate}
            warning={dayWarning}
            hint={day !== null ? `Day ${day} of treatment` : undefined}
          />
          <InputField
            id="t0"
            label="Morning dosing time (T0)"
            kind="time"
            value={data.t0}
            onChange={(v) => update({ t0: v })}
            required
            readOnly={readOnly}
            error={errors.t0}
            hint="Empty stomach, with water"
            action={
              <Button variant="secondary" onClick={() => update({ t0: nowTime() })}>
                Now
              </Button>
            }
          />
          <CalcField
            label="Fasting since dinner"
            value={fmt(fasting, 1)}
            unit="h"
            tone={fasting === null ? 'default' : fasting >= 8 ? 'ok' : 'danger'}
            note={
              fasting === null
                ? `Dinner ${m4.dinnerTime || '—'} (Module 4) → T0`
                : fasting >= 8
                  ? `≥8 h confirmed · dinner ${m4.dinnerTime} → T0 ${data.t0}`
                  : `Less than 8 h · dinner ${m4.dinnerTime} → T0 ${data.t0}`
            }
          />
          <ChoiceField
            id="fastingConfirmed"
            label="Fasting ≥8 h post-dinner confirmed"
            options={YES_NO}
            value={data.fastingConfirmed}
            onChange={(v) => update({ fastingConfirmed: v })}
            required
            readOnly={readOnly}
            error={errors.fastingConfirmed}
          />
        </div>
      </SectionCard>

      <SectionCard title="Standardized meals" forceOpen={hasErrorIn(errors, MEALS.map((m) => m.key))}>
        <div className="divide-y divide-line">
          {MEALS.map((meal) => (
            <div key={meal.key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] items-end gap-3 py-3 first:pt-0 last:pb-0">
              <div className="pb-1">
                <p className="font-semibold text-ink">{meal.label}</p>
                <p className="text-sm text-ink-muted">
                  {meal.offsetLabel} · scheduled{' '}
                  <span className="font-semibold tabular-nums text-ink">{data.t0 ? addHoursToTime(data.t0, meal.offset) : '--:--'}</span>
                </p>
              </div>
              <InputField
                id={meal.key}
                label="Time given"
                kind="time"
                value={data[meal.key]}
                onChange={(v) => update({ [meal.key]: v } as Partial<M5Data>)}
                required
                readOnly={readOnly}
                error={errors[meal.key]}
              />
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Sample handling instructions" subtitle="Blood, imaging and saliva" defaultOpen={false}>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="font-semibold text-ink">Blood</dt>
            <dd className="text-ink-soft">
              Collect 1.5–2.0 mL in EDTA. Separate plasma immediately, add ascorbic acid / phosphate buffer stabilizer for Rifampicin, store at −80 °C.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">Images</dt>
            <dd className="text-ink-soft">
              Photograph a whole-blood drop on standardized blotting paper (IMG-BL) and the plasma vial against the calibrated light box (IMG-PL).
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">Saliva</dt>
            <dd className="text-ink-soft">Collect on cotton swab and blotting paper, stabilize with ascorbic acid, store at −80 °C.</dd>
          </div>
        </dl>
      </SectionCard>

      <section aria-labelledby="tp-heading" className="pt-2">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h3 id="tp-heading" className="text-base font-semibold text-ink">
              Sampling timepoints
            </h3>
            <p className="text-sm text-ink-muted">
              {counters.complete} of {counters.total} complete · flags amber if &gt;10 min off schedule
            </p>
          </div>
        </div>
        <div className="mb-4 grid grid-cols-3 divide-x divide-line rounded-2xl border border-line bg-white" aria-live="polite">
          {counterItems.map((c) => {
            const done = c.value === c.total;
            return (
              <div key={c.label} className="px-3 py-2.5 text-center">
                <p className="text-xs font-medium text-ink-muted">{c.label}</p>
                <p className={`text-lg font-semibold tabular-nums ${done ? 'text-ok-700' : 'text-ink'}`}>
                  {c.value}
                  <span className="text-sm font-medium text-ink-muted">/{c.total}</span>
                </p>
              </div>
            );
          })}
        </div>
        {!data.t0 && (
          <Alert tone="info" title="Enter T0 to schedule timepoints" className="mb-4">
            Scheduled clock times are calculated as T0 + nominal hours.
          </Alert>
        )}
        <ol className="relative space-y-3 before:absolute before:bottom-6 before:left-[17px] before:top-6 before:w-0.5 before:bg-line">
          {TIMEPOINTS.map((tp) => (
            <TimepointCard
              key={tp.key}
              def={tp}
              entry={data.timepoints[tp.key]}
              t0={data.t0}
              readOnly={readOnly}
              errors={errors}
              onChange={(patch) => updateTp(tp.key, patch)}
            />
          ))}
        </ol>
      </section>

      <SectionCard title="Sign-off" subtitle="Phlebotomist / Research Officer" forceOpen={hasErrorIn(errors, ['signerName', 'signDate'])}>
        <SignOffFields
          nameId="signerName"
          nameLabel="Name"
          name={data.signerName}
          dateId="m5-signDate"
          date={data.signDate ?? ''}
          onChange={({ name, signDate }) => update({ signerName: name, signDate })}
          readOnly={readOnly}
          errors={errors}
        />
      </SectionCard>
    </div>
  );
}
