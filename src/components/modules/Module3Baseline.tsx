import React from 'react';
import { SectionCard } from '../ui/SectionCard';
import { InputField } from '../ui/InputField';
import { ChoiceField } from '../ui/ChoiceField';
import { CalcField } from '../ui/CalcField';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { DETECTION_OPTIONS, SMEAR_OPTIONS, YES_NO } from '../../data/options';
import { DRUGS } from '../../data/drugs';
import { calcBmi, calcFfm, fmt, labWarnings } from '../../utils/clinical';
import { hasErrorIn } from '../../utils/validation';
import type { M3Data, ModuleProps } from '../../types/crf';

type NumKey = Exclude<keyof M3Data, 'jaundice' | 'diabetes' | 'smear' | 'mtbDetected' | 'rifResistance'>;

const LAB_GROUPS: { title: string; fields: { key: NumKey; label: string; unit: string; kind?: 'integer' }[] }[] = [
  {
    title: 'Hemogram',
    fields: [
      { key: 'hb', label: 'Hemoglobin', unit: 'g/dL' },
      { key: 'tlc', label: 'TLC', unit: '/cu mm', kind: 'integer' },
      { key: 'platelets', label: 'Platelets', unit: '/cu mm', kind: 'integer' },
    ],
  },
  {
    title: 'Liver function',
    fields: [
      { key: 'tbil', label: 'Total bilirubin', unit: 'mg/dL' },
      { key: 'dbil', label: 'Direct bilirubin', unit: 'mg/dL' },
      { key: 'ast', label: 'AST / SGOT', unit: 'U/L' },
      { key: 'alt', label: 'ALT / SGPT', unit: 'U/L' },
      { key: 'alp', label: 'ALP', unit: 'U/L' },
    ],
  },
  {
    title: 'Renal function',
    fields: [
      { key: 'creatinine', label: 'Creatinine', unit: 'mg/dL' },
      { key: 'urea', label: 'Urea / BUN', unit: 'mg/dL' },
    ],
  },
  {
    title: 'Metabolic',
    fields: [
      { key: 'fbs', label: 'FBS', unit: 'mg/dL' },
      { key: 'rbs', label: 'RBS', unit: 'mg/dL' },
      { key: 'hba1c', label: 'HbA1c', unit: '%' },
    ],
  },
];

export function Module3Baseline({ participant, data, update, readOnly, errors, onDiscontinue }: ModuleProps<'m3'>) {
  const gender = participant.data.m1.gender;
  const bmi = calcBmi(data.height, data.weight);
  const ffm = calcFfm(data.weight, bmi, gender);
  const warnings = labWarnings(data);
  const num = (key: NumKey) => (v: string) => update({ [key]: v } as Partial<M3Data>);

  return (
    <div className="space-y-4">
      <SectionCard
        title="3.1 Anthropometry & vitals"
        forceOpen={hasErrorIn(errors, ['height', 'weight', 'hr', 'sbp', 'dbp', 'jaundice'])}
      >
        <div className="grid grid-cols-2 gap-4">
          <InputField id="height" label="Height" kind="decimal" unit="cm" value={data.height} onChange={num('height')} required readOnly={readOnly} error={errors.height} />
          <InputField id="weight" label="Weight" kind="decimal" unit="kg" value={data.weight} onChange={num('weight')} required readOnly={readOnly} error={errors.weight} />
          <CalcField label="BMI" value={fmt(bmi, 1)} unit="kg/m²" tone={bmi !== null && bmi < 18.5 ? 'warn' : 'default'} note={bmi !== null && bmi < 18.5 ? 'Underweight' : undefined} />
          <CalcField
            label="Fat-free mass"
            value={fmt(ffm, 1)}
            unit="kg"
            note={gender === 'other' ? 'Janmahasatian requires male/female' : gender ? 'Janmahasatian' : 'Needs gender (Module 1)'}
          />
          <InputField id="hr" label="Resting heart rate" kind="integer" unit="bpm" value={data.hr} onChange={num('hr')} required readOnly={readOnly} error={errors.hr} className="col-span-2 sm:col-span-1" />
          <div className="col-span-2 sm:col-span-1" />
          <InputField id="sbp" label="BP systolic" kind="integer" unit="mmHg" value={data.sbp} onChange={num('sbp')} required readOnly={readOnly} error={errors.sbp} />
          <InputField id="dbp" label="BP diastolic" kind="integer" unit="mmHg" value={data.dbp} onChange={num('dbp')} required readOnly={readOnly} error={errors.dbp} />
          <ChoiceField
            id="jaundice"
            label="Clinical jaundice"
            options={YES_NO}
            value={data.jaundice}
            onChange={(v) => update({ jaundice: v })}
            required
            readOnly={readOnly}
            error={errors.jaundice}
            warning={data.jaundice === 'yes' ? 'Clinical jaundice — review hepatic exclusion criteria' : undefined}
            className="col-span-2"
          />
        </div>
      </SectionCard>

      <SectionCard
        title="3.2 Laboratory investigations"
        forceOpen={hasErrorIn(errors, ['hb', 'tlc', 'platelets', 'tbil', 'dbil', 'ast', 'alt', 'alp', 'creatinine', 'urea', 'fbs', 'rbs', 'hba1c', 'diabetes'])}
        badge={
          Object.keys(warnings).length > 0 ? (
            <span className="rounded-full bg-warn-50 px-2 py-0.5 text-xs font-semibold text-warn-700 ring-1 ring-warn-200">
              {Object.keys(warnings).length} flag{Object.keys(warnings).length > 1 ? 's' : ''}
            </span>
          ) : undefined
        }
      >
        {LAB_GROUPS.map((group) => (
          <fieldset key={group.title} className="space-y-3">
            <legend className="mb-3 text-sm font-semibold text-ink-soft">{group.title}</legend>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {group.fields.map((f) => (
                <InputField
                  key={f.key}
                  id={f.key}
                  label={f.label}
                  kind={f.kind ?? 'decimal'}
                  unit={f.unit}
                  value={data[f.key]}
                  onChange={num(f.key)}
                  required={f.key !== 'fbs' && f.key !== 'rbs'}
                  readOnly={readOnly}
                  error={errors[f.key]}
                  warning={warnings[f.key]}
                  className={f.key === 'tlc' || f.key === 'platelets' ? 'col-span-2 sm:col-span-1' : undefined}
                />
              ))}
            </div>
          </fieldset>
        ))}
        <ChoiceField
          id="diabetes"
          label="Co-morbid diabetes"
          options={YES_NO}
          value={data.diabetes}
          onChange={(v) => update({ diabetes: v })}
          required
          readOnly={readOnly}
          error={errors.diabetes}
          warning={warnings.diabetes}
        />
      </SectionCard>

      <SectionCard
        title="3.3 Microbiology"
        forceOpen={hasErrorIn(errors, ['smear', 'mtbDetected', 'rifResistance', 'micR', 'micH', 'micZ', 'micE'])}
      >
        <ChoiceField id="smear" label="Sputum AFB smear" options={SMEAR_OPTIONS} value={data.smear} onChange={(v) => update({ smear: v })} required readOnly={readOnly} error={errors.smear} />
        <div className="grid gap-4 sm:grid-cols-2">
          <ChoiceField
            id="mtbDetected"
            label="CBNAAT / LPA: M. tuberculosis detected"
            options={YES_NO}
            value={data.mtbDetected}
            onChange={(v) => update({ mtbDetected: v })}
            required
            readOnly={readOnly}
            error={errors.mtbDetected}
            warning={data.mtbDetected === 'no' ? 'MTB not detected — confirm diagnosis with investigator' : undefined}
          />
          <ChoiceField
            id="rifResistance"
            label="Rifampicin resistance"
            options={DETECTION_OPTIONS}
            value={data.rifResistance}
            onChange={(v) => update({ rifResistance: v })}
            required
            readOnly={readOnly}
            error={data.rifResistance === 'detected' ? undefined : errors.rifResistance}
          />
        </div>
        {data.rifResistance === 'detected' && (
          <Alert
            tone="danger"
            title="Rifampicin resistance detected — participant is ineligible"
            action={
              !readOnly ? (
                <Button variant="danger" size="sm" onClick={() => onDiscontinue('resistance')}>
                  Discontinue (drug resistance)
                </Button>
              ) : undefined
            }
          >
            This module cannot be completed. Refer for 2nd-line therapy and close out the participant in Module 10.
          </Alert>
        )}
        <fieldset>
          <legend className="mb-3 text-sm font-semibold text-ink-soft">Baseline MIC</legend>
          <div className="grid grid-cols-2 gap-4">
            {DRUGS.map((d) => (
              <InputField
                key={d.key}
                id={d.micKey}
                label={d.name}
                kind="decimal"
                unit="μg/mL"
                value={data[d.micKey]}
                onChange={num(d.micKey)}
                required
                readOnly={readOnly}
                error={errors[d.micKey]}
              />
            ))}
          </div>
        </fieldset>
      </SectionCard>
    </div>
  );
}
