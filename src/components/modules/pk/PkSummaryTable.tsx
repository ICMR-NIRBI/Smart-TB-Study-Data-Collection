import React from 'react';
import { CalculatorIcon } from 'lucide-react';
import { DRUGS } from '../../../data/drugs';
import { fmt } from '../../../utils/clinical';
import type { PkSummary } from '../../../utils/pk';
import type { DrugKey } from '../../../types/crf';

interface PkSummaryTableProps {
  results: Record<DrugKey, PkSummary>;
}

const ROWS: { key: keyof PkSummary; label: string; unit: string; digits: number }[] = [
  { key: 'cmax', label: 'Cmax', unit: 'μg/mL', digits: 2 },
  { key: 'tmax', label: 'Tmax', unit: 'h', digits: 1 },
  { key: 'auc', label: 'AUC0–24', unit: 'μg·h/mL', digits: 1 },
  { key: 'mic', label: 'Baseline MIC', unit: 'μg/mL', digits: 2 },
  { key: 'cmaxMic', label: 'Cmax/MIC', unit: '', digits: 1 },
  { key: 'aucMic', label: 'AUC0–24/MIC', unit: '', digits: 1 },
  { key: 'tAboveMic', label: 'T>MIC', unit: 'h', digits: 1 },
];

export function PkSummaryTable({ results }: PkSummaryTableProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <p className="text-sm text-ink-muted">From plasma, linear trapezoidal; MIC from Module 3</p>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-canvas px-1.5 py-0.5 text-[11px] font-medium text-ink-muted ring-1 ring-line">
          <CalculatorIcon className="h-3 w-3" aria-hidden="true" />
          calculated
        </span>
      </div>
      <table className="w-full text-sm">
        <caption className="sr-only">Derived PK parameters per drug</caption>
        <thead className="bg-canvas">
          <tr>
            <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-ink-muted">
              Parameter
            </th>
            {DRUGS.map((d) => (
              <th key={d.key} scope="col" className="px-2 py-2 text-right" title={d.name}>
                <span className="block text-sm font-semibold text-ink">{d.key}</span>
                <span className="hidden text-xs font-normal text-ink-muted sm:block">{d.name}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {ROWS.map((row) => (
            <tr key={row.key}>
              <th scope="row" className="px-4 py-2.5 text-left font-medium text-ink">
                {row.label}
                {row.unit && <span className="block text-xs font-normal text-ink-muted">{row.unit}</span>}
              </th>
              {DRUGS.map((d) => {
                const v = results[d.key][row.key];
                return (
                  <td key={d.key} className="px-2 py-2.5 text-right tabular-nums text-ink">
                    {fmt(typeof v === 'number' ? v : null, row.digits)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
