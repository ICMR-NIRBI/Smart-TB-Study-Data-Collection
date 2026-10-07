import React from 'react';
import { LockIcon } from 'lucide-react';
import { InputField } from '../ui/InputField';
import { ChoiceField } from '../ui/ChoiceField';
import { CalcField } from '../ui/CalcField';
import { SITE_NAME } from '../../data/modules';
import { GENDER_OPTIONS } from '../../data/options';
import { ageInYears } from '../../utils/dates';
import type { ModuleProps } from '../../types/crf';

const PREFIX = 'SMART-TB-';

function formatIdSuffix(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 6);
  return digits.length > 3 ? `${digits.slice(0, 3)}-${digits.slice(3)}` : digits;
}

export function Module1Identification({ data, update, readOnly, errors }: ModuleProps<'m1'>) {
  const age = ageInYears(data.dob, data.screeningDate);
  const underage = age !== null && age >= 0 && age < 18;
  const suffix = data.participantId.startsWith(PREFIX) ? data.participantId.slice(PREFIX.length) : data.participantId;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <InputField
          id="participantId"
          label="Participant ID"
          prefix={PREFIX}
          value={suffix}
          onChange={(v) => {
            const s = formatIdSuffix(v);
            update({ participantId: s ? `${PREFIX}${s}` : '' });
          }}
          inputMode="numeric"
          placeholder="___-___"
          required
          readOnly={readOnly}
          error={errors.participantId}
          hint="Site code + serial number, e.g. 001-012"
        />
        <InputField id="site" label="Recruitment site" value={SITE_NAME} onChange={() => undefined} readOnly />
        <InputField
          id="screeningDate"
          label="Date of screening"
          kind="date"
          value={data.screeningDate}
          onChange={(v) => update({ screeningDate: v })}
          required
          readOnly={readOnly}
          error={errors.screeningDate}
        />
        <InputField
          id="dob"
          label="Date of birth"
          kind="date"
          value={data.dob}
          onChange={(v) => update({ dob: v })}
          required
          readOnly={readOnly}
          error={errors.dob}
        />
        <CalcField
          label="Age at screening"
          value={age === null || age < 0 ? '—' : String(age)}
          unit="years"
          tone={age === null ? 'default' : underage ? 'danger' : 'ok'}
          note={age === null ? 'From date of birth and screening date' : underage ? undefined : 'Meets ≥18 years requirement'}
          error={errors.age ?? (underage ? 'Participant must be ≥18 years at screening' : undefined)}
        />
        <ChoiceField
          id="gender"
          label="Gender"
          options={GENDER_OPTIONS}
          value={data.gender}
          onChange={(v) => update({ gender: v })}
          required
          readOnly={readOnly}
          error={errors.gender}
        />
        <InputField
          id="ethnicity"
          label="Race / Ethnicity"
          value={data.ethnicity}
          onChange={(v) => update({ ethnicity: v })}
          required
          readOnly={readOnly}
          error={errors.ethnicity}
          className="sm:col-span-2"
        />
      </div>

      <section aria-labelledby="confidential-heading" className="overflow-hidden rounded-2xl border border-line-strong bg-white">
        <div className="flex items-start gap-3 border-b border-line bg-canvas px-4 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink text-white">
            <LockIcon className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <h3 id="confidential-heading" className="text-sm font-semibold text-ink">
              Confidential – stored in Master Link Log only, not in study dataset
            </h3>
            <p className="mt-0.5 text-xs text-ink-muted">Identifiers are held separately from coded study data.</p>
          </div>
        </div>
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <InputField
            id="phone"
            label="Contact phone"
            kind="tel"
            value={data.phone}
            onChange={(v) => update({ phone: v })}
            required
            readOnly={readOnly}
            error={errors.phone}
            autoComplete="off"
          />
          <InputField
            id="address"
            label="Address / Sub-district"
            value={data.address}
            onChange={(v) => update({ address: v })}
            required
            readOnly={readOnly}
            error={errors.address}
          />
        </div>
      </section>
    </div>
  );
}
