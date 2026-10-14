import React, { useEffect, useState } from 'react';
import { UserPlusIcon } from 'lucide-react';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { InputField } from '../ui/InputField';
import { ChoiceField } from '../ui/ChoiceField';
import { CheckToggle } from '../ui/CheckToggle';
import { Alert } from '../ui/Alert';
import { ROLE_KEYS, ROLE_LABELS, ROLE_SUMMARY, type RoleKey } from '../../data/roles';
import { api } from '../../utils/api';
import { EMAIL_RE } from '../../utils/accountRules';
import type { SetupLink, StaffMember } from '../../types/staff';

const ROLE_OPTIONS = ROLE_KEYS.map((r) => ({ value: r, label: ROLE_LABELS[r], description: ROLE_SUMMARY[r] }));

interface AddStaffSheetProps {
  open: boolean;
  onClose: () => void;
  onCreated: (member: StaffMember, link: SetupLink) => void;
}

export function AddStaffSheet({ open, onClose, onCreated }: AddStaffSheetProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<RoleKey | ''>('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName('');
      setEmail('');
      setRole('');
      setIsAdmin(false);
      setTouched(false);
      setError(null);
    }
  }, [open]);

  const errors = {
    name: name.trim().length < 2 ? 'Enter the full name' : undefined,
    email: !EMAIL_RE.test(email.trim()) ? 'Enter a valid email address' : undefined,
    role: !role ? 'Choose a role' : undefined,
  };
  const valid = !errors.name && !errors.email && !errors.role;

  const submit = async () => {
    setTouched(true);
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ member: StaffMember; link: SetupLink }>('/api/admin/staff', {
        method: 'POST',
        body: { name: name.trim(), email: email.trim(), role, isAdmin },
      });
      onCreated(res.member, res.link);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add staff');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add staff"
      description="They receive a one-time link to set their own password. You never see or choose it."
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-[1.6]" icon={<UserPlusIcon className="h-4 w-4" aria-hidden="true" />} onClick={() => void submit()} disabled={busy}>
            {busy ? 'Adding…' : 'Add and create link'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="danger" title={error} />}
        <InputField id="staff-name" label="Full name" value={name} onChange={setName} required autoComplete="off" error={touched ? errors.name : undefined} />
        <InputField
          id="staff-email"
          label="Email address"
          value={email}
          onChange={setEmail}
          required
          autoComplete="off"
          inputMode="email"
          hint="Their sign-in name. One person per account; accounts are never shared."
          error={touched ? errors.email : undefined}
        />
        <ChoiceField id="staff-role" label="Role" options={ROLE_OPTIONS} value={role} onChange={setRole} layout="stack" required error={touched ? errors.role : undefined} />
        <CheckToggle
          label="Study administrator"
          description="Can manage staff accounts and see participant contact details. Keep to the PI and the data manager."
          checked={isAdmin}
          onChange={setIsAdmin}
        />
      </div>
    </Sheet>
  );
}
