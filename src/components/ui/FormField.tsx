import React from 'react';
import { AlertCircleIcon, AlertTriangleIcon } from 'lucide-react';

interface FormFieldProps {
  label: string;
  htmlFor?: string;
  labelId?: string;
  messageId?: string;
  required?: boolean;
  hint?: React.ReactNode;
  error?: string;
  warning?: string;
  className?: string;
  children: React.ReactNode;
}

export function FormField({ label, htmlFor, labelId, messageId, required, hint, error, warning, className = '', children }: FormFieldProps) {
  const labelCls = 'mb-1.5 block text-sm font-medium text-ink';
  const labelContent = (
    <>
      {label}
      {required && (
        <span className="text-danger-600" aria-hidden="true">
          {' '}*
        </span>
      )}
    </>
  );
  return (
    <div className={className} data-field="true" data-field-error={error ? 'true' : undefined}>
      {htmlFor ? (
        <label htmlFor={htmlFor} id={labelId} className={labelCls}>
          {labelContent}
        </label>
      ) : (
        <div id={labelId} className={labelCls}>
          {labelContent}
        </div>
      )}
      {children}
      {error ? (
        <p id={messageId} className="mt-1.5 flex items-start gap-1.5 text-sm text-danger-700">
          <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : warning ? (
        <p id={messageId} className="mt-1.5 flex items-start gap-1.5 text-sm text-warn-700">
          <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{warning}</span>
        </p>
      ) : hint ? (
        <div id={messageId} className="mt-1.5 text-sm text-ink-muted">
          {hint}
        </div>
      ) : null}
    </div>
  );
}
