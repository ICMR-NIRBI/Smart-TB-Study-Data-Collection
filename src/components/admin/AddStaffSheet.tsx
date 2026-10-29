import React, { useEffect, useState } from 'react';
import { LinkIcon } from 'lucide-react';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { ChoiceField } from '../ui/ChoiceField';
import { CheckToggle } from '../ui/CheckToggle';
import { Alert } from '../ui/Alert';
import type { RoleKey } from '../../data/roles';
import type { RoleInfo } from '../../types/roles';
import type { StaffInvite } from '../../types/invites';
import { api } from '../../utils/api';
import type { SetupLink } from '../../types/staff';

const roleOptions = (roles: RoleInfo[]) => roles.map((r) => ({ value: r.key, label: r.label, description: r.description }));

interface AddStaffSheetProps {
  open: boolean;
  roles: RoleInfo[];
  onClose: () => void;
  onCreated: (invite: StaffInvite, link: SetupLink) => void;
}

/** Only the role is chosen here. The new person types their own name, email and password from the link. */
export function AddStaffSheet({ open, roles, onClose, onCreated }: AddStaffSheetProps) {
  const [role, setRole] = useState<RoleKey | ''>('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setRole('');
      setIsAdmin(false);
      setTouched(false);
      setError(null);
    }
  }, [open]);

  const roleProblem = !role ? 'Choose a role' : undefined;

  const submit = async () => {
    setTouched(true);
    if (roleProblem || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ invite: StaffInvite; link: SetupLink }>('/api/admin/invites', { method: 'POST', body: { role, isAdmin } });
      onCreated(res.invite, res.link);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the link');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add staff"
      description="Choose the role, then send the link. They type their own name, email and password. You never see or choose the password."
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-[1.6]" icon={<LinkIcon className="h-4 w-4" aria-hidden="true" />} onClick={() => void submit()} disabled={busy}>
            {busy ? 'Creating…' : 'Create link'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="danger" title={error} />}
        <ChoiceField id="staff-role" label="Role" options={roleOptions(roles)} value={role} onChange={setRole} layout="stack" required error={touched ? roleProblem : undefined} />
        <CheckToggle
          label="Study administrator"
          description="Can manage staff accounts and see participant contact details. Keep to the PI and the data manager."
          checked={isAdmin}
          onChange={setIsAdmin}
        />
        <Alert tone="warn" title="Whoever opens the link creates the account">
          The link works once and ends after 72 hours. Send it only to the person it is for, through a private channel.
        </Alert>
      </div>
    </Sheet>
  );
}
