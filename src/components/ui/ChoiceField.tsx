import React from 'react';
import { FormField } from './FormField';
import { SegmentedControl } from './SegmentedControl';
import type { SegmentOption } from '../../types/ui';

interface ChoiceFieldProps<T extends string> {
  id: string;
  label: string;
  options: SegmentOption<T>[];
  value: T | '';
  onChange: (value: T) => void;
  readOnly?: boolean;
  required?: boolean;
  error?: string;
  warning?: string;
  hint?: React.ReactNode;
  layout?: 'row' | 'stack';
  columns?: number;
  className?: string;
}

export function ChoiceField<T extends string>({
  id,
  label,
  options,
  value,
  onChange,
  readOnly,
  required,
  error,
  warning,
  hint,
  layout,
  columns,
  className,
}: ChoiceFieldProps<T>) {
  const labelId = `${id}-label`;
  const messageId = `${id}-msg`;
  return (
    <FormField label={label} labelId={labelId} messageId={messageId} required={required} error={error} warning={warning} hint={hint} className={className}>
      <SegmentedControl
        options={options}
        value={value}
        onChange={onChange}
        readOnly={readOnly}
        invalid={!!error}
        labelledBy={labelId}
        describedBy={error || warning || hint ? messageId : undefined}
        layout={layout}
        columns={columns}
      />
    </FormField>
  );
}
