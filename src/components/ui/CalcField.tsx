import React from 'react';
import { CalculatorIcon } from 'lucide-react';

type CalcTone = 'default' | 'ok' | 'warn' | 'danger';

interface CalcFieldProps {
  label: string;
  value: string;
  unit?: string;
  tone?: CalcTone;
  note?: string;
  error?: string;
  className?: string;
}

const VALUE_TONE: Record<CalcTone, string> = {
  default: 'text-ink',
  ok: 'text-ok-700',
  warn: 'text-warn-700',
  danger: 'text-danger-700',
};

export function CalcField({ label, value, unit, tone = 'default', note, error, className = '' }: CalcFieldProps) {
  const effectiveTone: CalcTone = error ? 'danger' : tone;
  const message = error ?? note;
  return (
    <div
      className={`rounded-xl border border-dashed px-3.5 py-2.5 ${error ? 'border-danger-600 bg-danger-50' : 'border-line-strong bg-canvas'} ${className}`}
      data-field="true"
      data-field-error={error ? 'true' : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-ink-soft">{label}</span>
        <span className="inline-flex items-center gap-1 rounded-md bg-white px-1.5 py-0.5 text-[11px] font-medium text-ink-muted ring-1 ring-line">
          <CalculatorIcon className="h-3 w-3" aria-hidden="true" />
          calculated
        </span>
      </div>
      <p className={`mt-0.5 text-xl font-semibold tabular-nums ${VALUE_TONE[effectiveTone]}`} aria-live="polite">
        {value}
        {unit && value !== '—' && <span className="ml-1 text-sm font-medium text-ink-muted">{unit}</span>}
      </p>
      {message && (
        <p className={`mt-0.5 text-xs ${effectiveTone === 'danger' ? 'text-danger-700' : effectiveTone === 'warn' ? 'text-warn-700' : 'text-ink-muted'}`}>
          {message}
        </p>
      )}
    </div>
  );
}
