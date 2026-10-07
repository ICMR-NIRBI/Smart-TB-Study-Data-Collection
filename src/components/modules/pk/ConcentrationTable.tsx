import React from 'react';
import { TIMEPOINTS } from '../../../data/timepoints';
import type { ConcEntry, DrugKey } from '../../../types/crf';

interface ConcentrationTableProps {
  drug: DrugKey;
  drugName: string;
  entries: Record<string, ConcEntry>;
  readOnly: boolean;
  errors: Record<string, string>;
  onChange: (tpKey: string, patch: Partial<ConcEntry>) => void;
}

function sanitize(raw: string): string {
  const cleaned = raw.replace(/,/g, '.').replace(/[^\d.]/g, '');
  const [head, ...rest] = cleaned.split('.');
  return rest.length ? `${head}.${rest.join('')}` : head;
}

export function ConcentrationTable({ drug, drugName, entries, readOnly, errors, onChange }: ConcentrationTableProps) {
  const cellCls = (invalid: boolean) =>
    `h-11 w-full rounded-lg border px-3 text-right text-base tabular-nums outline-none transition-colors duration-150 ${
      readOnly
        ? 'border-line bg-canvas text-ink'
        : invalid
          ? 'border-danger-600 bg-white focus:ring-2 focus:ring-danger-600/20'
          : 'border-line-strong bg-white focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20'
    }`;

  return (
    <table className="w-full text-sm">
      <caption className="sr-only">{drugName} plasma and saliva concentrations by timepoint</caption>
      <thead>
        <tr className="text-left text-xs font-medium text-ink-muted">
          <th scope="col" className="w-16 pb-2 font-medium">
            Time
          </th>
          <th scope="col" className="pb-2 pr-2 text-right font-medium">
            Plasma μg/mL
          </th>
          <th scope="col" className="pb-2 text-right font-medium">
            Saliva μg/mL
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {TIMEPOINTS.map((tp) => {
          const e = entries[tp.key];
          const plasmaErr = !!errors[`conc.${drug}.${tp.key}`];
          const salivaErr = !!errors[`conc.${drug}.${tp.key}.saliva`];
          return (
            <tr key={tp.key} data-field="true" data-field-error={plasmaErr ? 'true' : undefined}>
              <th scope="row" className="py-1.5 text-left font-semibold tabular-nums text-ink">
                {tp.label}
              </th>
              <td className="py-1.5 pr-2">
                {tp.salivaOnly ? (
                  <span className="flex h-11 items-center justify-end px-3 text-ink-muted">N/A</span>
                ) : (
                  <input
                    inputMode="decimal"
                    value={e.plasma}
                    readOnly={readOnly}
                    onChange={(ev) => onChange(tp.key, { plasma: sanitize(ev.target.value) })}
                    aria-label={`${drugName} plasma at ${tp.label}`}
                    aria-invalid={plasmaErr || undefined}
                    placeholder={readOnly ? '—' : '0.00'}
                    className={cellCls(plasmaErr)}
                  />
                )}
              </td>
              <td className="py-1.5">
                <input
                  inputMode="decimal"
                  value={e.saliva}
                  readOnly={readOnly}
                  onChange={(ev) => onChange(tp.key, { saliva: sanitize(ev.target.value) })}
                  aria-label={`${drugName} saliva at ${tp.label}`}
                  aria-invalid={salivaErr || undefined}
                  placeholder={readOnly ? '—' : '0.00'}
                  className={cellCls(salivaErr)}
                />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
