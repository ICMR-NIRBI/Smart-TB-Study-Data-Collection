import React from 'react';
import { CalendarIcon, ClockIcon } from 'lucide-react';
import { FormField } from './FormField';
import { formatDMY } from '../../utils/dates';

type InputKind = 'text' | 'decimal' | 'integer' | 'date' | 'time' | 'tel';

interface InputFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  kind?: InputKind;
  unit?: string;
  prefix?: string;
  placeholder?: string;
  required?: boolean;
  error?: string;
  warning?: string;
  hint?: React.ReactNode;
  readOnly?: boolean;
  maxLength?: number;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  action?: React.ReactNode;
  autoComplete?: string;
  className?: string;
}

function sanitize(kind: InputKind, raw: string): string {
  if (kind === 'decimal') {
    const cleaned = raw.replace(/,/g, '.').replace(/[^\d.]/g, '');
    const [head, ...rest] = cleaned.split('.');
    return rest.length ? `${head}.${rest.join('')}` : head;
  }
  if (kind === 'integer') return raw.replace(/\D/g, '');
  if (kind === 'time') {
    const digits = raw.replace(/\D/g, '').slice(0, 4);
    return digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
  }
  return raw;
}

export function InputField({
  id,
  label,
  value,
  onChange,
  kind = 'text',
  unit,
  prefix,
  placeholder,
  required,
  error,
  warning,
  hint,
  readOnly,
  maxLength,
  inputMode,
  action,
  autoComplete = 'off',
  className,
}: InputFieldProps) {
  const messageId = `${id}-msg`;
  const describedBy = error || warning || hint ? messageId : undefined;
  const box = 'relative flex min-h-[48px] w-full items-stretch overflow-hidden rounded-xl border text-base transition-colors duration-150';
  const state = readOnly
    ? 'border-line bg-canvas'
    : error
      ? 'border-danger-600 bg-white focus-within:ring-2 focus-within:ring-danger-600/20'
      : 'border-line-strong bg-white focus-within:border-brand-600 focus-within:ring-2 focus-within:ring-brand-600/20';
  const display = kind === 'date' ? formatDMY(value) : value;
  const numeric = kind === 'decimal' || kind === 'integer' || kind === 'time';

  const prefixNode = prefix ? (
    <span className="flex items-center whitespace-nowrap pl-3 text-ink-muted tabular-nums">{prefix}</span>
  ) : null;
  const unitNode = unit ? (
    <span className="flex shrink-0 items-center border-l border-line bg-canvas px-3 text-sm text-ink-muted">{unit}</span>
  ) : null;
  const icon =
    kind === 'date' ? (
      <CalendarIcon className="ml-3 h-5 w-5 shrink-0 self-center text-ink-muted" aria-hidden="true" />
    ) : kind === 'time' ? (
      <ClockIcon className="ml-3 h-5 w-5 shrink-0 self-center text-ink-muted" aria-hidden="true" />
    ) : null;

  let control: React.ReactNode;
  if (readOnly) {
    control = (
      <div className={`${box} ${state}`}>
        {icon}
        {prefixNode}
        <span id={id} className={`flex flex-1 items-center py-2.5 text-ink ${prefix ? 'pl-0.5 pr-3' : 'px-3'} ${numeric ? 'tabular-nums' : ''}`}>
          {display || <span className="text-ink-muted">—</span>}
        </span>
        {unitNode}
      </div>
    );
  } else if (kind === 'date') {
    control = (
      <div className={`${box} ${state}`}>
        {icon}
        <span aria-hidden="true" className={`flex flex-1 items-center px-3 tabular-nums ${display ? 'text-ink' : 'text-ink-muted'}`}>
          {display || 'DD/MM/YYYY'}
        </span>
        <input
          id={id}
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onClick={(e) => {
            try {
              (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
            } catch {
              /* picker not supported */
            }
          }}
          aria-invalid={error ? true : undefined}
          aria-required={required}
          aria-describedby={describedBy}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>
    );
  } else {
    control = (
      <div className={`${box} ${state}`}>
        {icon}
        {prefixNode}
        <input
          id={id}
          type={kind === 'tel' ? 'tel' : 'text'}
          inputMode={inputMode ?? (kind === 'decimal' ? 'decimal' : kind === 'integer' || kind === 'time' ? 'numeric' : kind === 'tel' ? 'tel' : undefined)}
          value={value}
          onChange={(e) => onChange(sanitize(kind, e.target.value))}
          placeholder={placeholder ?? (kind === 'time' ? 'HH:MM' : undefined)}
          maxLength={kind === 'time' ? 5 : maxLength}
          autoComplete={autoComplete}
          aria-invalid={error ? true : undefined}
          aria-required={required}
          aria-describedby={describedBy}
          className={`min-w-0 flex-1 bg-transparent py-2.5 text-ink outline-none placeholder:text-ink-muted/70 ${prefix ? 'pl-0.5 pr-3' : 'px-3'} ${numeric ? 'tabular-nums' : ''}`}
        />
        {unitNode}
      </div>
    );
  }

  return (
    <FormField label={label} htmlFor={id} required={required} error={error} warning={warning} hint={hint} messageId={messageId} className={className}>
      {action && !readOnly ? (
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">{control}</div>
          {action}
        </div>
      ) : (
        control
      )}
    </FormField>
  );
}
