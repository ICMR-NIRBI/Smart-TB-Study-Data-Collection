import React from 'react';
import { FormField } from './FormField';

interface TextAreaFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  error?: string;
  hint?: React.ReactNode;
  readOnly?: boolean;
  rows?: number;
  className?: string;
}

export function TextAreaField({ id, label, value, onChange, placeholder, required, error, hint, readOnly, rows = 3, className }: TextAreaFieldProps) {
  return (
    <FormField label={label} htmlFor={id} required={required} error={error} hint={hint} messageId={`${id}-msg`} className={className}>
      <textarea
        id={id}
        value={value}
        rows={rows}
        readOnly={readOnly}
        placeholder={readOnly ? '—' : placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${id}-msg` : undefined}
        className={`block w-full resize-y rounded-xl border px-3 py-2.5 text-base text-ink outline-none transition-colors duration-150 placeholder:text-ink-muted/70 ${
          readOnly
            ? 'border-line bg-canvas'
            : error
              ? 'border-danger-600 bg-white focus:ring-2 focus:ring-danger-600/20'
              : 'border-line-strong bg-white focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20'
        }`}
      />
    </FormField>
  );
}
