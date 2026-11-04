import React, { useEffect, useState } from 'react';
import { CheckIcon, HourglassIcon, Loader2Icon, UserCogIcon } from 'lucide-react';
import { SectionCard } from '../../components/ui/SectionCard';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { api } from '../../utils/api';
import { formatTimestamp } from '../../utils/dates';

export interface RoleAccount {
  id: string;
  name: string;
  email: string;
  role: string;
  roleLabel: string;
  /** Set while the role cannot be changed again; '' otherwise. */
  roleLockedUntil: string;
  status: 'invited' | 'active' | 'deactivated';
  isSelf: boolean;
}
export interface RoleChoice {
  key: string;
  label: string;
}

const selectCls =
  'h-11 w-full min-w-0 rounded-lg border border-line-strong bg-white px-3 text-base text-ink outline-none focus:border-brand-600 focus:ring-[3px] focus:ring-brand-600/20 disabled:bg-canvas disabled:text-ink-muted';

/** Minutes left on a cooldown, rounded up; 0 once it has passed. */
function minutesLeft(until: string, now: number): number {
  if (!until) return 0;
  return Math.max(0, Math.ceil((new Date(until).getTime() - now) / 60_000));
}

function RoleRow({ account, roles, cooldown, now, onChanged }: { account: RoleAccount; roles: RoleChoice[]; cooldown: number; now: number; onChanged: () => void }) {
  const [role, setRole] = useState(account.role);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  useEffect(() => setRole(account.role), [account.role]);

  const left = minutesLeft(account.roleLockedUntil, now);
  const blocked = account.isSelf || account.status === 'deactivated';
  const apply = async () => {
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      await api('/api/system/accounts', { method: 'POST', body: { userId: account.id, action: 'role', role } });
      setDone(true);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the role');
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-[10rem] flex-1">
          <p className="truncate font-medium text-ink">
            {account.name}
            {account.isSelf ? ' (you)' : account.status === 'deactivated' ? ' (deactivated)' : account.status === 'invited' ? ' (invited)' : ''}
          </p>
          <p className="truncate text-xs text-ink-muted">{account.email}</p>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <label htmlFor={`role-${account.id}`} className="sr-only">
            Role for {account.name}
          </label>
          <select
            id={`role-${account.id}`}
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setDone(false);
            }}
            disabled={blocked || left > 0 || busy}
            className={`${selectCls} sm:w-56`}
          >
            {roles.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
            {!roles.some((r) => r.key === account.role) && <option value={account.role}>{account.roleLabel}</option>}
          </select>
          <Button
            variant="secondary"
            className="shrink-0"
            icon={busy ? <Loader2Icon className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckIcon className="h-4 w-4" aria-hidden="true" />}
            onClick={() => void apply()}
            disabled={blocked || left > 0 || busy || role === account.role}
          >
            Change
          </Button>
        </div>
      </div>
      {left > 0 && (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-warn-700">
          <HourglassIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Role changed recently. It can be changed again in {left} min (at {formatTimestamp(account.roleLockedUntil)}).
        </p>
      )}
      {done && <p className="mt-1.5 text-xs font-medium text-ok-700">Role changed. It applies from their next click; it can be changed again after {cooldown} minutes.</p>}
      {account.isSelf && <p className="mt-1.5 text-xs text-ink-muted">Your own role is changed by another administrator.</p>}
      {error && (
        <div className="mt-2">
          <Alert tone="danger" title={error} />
        </div>
      )}
    </li>
  );
}

/** Change any account's role with one click. After a change the account's role is held for the cooldown. */
export function RolesPanel({ accounts, roles, cooldown, onChanged }: { accounts: RoleAccount[]; roles: RoleChoice[]; cooldown: number; onChanged: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <SectionCard
      title="Roles"
      subtitle={`Pick a new role and press Change. Each change is in the audit trail, and that account's role is then held for ${cooldown} minutes so it is not flipped back and forth by mistake.`}
    >
      <div className="flex items-center gap-2 text-sm text-ink-muted">
        <UserCogIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
        {accounts.length} account{accounts.length === 1 ? '' : 's'}
      </div>
      <ul className="divide-y divide-line">
        {accounts.map((a) => (
          <RoleRow key={a.id} account={a} roles={roles} cooldown={cooldown} now={now} onChanged={onChanged} />
        ))}
      </ul>
    </SectionCard>
  );
}
