import React, { useState } from 'react';
import { LockIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { InputField } from '../ui/InputField';
import { CheckToggle } from '../ui/CheckToggle';
import { Alert } from '../ui/Alert';
import { MODULES } from '../../data/modules';
import { api } from '../../utils/api';
import type { ModuleId } from '../../types/crf';
import type { RoleInfo } from '../../types/roles';

interface RolesSheetProps {
  open: boolean;
  roles: RoleInfo[];
  onClose: () => void;
  /** Called after a role is added or removed, so the lists can reload. */
  onChanged: (message: string) => void;
}

export function RolesSheet({ open, roles, onClose, onChanged }: RolesSheetProps) {
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [modules, setModules] = useState<ModuleId[]>([]);
  const [touched, setTouched] = useState(false);
  const [removing, setRemoving] = useState<RoleInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setAdding(false);
    setRemoving(null);
    setLabel('');
    setDescription('');
    setModules([]);
    setTouched(false);
    setError(null);
  };
  const close = () => {
    reset();
    onClose();
  };

  const nameProblem = label.trim().length < 2 ? 'Give the role a name (at least 2 characters)' : undefined;

  const save = async () => {
    setTouched(true);
    if (nameProblem || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api('/api/admin/roles', { method: 'POST', body: { label, description, modules } });
      const name = label.trim();
      reset();
      onChanged(`Role “${name}” added`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the role');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (role: RoleInfo) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/roles/${role.key}`, { method: 'DELETE' });
      setRemoving(null);
      onChanged(`Role “${role.label}” removed`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove the role');
      setRemoving(null);
    } finally {
      setBusy(false);
    }
  };

  if (adding) {
    return (
      <Sheet
        open={open}
        onClose={() => setAdding(false)}
        title="Add a role"
        description="Create the role first, then give it to people from their staff page."
        footer={
          <>
            <Button variant="secondary" className="flex-1" onClick={() => setAdding(false)} disabled={busy}>
              Back
            </Button>
            <Button className="flex-[1.6]" icon={<PlusIcon className="h-4 w-4" aria-hidden="true" />} onClick={() => void save()} disabled={busy}>
              {busy ? 'Adding…' : 'Add role'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error && <Alert tone="danger" title={error} />}
          <InputField id="role-name" label="Role name" value={label} onChange={setLabel} required maxLength={40} autoComplete="off" error={touched ? nameProblem : undefined} />
          <InputField id="role-description" label="Short description (optional)" value={description} onChange={setDescription} maxLength={140} autoComplete="off" />
          <div className="space-y-2">
            <p className="text-sm font-medium text-ink">Modules this role fills in</p>
            <p className="text-sm text-ink-muted">
              Everyone signed in can view study data. Leave all unticked for a view-only role. Signing off Modules 2 and 10 stays with the PI.
            </p>
            <ul className="space-y-2">
              {MODULES.map((m) => (
                <li key={m.id}>
                  <CheckToggle
                    label={`Module ${m.id} · ${m.short}`}
                    checked={modules.includes(m.id)}
                    onChange={(on) => setModules((cur) => (on ? [...cur, m.id].sort((a, b) => a - b) : cur.filter((x) => x !== m.id)))}
                  />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Roles"
      description="Add a role before giving it to someone, or remove one nobody has."
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={close}>
            Close
          </Button>
          <Button className="flex-[1.6]" icon={<PlusIcon className="h-4 w-4" aria-hidden="true" />} onClick={() => { setError(null); setAdding(true); }}>
            Add a role
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="danger" title={error} />}
        <ul className="space-y-2">
          {roles.map((r) => (
            <li key={r.key} className="rounded-2xl border border-line bg-white p-4">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">
                    {r.label}
                    {r.builtin && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-canvas px-2 py-0.5 align-middle text-xs font-medium text-ink-muted">
                        <LockIcon className="h-3 w-3" aria-hidden="true" /> Built in
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-sm text-ink-soft">{r.description}</p>
                  <p className="mt-1 text-xs text-ink-muted">{r.members === 0 ? 'Nobody has this role' : `${r.members} ${r.members === 1 ? 'person' : 'people'}`}</p>
                </div>
                {!r.builtin && (
                  <Button variant="danger-outline" icon={<Trash2Icon className="h-4 w-4" aria-hidden="true" />} onClick={() => { setError(null); setRemoving(r); }} disabled={busy}>
                    Remove
                  </Button>
                )}
              </div>
              {removing?.key === r.key && (
                <div className="mt-3 space-y-3 border-t border-line pt-3">
                  <p className="text-sm text-ink-soft">
                    {r.members > 0
                      ? `${r.members} ${r.members === 1 ? 'person has' : 'people have'} this role. Move them to another role from their staff page first.`
                      : `Remove “${r.label}”? It disappears from the role lists. The change is kept in the audit trail.`}
                  </p>
                  <div className="flex gap-2">
                    <Button variant="secondary" className="flex-1" onClick={() => setRemoving(null)} disabled={busy}>
                      Keep it
                    </Button>
                    {r.members === 0 && (
                      <Button variant="danger" className="flex-1" onClick={() => void remove(r)} disabled={busy}>
                        {busy ? 'Removing…' : 'Remove role'}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Sheet>
  );
}
