import React from 'react';
import { CheckIcon } from 'lucide-react';

interface CheckToggleProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  readOnly?: boolean;
  invalid?: boolean;
}

export function CheckToggle({ label, description, checked, onChange, readOnly, invalid }: CheckToggleProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-invalid={invalid || undefined}
      disabled={readOnly}
      onClick={() => onChange(!checked)}
      className={`flex min-h-[48px] w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-[background-color,border-color] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 disabled:cursor-default ${
        checked
          ? 'border-ok-600 bg-ok-50'
          : invalid
            ? 'border-danger-600 bg-white'
            : `border-line-strong bg-white ${readOnly ? 'opacity-60' : 'hover:bg-canvas'}`
      }`}
    >
      <span
        aria-hidden="true"
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors duration-150 ${
          checked ? 'border-ok-600 bg-ok-600 text-white' : 'border-line-strong bg-white'
        }`}
      >
        {checked && <CheckIcon className="h-4 w-4" strokeWidth={3} />}
      </span>
      <span className="flex flex-col">
        <span className="font-medium text-ink">{label}</span>
        {description && <span className="text-xs text-ink-muted">{description}</span>}
      </span>
    </button>
  );
}
