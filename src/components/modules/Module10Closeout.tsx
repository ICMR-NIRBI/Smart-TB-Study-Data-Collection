import React from 'react';
import { InputField } from '../ui/InputField';
import { ChoiceField } from '../ui/ChoiceField';
import { CheckToggle } from '../ui/CheckToggle';
import { SignOffFields } from '../ui/SignOffFields';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { FormField } from '../ui/FormField';
import { DISCONTINUATION_REASONS } from '../../data/options';
import { PI_ATTESTATION } from '../../data/modules';
import { isIneligible } from '../../utils/gating';
import type { ModuleProps } from '../../types/crf';

export function Module10Closeout({ participant, data, update, readOnly, errors, onOpenModule }: ModuleProps<'m10'>) {
  const ineligible = isIneligible(participant);
  const m8Done = participant.meta[8].completed;
  const hasSae = participant.data.m9.events.some((e) => e.sae === 'yes');

  return (
    <div className="space-y-5">
      <InputField
        id="m10-date"
        label="Date of completion / discontinuation"
        kind="date"
        value={data.date}
        onChange={(v) => update({ date: v })}
        required
        readOnly={readOnly}
        error={errors.date}
      />

      {ineligible ? (
        <FormField label="Status" hint="Set automatically from Module 2 eligibility result">
          <div className="rounded-xl border border-danger-200 bg-danger-50 px-4 py-3">
            <p className="font-semibold text-danger-700">Prematurely discontinued</p>
            <p className="text-sm text-ink-soft">Reason: Screen failure</p>
          </div>
        </FormField>
      ) : (
        <>
          <ChoiceField
            id="m10-status"
            label="Status"
            options={[
              {
                value: 'completed',
                label: 'Successfully completed 2-month follow-up',
                tone: 'ok',
                disabled: !m8Done,
                description: m8Done ? undefined : 'Available once Module 8 is completed',
              },
              { value: 'discontinued', label: 'Prematurely discontinued', tone: 'warn' },
            ]}
            value={data.status}
            onChange={(v) => update({ status: v, reason: v === 'completed' ? '' : data.reason })}
            layout="stack"
            required
            readOnly={readOnly}
            error={errors.status}
          />
          {data.status === 'discontinued' && (
            <ChoiceField
              id="m10-reason"
              label="Reason for discontinuation"
              options={DISCONTINUATION_REASONS}
              value={data.reason === 'screen_failure' ? '' : data.reason}
              onChange={(v) => update({ reason: v })}
              layout="stack"
              required
              readOnly={readOnly}
              error={errors.reason}
            />
          )}
          {data.reason === 'death' &&
            (hasSae ? (
              <Alert tone="ok" title="SAE documented in Module 9" />
            ) : (
              <Alert
                tone="danger"
                title="SAE documentation required"
                action={
                  <Button variant="danger" size="sm" onClick={() => onOpenModule(9)}>
                    Open Module 9 – Adverse events
                  </Button>
                }
              >
                Record the fatal event as a Serious Adverse Event before closing the record.
              </Alert>
            ))}
        </>
      )}

      <section aria-labelledby="pi-attest" className="space-y-4 rounded-2xl border border-line bg-white p-4">
        <h3 id="pi-attest" className="font-semibold text-ink">
          Principal Investigator attestation
        </h3>
        <div data-field="true" data-field-error={errors.attest ? 'true' : undefined}>
          <CheckToggle label={PI_ATTESTATION} checked={data.attest} onChange={(v) => update({ attest: v })} readOnly={readOnly} invalid={!!errors.attest} />
          {errors.attest && <p className="mt-1.5 text-sm text-danger-700">{errors.attest}</p>}
        </div>
        <SignOffFields
          nameId="piName"
          nameLabel="PI name"
          name={data.piName}
          dateId="m10-signDate"
          date={data.signDate}
          onChange={({ name, signDate }) => update({ piName: name, signDate })}
          readOnly={readOnly}
          errors={errors}
        />
      </section>

      {!readOnly && (
        <Alert tone="neutral" title="Closing locks the entire record">
          All modules become read-only and the participant is marked {ineligible ? 'Ineligible' : data.status === 'completed' ? 'Completed' : 'Discontinued'} on the dashboard.
        </Alert>
      )}
    </div>
  );
}
