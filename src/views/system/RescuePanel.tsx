import React, { useEffect, useState } from 'react';
import { LockOpenIcon, LogOutIcon, MonitorSmartphoneIcon } from 'lucide-react';
import { SectionCard } from '../../components/ui/SectionCard';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { TextAreaField } from '../../components/ui/TextAreaField';
import { api } from '../../utils/api';
import { formatTimestamp } from '../../utils/dates';
import { MIN_ADMIN_REASON_LENGTH } from '../../utils/accountRules';

interface AccountChoice {
  id: string;
  name: string;
  email: string;
  roleLabel: string;
  status: string;
  isSelf: boolean;
}
interface AccountAccess {
  id: string;
  name: string;
  email: string;
  lock: { failedAttempts: number; lockedUntil: string | null };
  devices: { started: string; lastActive: string; device: string }[];
}

const fieldCls =
  'mt-2 h-12 w-full rounded-lg border border-line-strong bg-white px-3.5 text-base text-ink outline-none focus:border-brand-600 focus:ring-[3px] focus:ring-brand-600/20';

/** A locked sign-in and signed-in devices for one account: unlock it, or sign it out everywhere (a lost phone). */
export function RescuePanel({ accounts, onChanged }: { accounts: AccountChoice[]; onChanged: () => void }) {
  const [userId, setUserId] = useState('');
  const [access, setAccess] = useState<AccountAccess | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    setAccess(null);
    setDone(null);
    setError(null);
    if (!userId) return;
    let alive = true;
    api<AccountAccess>(`/api/system/accounts?id=${encodeURIComponent(userId)}`)
      .then((a) => alive && setAccess(a))
      .catch((err) => alive && setError(err instanceof Error ? err.message : 'Could not load the account'));
    return () => {
      alive = false;
    };
  }, [userId]);

  const chosen = accounts.find((a) => a.id === userId);
  const act = async (action: 'unlock' | 'signout') => {
    if (reason.trim().length < MIN_ADMIN_REASON_LENGTH) {
      setError(`Give a reason (at least ${MIN_ADMIN_REASON_LENGTH} characters)`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setAccess(await api<AccountAccess>('/api/system/accounts', { method: 'POST', body: { userId, action, reason } }));
      setDone(action === 'unlock' ? 'Sign-in unlocked. They can try again now.' : 'Signed out on every device. They need to sign in again.');
      setReason('');
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not do that');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard title="Account rescue" subtitle="Unlock a sign-in locked after wrong passwords, or sign someone out everywhere (for a lost phone).">
      <div className="space-y-4">
        <div>
          <label htmlFor="rescue-account" className="block text-sm font-semibold text-ink">
            Account
          </label>
          <select id="rescue-account" value={userId} onChange={(e) => setUserId(e.target.value)} className={fieldCls}>
            <option value="">Choose an account…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.email} · {a.roleLabel}
                {a.isSelf ? ' (you)' : a.status === 'deactivated' ? ' (deactivated)' : ''}
              </option>
            ))}
          </select>
        </div>
        {error && <Alert tone="danger" title={error} />}
        {done && <Alert tone="ok" title={done} />}
        {access && (
          <>
            <div className={`rounded-xl border p-3 ${access.lock.lockedUntil ? 'border-warn-200 bg-warn-50' : 'border-line'}`}>
              <p className="font-semibold text-ink">Sign-in</p>
              <p className="text-sm text-ink-soft">
                {access.lock.lockedUntil
                  ? `Locked after ${access.lock.failedAttempts} wrong passwords, until ${formatTimestamp(access.lock.lockedUntil)}.`
                  : access.lock.failedAttempts
                    ? `Not locked (${access.lock.failedAttempts} recent wrong password${access.lock.failedAttempts > 1 ? 's' : ''}).`
                    : 'Not locked.'}
              </p>
            </div>
            <div className="rounded-xl border border-line p-3">
              <p className="font-semibold text-ink">Signed in on {access.devices.length} device{access.devices.length === 1 ? '' : 's'}</p>
              {access.devices.length ? (
                <ul className="mt-1 divide-y divide-line">
                  {access.devices.map((d, i) => (
                    <li key={`${d.started}-${i}`} className="flex items-start gap-2 py-2 text-sm">
                      <MonitorSmartphoneIcon className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="font-medium text-ink">{d.device}</span>
                        <span className="block text-xs text-ink-muted">
                          Signed in {formatTimestamp(d.started)} · last active {formatTimestamp(d.lastActive)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-muted">Not signed in anywhere.</p>
              )}
            </div>
            <TextAreaField id="rescue-reason" label="Reason" value={reason} onChange={setReason} required rows={2} placeholder="e.g. Phone lost on the ward; confirmed by phone call" />
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" icon={<LockOpenIcon className="h-4 w-4" aria-hidden="true" />} onClick={() => void act('unlock')} disabled={busy || (!access.lock.lockedUntil && !access.lock.failedAttempts)}>
                Unlock sign-in
              </Button>
              <Button
                variant="danger-outline"
                icon={<LogOutIcon className="h-4 w-4" aria-hidden="true" />}
                onClick={() => void act('signout')}
                disabled={busy || chosen?.isSelf || !access.devices.length}
              >
                Sign out everywhere
              </Button>
            </div>
            {chosen?.isSelf && <p className="text-xs text-ink-muted">For your own account, use Sign out in your account menu.</p>}
          </>
        )}
      </div>
    </SectionCard>
  );
}
