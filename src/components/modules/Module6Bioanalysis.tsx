import React, { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { SectionCard } from '../ui/SectionCard';
import { ChoiceField } from '../ui/ChoiceField';
import { SignOffFields } from '../ui/SignOffFields';
import { ConcentrationTable } from './pk/ConcentrationTable';
import { PkSummaryTable } from './pk/PkSummaryTable';
import { DRUGS } from '../../data/drugs';
import { toNum } from '../../utils/clinical';
import { computePk, concentrationPoints, type PkSummary } from '../../utils/pk';
import { hasErrorIn } from '../../utils/validation';
import type { ConcEntry, DrugKey, ModuleProps } from '../../types/crf';

// The charting library is large and only this module draws a chart, so it loads on demand.
const ConcentrationChart = dynamic(() => import('./pk/ConcentrationChart').then((m) => m.ConcentrationChart), {
  ssr: false,
  loading: () => <div className="h-[17rem] rounded-2xl border border-line bg-white" aria-hidden="true" />,
});

export function Module6Bioanalysis({ participant, data, update, readOnly, errors }: ModuleProps<'m6'>) {
  const [active, setActive] = useState<DrugKey>('R');
  const m3 = participant.data.m3;

  const results = useMemo(
    () =>
      Object.fromEntries(
        DRUGS.map((d) => [d.key, computePk(concentrationPoints(data.conc[d.key], 'plasma'), toNum(m3[d.micKey]))]),
      ) as Record<DrugKey, PkSummary>,
    [data.conc, m3],
  );

  const activeDrug = DRUGS.find((d) => d.key === active) ?? DRUGS[0];
  const mic = toNum(m3[activeDrug.micKey]);

  const updateConc = (drug: DrugKey, tp: string, patch: Partial<ConcEntry>) =>
    update({ conc: { ...data.conc, [drug]: { ...data.conc[drug], [tp]: { ...data.conc[drug][tp], ...patch } } } });

  const onTabKey = (e: React.KeyboardEvent, index: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = (index + (e.key === 'ArrowRight' ? 1 : -1) + DRUGS.length) % DRUGS.length;
    setActive(DRUGS[next].key);
    document.getElementById(`drug-tab-${DRUGS[next].key}`)?.focus();
  };

  return (
    <div className="space-y-4">
      <SectionCard title="6.1 Plasma & saliva concentrations" subtitle="LC-MS/MS · μg/mL" forceOpen={hasErrorIn(errors, ['conc', 'drug'])}>
        <div role="tablist" aria-label="Drug" className="grid grid-cols-4 gap-1 rounded-xl bg-canvas p-1">
          {DRUGS.map((d, i) => {
            const selected = d.key === active;
            const hasErr = !!errors[`drug.${d.key}`];
            return (
              <button
                key={d.key}
                id={`drug-tab-${d.key}`}
                role="tab"
                type="button"
                aria-selected={selected}
                aria-controls={`drug-panel-${d.key}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActive(d.key)}
                onKeyDown={(e) => onTabKey(e, i)}
                className={`relative flex min-h-[52px] flex-col items-center justify-center rounded-lg px-1 transition-[background-color,color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 ${
                  selected ? 'bg-white text-brand-700 shadow-sm ring-1 ring-line' : 'text-ink-soft hover:text-ink'
                }`}
              >
                <span className="text-base font-semibold">{d.key}</span>
                <span className="text-[11px] leading-tight">{d.name}</span>
                {hasErr && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-danger-600" aria-label="has missing values" />}
              </button>
            );
          })}
        </div>

        <div id={`drug-panel-${active}`} role="tabpanel" aria-labelledby={`drug-tab-${active}`} className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p className="text-ink-soft">
              Baseline MIC <span className="font-semibold tabular-nums text-ink">{mic ?? '—'}</span> μg/mL
              <span className="text-ink-muted"> · Module 3</span>
            </p>
            {errors[`drug.${active}`] && <p className="font-medium text-danger-700">{errors[`drug.${active}`]}</p>}
          </div>
          <ConcentrationChart drugName={activeDrug.name} entries={data.conc[active]} mic={mic} />
          <ConcentrationTable
            drug={active}
            drugName={activeDrug.name}
            entries={data.conc[active]}
            readOnly={readOnly}
            errors={errors}
            onChange={(tp, patch) => updateConc(active, tp, patch)}
          />
        </div>
      </SectionCard>

      <SectionCard title="6.2 Derived PK parameters" forceOpen={hasErrorIn(errors, ['pkFailure'])}>
        <PkSummaryTable results={results} />
        <fieldset>
          <legend className="mb-3 text-sm font-semibold text-ink-soft">Predicted PK failure</legend>
          <div className="grid grid-cols-2 gap-4">
            {DRUGS.map((d) => (
              <ChoiceField
                key={d.key}
                id={`pkFailure-${d.key}`}
                label={d.name}
                options={[
                  { value: 'yes', label: 'Yes', tone: 'danger' },
                  { value: 'no', label: 'No' },
                ]}
                value={data.pkFailure[d.key]}
                onChange={(v) => update({ pkFailure: { ...data.pkFailure, [d.key]: v } })}
                readOnly={readOnly}
                error={errors[`pkFailure.${d.key}`]}
              />
            ))}
          </div>
        </fieldset>
      </SectionCard>

      <SectionCard title="PK scientist sign-off" forceOpen={hasErrorIn(errors, ['scientistName', 'signDate'])}>
        <SignOffFields
          nameId="scientistName"
          nameLabel="PK scientist name"
          name={data.scientistName}
          dateId="m6-signDate"
          date={data.signDate}
          onChange={({ name, signDate }) => update({ scientistName: name, signDate })}
          readOnly={readOnly}
          errors={errors}
        />
      </SectionCard>
    </div>
  );
}
