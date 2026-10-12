import React from 'react';
import { InputField } from './InputField';
import { todayISO } from '../../utils/dates';

interface SignOffFieldsProps {
  /** Field id for the name input; also the validation error key. */
  nameId: string;
  nameLabel: string;
  name: string;
  /** Field id for the date; validation error key is `signDate`. */
  dateId: string;
  date: string;
  onChange: (patch: { name: string; signDate: string }) => void;
  readOnly?: boolean;
  errors: Record<string, string>;
}

/**
 * Sign-off block: the typed name stands in for the signature, and the date is stamped automatically the moment a
 * name is entered (cleared again if the name is removed).
 */
export function SignOffFields({ nameId, nameLabel, name, dateId, date, onChange, readOnly, errors }: SignOffFieldsProps) {
  const setName = (v: string) => onChange({ name: v, signDate: v.trim() ? date || todayISO() : '' });

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <InputField
        id={nameId}
        label={nameLabel}
        value={name}
        onChange={setName}
        required
        readOnly={readOnly}
        error={errors[nameId]}
        hint={readOnly ? undefined : 'Your typed name is your signature'}
        autoComplete="name"
      />
      <InputField
        id={dateId}
        label="Date"
        kind="date"
        value={date}
        onChange={() => {}}
        readOnly
        error={errors.signDate}
        hint={readOnly ? undefined : 'Filled in automatically when the name is entered'}
      />
    </div>
  );
}
