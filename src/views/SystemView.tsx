import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeftIcon, KeyRoundIcon, Loader2Icon, RefreshCwIcon, ShuffleIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { SectionCard } from '../components/ui/SectionCard';
import { Button } from '../components/ui/Button';
import { InputField } from '../components/ui/InputField';
import { TextAreaField } from '../components/ui/TextAreaField';
import { CheckToggle } from '../components/ui/CheckToggle';
import { Alert } from '../components/ui/Alert';
import { api } from '../utils/api';
import { formatTimestamp } from '../utils/dates';
import { MIN_ADMIN_REASON_LENGTH, generateTemporaryPassword, passwordProblem } from '../utils/accountRules';

interface Status {
  database: 'ok' | 'error';
  databaseDetail: string;
  accounts: number;
  activeAccounts: number;
  participants: number;
  auditEntries: number;
  lastBackup: { file: string; at: string; bytes: number; count: number } | null;
  backupDetail: string;
  serverTime: string;
}
interface Account {
  id: string;
  name: string;
  email: string;
  roleLabel: string;
  status: 'invited' | 'active' | 'deactivated';
  isSelf: boolean;
}
interface LogEntry {
  at: string;
  event: string;
  account: string;
  by: string;
  detail: string;
}
interface Logs {
  signIns: LogEntry[];
  failedSignIns: LogEntry[];
  passwords: LogEntry[];
  errors: LogEntry[];
}
type LogTab = keyof Logs;

const TABS: { key: LogTab; label: string }[] = [
  { key: 'signIns', label: 'Sign-ins' },
  { key: 'failedSignIns', label: 'Failed sign-ins' },
  { key: 'passwords', label: 'Passwords' },
  { key: 'errors', label: 'Errors' },
];

const fieldCls =
  'mt-2 h-12 w-full rounded-lg border border-line-strong bg-white px-3.5 text-base text-ink outline-none focus:border-brand-600 focus:ring-[3px] focus:ring-brand-600/20';

function Stat({ label, value, sub, bad }: { label: string; value: string; sub?: string; bad?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${bad ? 'border-danger-200 bg-danger-50' : 'border-line bg-white'}`}>
      <p className="text-xs font-medium text-ink-muted">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold tabular-nums ${bad ? 'text-danger-700' : 'text-ink'}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-ink-muted">{sub}</p>}
    </div>
  );
}

/** For the person who looks after the whole application: status, setting any account's password, and the logs. */
export function SystemView() {
  const { session } = useAuth();
  const [status, setStatus] = useState<Status | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [logs, setLogs] = useState<Logs | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<LogTab>('signIns');

  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [mustChange, setMustChange] = useState(true);
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ email: string; name: string; mustChange: boolean; password: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ status: Status; accounts: Account[]; logs: Logs }>('/api/system');
      setStatus(res.status);
      setAccounts(res.accounts);
      setLogs(res.logs);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session?.isSystemAdmin) void load();
  }, [session?.isSystemAdmin, load]);

  if (session && !session.isSystemAdmin) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-canvas px-4 text-center">
        <p className="font-medium text-ink">This page is only for the system administrator.</p>
        <Link href="/" className="flex min-h-[48px] items-center rounded-xl bg-brand-600 px-5 font-semibold text-white hover:bg-brand-700">
          Back to dashboard
        </Link>
      </main>
    );
  }

  const chosen = accounts.find((a) => a.id === userId);
  const problems = {
    account: !userId ? 'Choose an account' : undefined,
    password: !password ? 'Enter a password' : chosen ? (passwordProblem(password, chosen.email) ?? undefined) : undefined,
    reason: reason.trim().length < MIN_ADMIN_REASON_LENGTH ? `Enter at least ${MIN_ADMIN_REASON_LENGTH} characters` : undefined,
  };

  const submit = async () => {
    setTouched(true);
    if (problems.account || problems.password || problems.reason || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ email: string; name: string; mustChange: boolean }>('/api/system/password', {
        method: 'POST',
        body: { userId, password, mustChange, reason },
      });
      setDone({ ...res, password });
      setUserId('');
      setPassword('');
      setReason('');
      setTouched(false);
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not set the password');
    } finally {
      setBusy(false);
    }
  };

  const entries = logs?.[tab] ?? [];

  return (
    <div className="min-h-screen w-full bg-canvas">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 pb-4 pt-5">
          <Link
            href="/"
            aria-label="Back to dashboard"
            className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-ink-soft hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
          >
            <ArrowLeftIcon className="h-5 w-5" aria-hidden="true" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight text-ink">System control</h1>
            <p className="text-sm text-ink-muted">Status, passwords and logs for the whole application.</p>
          </div>
          <Button variant="secondary" icon={loading ? <Loader2Icon className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCwIcon className="h-4 w-4" aria-hidden="true" />} onClick={() => void load()} disabled={loading}>
            Refresh
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 pb-24 pt-4">
        {loadError && <Alert tone="danger" title={loadError} />}

        <SectionCard title="Status">
          {!status ? (
            <p className="flex items-center gap-2 text-sm text-ink-muted">
              <Loader2Icon className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading…
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Stat label="Database" value={status.database === 'ok' ? 'Working' : 'Not responding'} sub={status.databaseDetail || undefined} bad={status.database !== 'ok'} />
              <Stat label="Accounts" value={`${status.activeAccounts} active`} sub={`${status.accounts} in total`} />
              <Stat label="Participants" value={String(status.participants)} />
              <Stat
                label="Last backup"
                value={status.lastBackup ? formatTimestamp(status.lastBackup.at) : 'None'}
                sub={status.lastBackup ? `${Math.ceil(status.lastBackup.bytes / 1024)} KB · ${status.lastBackup.count} kept` : status.backupDetail}
                bad={!status.lastBackup || Date.now() - new Date(status.lastBackup.at).getTime() > 3 * 3600 * 1000}
              />
              <Stat label="Audit trail" value={`${status.auditEntries} entries`} />
              <Stat label="Server time" value={formatTimestamp(status.serverTime)} />
            </div>
          )}
        </SectionCard>

        <SectionCard title="Set a password for an account" subtitle="For when someone cannot use Reset password, or an account needs a known password.">
          <div className="space-y-4">
            {done && (
              <Alert tone="ok" title={`Password set for ${done.name}`}>
                {done.mustChange
                  ? `Give it to them privately. They must choose their own at their next sign-in. Shown only now: `
                  : `They can sign in with it from now on. Shown only now: `}
                <span className="select-all break-all font-mono font-semibold">{done.password}</span>
              </Alert>
            )}
            {error && <Alert tone="danger" title={error} />}
            <div>
              <label htmlFor="sys-account" className="block text-sm font-semibold text-ink">
                Account
              </label>
              <select id="sys-account" value={userId} onChange={(e) => setUserId(e.target.value)} className={fieldCls} aria-invalid={touched && !!problems.account}>
                <option value="">Choose an account…</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id} disabled={a.isSelf || a.status === 'deactivated'}>
                    {a.name} · {a.email} · {a.roleLabel}
                    {a.isSelf ? ' (you: use your account menu)' : a.status === 'deactivated' ? ' (deactivated)' : ''}
                  </option>
                ))}
              </select>
              {touched && problems.account && <p className="mt-1.5 text-sm text-danger-700">{problems.account}</p>}
            </div>
            <InputField
              id="sys-password"
              label="New password"
              value={password}
              onChange={setPassword}
              required
              autoComplete="new-password"
              hint="At least 10 characters, with letters and numbers"
              error={touched ? problems.password : undefined}
              action={
                <Button variant="secondary" icon={<ShuffleIcon className="h-4 w-4" aria-hidden="true" />} onClick={() => setPassword(generateTemporaryPassword())}>
                  New random
                </Button>
              }
            />
            <CheckToggle
              label="They must choose their own password at the next sign-in"
              description="Recommended. Untick only if this account should keep this exact password."
              checked={mustChange}
              onChange={setMustChange}
            />
            <TextAreaField
              id="sys-reason"
              label="Reason"
              value={reason}
              onChange={setReason}
              required
              rows={2}
              placeholder="e.g. Forgot the password and has no email access today"
              error={touched ? problems.reason : undefined}
            />
            <p className="text-sm text-ink-muted">They are signed out everywhere, any unused setup link stops working, and the change and your reason are kept in the audit trail.</p>
            <Button className="w-full" icon={<KeyRoundIcon className="h-4 w-4" aria-hidden="true" />} onClick={() => void submit()} disabled={busy}>
              {busy ? 'Setting…' : 'Set password'}
            </Button>
          </div>
        </SectionCard>

        <SectionCard title="Logs" subtitle="Newest first, the last 100 of each kind. Failed sign-ins and errors are kept for a year.">
          <div role="tablist" aria-label="Log" className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-3">
            {TABS.map((t) => {
              const active = tab === t.key;
              const n = logs?.[t.key].length ?? 0;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(t.key)}
                  className={`flex min-h-[40px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 ${
                    active ? 'border-ink bg-ink text-white' : 'border-line-strong bg-white text-ink-soft hover:bg-canvas'
                  }`}
                >
                  {t.label}
                  <span className={`tabular-nums ${active ? 'text-white/75' : 'text-ink-muted'}`}>{n}</span>
                </button>
              );
            })}
          </div>
          {!logs ? null : entries.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">Nothing recorded yet.</p>
          ) : (
            <ol role="tabpanel" className="divide-y divide-line">
              {entries.map((e, i) => (
                <li key={`${e.at}-${i}`} className="py-2.5 text-sm">
                  <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-medium text-ink">{e.event}</span>
                    <span className="text-xs tabular-nums text-ink-muted">{formatTimestamp(e.at)}</span>
                  </p>
                  {e.account && <p className="break-words text-ink-soft">{e.account}</p>}
                  {e.by && <p className="text-xs text-ink-muted">by {e.by}</p>}
                  {e.detail && <p className="break-words text-xs text-ink-muted">{e.detail}</p>}
                </li>
              ))}
            </ol>
          )}
        </SectionCard>
      </main>
    </div>
  );
}
