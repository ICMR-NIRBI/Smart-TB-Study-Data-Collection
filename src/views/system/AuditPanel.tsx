import React, { useState } from 'react';
import { DownloadIcon, SearchIcon } from 'lucide-react';
import { SectionCard } from '../../components/ui/SectionCard';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { InputField } from '../../components/ui/InputField';
import { api } from '../../utils/api';
import { formatTimestamp } from '../../utils/dates';

interface AuditRow {
  at: string;
  who: string;
  what: string;
  record: string;
  changes: string;
  reason: string;
}

const fieldCls =
  'mt-2 h-12 w-full rounded-lg border border-line-strong bg-white px-3.5 text-base text-ink outline-none focus:border-brand-600 focus:ring-[3px] focus:ring-brand-600/20';

/** Search the audit trail by participant, staff account and dates; download the result as a CSV file. */
export function AuditPanel({ accounts }: { accounts: { email: string; name: string }[] }) {
  const [participant, setParticipant] = useState('');
  const [account, setAccount] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = () => {
    const p = new URLSearchParams();
    if (participant.trim()) p.set('participant', participant.trim());
    if (account) p.set('account', account);
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    return p;
  };
  const search = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ rows: AuditRow[]; truncated: boolean }>(`/api/system/audit?${query().toString()}`);
      setRows(res.rows);
      setTruncated(res.truncated);
    } catch (err) {
      setRows(null);
      setError(err instanceof Error ? err.message : 'Could not search');
    } finally {
      setBusy(false);
    }
  };
  const csvHref = () => {
    const p = query();
    p.set('format', 'csv');
    return `/api/system/audit?${p.toString()}`;
  };

  return (
    <SectionCard title="Audit trail" subtitle="Who changed what, when and why. Leave everything empty for the most recent entries.">
      <div className="space-y-4">
        <InputField id="audit-participant" label="Participant ID" value={participant} onChange={setParticipant} placeholder="e.g. SMART-TB-001-004" />
        <div>
          <label htmlFor="audit-account" className="block text-sm font-semibold text-ink">
            Staff account
          </label>
          <select id="audit-account" value={account} onChange={(e) => setAccount(e.target.value)} className={fieldCls}>
            <option value="">Anyone</option>
            {accounts.map((a) => (
              <option key={a.email} value={a.email}>
                {a.name} · {a.email}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <InputField id="audit-from" label="From" kind="date" value={from} onChange={setFrom} />
          <InputField id="audit-to" label="To" kind="date" value={to} onChange={setTo} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button icon={<SearchIcon className="h-4 w-4" aria-hidden="true" />} onClick={() => void search()} disabled={busy}>
            {busy ? 'Searching…' : 'Search'}
          </Button>
          <a
            href={csvHref()}
            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-line-strong bg-white px-4 text-[15px] font-semibold text-ink hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
          >
            <DownloadIcon className="h-4 w-4" aria-hidden="true" /> Download CSV
          </a>
        </div>
        {error && <Alert tone="danger" title={error} />}
        {rows && (
          <>
            <p className="text-sm text-ink-muted">
              {rows.length} entr{rows.length === 1 ? 'y' : 'ies'}
              {truncated ? ' (the newest 500; download the CSV for up to 5,000, or narrow the search)' : ''}
            </p>
            {rows.length > 0 && (
              <ol className="divide-y divide-line">
                {rows.map((r, i) => (
                  <li key={`${r.at}-${i}`} className="py-2.5 text-sm">
                    <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="font-medium text-ink">
                        {r.what} · {r.record}
                      </span>
                      <span className="text-xs tabular-nums text-ink-muted">{formatTimestamp(r.at)}</span>
                    </p>
                    <p className="text-ink-soft">{r.who}</p>
                    {r.changes && <p className="break-words text-xs text-ink-muted">{r.changes}</p>}
                    {r.reason && <p className="break-words text-xs text-ink-muted">Reason: {r.reason}</p>}
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </div>
    </SectionCard>
  );
}
