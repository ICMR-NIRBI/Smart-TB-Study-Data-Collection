import React, { useState } from 'react';
import { DatabaseBackupIcon, EyeIcon, Loader2Icon, MegaphoneIcon, RotateCwIcon, WrenchIcon } from 'lucide-react';
import { setDemoMode } from '../../hooks/usePreviewMode';
import { SectionCard } from '../../components/ui/SectionCard';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { InputField } from '../../components/ui/InputField';
import { TextAreaField } from '../../components/ui/TextAreaField';
import { api } from '../../utils/api';
import { formatTimestamp } from '../../utils/dates';
import { MIN_ADMIN_REASON_LENGTH } from '../../utils/accountRules';

export interface ActionState {
  action: 'backup' | 'restart';
  label: string;
  pendingSince: string | null;
  last: { ok: boolean; message: string; startedAt: string; finishedAt: string } | null;
}
export interface ServerActionsStatus {
  available: boolean;
  actions: ActionState[];
}
export interface SiteSettings {
  maintenance: { on: boolean; message: string; since: string | null; by: string };
  announcement: { text: string; tone: 'info' | 'warn'; until: string | null; by: string } | null;
  demo: { on: boolean; since: string | null; by: string };
}

const fieldCls =
  'mt-2 h-12 w-full rounded-lg border border-line-strong bg-white px-3.5 text-base text-ink outline-none focus:border-brand-600 focus:ring-[3px] focus:ring-brand-600/20';

const ACTION_HELP: Record<ActionState['action'], string> = {
  backup: 'Runs the hourly backup straight away, for example just before a risky change. Takes a few seconds.',
  restart: 'Restarts the app if it misbehaves. Everyone is cut off for about half a minute; unsaved typing may be lost.',
};

/** One server action: its last result, and a button that asks for a reason first. */
function ActionRow({ state, available, onDone }: { state: ActionState; available: boolean; onDone: (s: ServerActionsStatus) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const Icon = state.action === 'backup' ? DatabaseBackupIcon : RotateCwIcon;
  const run = async () => {
    if (reason.trim().length < MIN_ADMIN_REASON_LENGTH || busy) return;
    setBusy(true);
    setError(null);
    try {
      onDone(await api<ServerActionsStatus>('/api/system/actions', { method: 'POST', body: { action: state.action, reason } }));
      setOpen(false);
      setReason('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the request');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-xl border border-line p-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">{state.label}</p>
          <p className="text-sm text-ink-muted">{ACTION_HELP[state.action]}</p>
          {state.pendingSince ? (
            <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-warn-700">
              <Loader2Icon className="h-4 w-4 animate-spin" aria-hidden="true" /> Requested {formatTimestamp(state.pendingSince)}; the server is working on it. Press Refresh in a moment.
            </p>
          ) : state.last ? (
            <p className={`mt-1 text-sm ${state.last.ok ? 'text-ok-700' : 'text-danger-700'}`}>
              Last run {formatTimestamp(state.last.finishedAt || state.last.startedAt)}: {state.last.message}
            </p>
          ) : null}
        </div>
        {!open && (
          <Button variant="secondary" icon={<Icon className="h-4 w-4" aria-hidden="true" />} onClick={() => setOpen(true)} disabled={!available || !!state.pendingSince}>
            {state.action === 'backup' ? 'Back up now' : 'Restart'}
          </Button>
        )}
      </div>
      {open && (
        <div className="mt-3 space-y-3">
          {error && <Alert tone="danger" title={error} />}
          <TextAreaField id={`act-${state.action}-reason`} label="Reason" value={reason} onChange={setReason} required rows={2} placeholder="e.g. Before updating the server" />
          <div className="flex flex-wrap gap-2">
            <Button icon={<Icon className="h-4 w-4" aria-hidden="true" />} onClick={() => void run()} disabled={busy || reason.trim().length < MIN_ADMIN_REASON_LENGTH}>
              {busy ? 'Sending…' : state.action === 'backup' ? 'Back up now' : 'Restart the app'}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Server actions, maintenance mode, demo mode and the announcement banner. */
export function ServerPanel({
  actions,
  site,
  onActions,
  onSite,
}: {
  actions: ServerActionsStatus | null;
  site: SiteSettings | null;
  onActions: (s: ServerActionsStatus) => void;
  onSite: (s: SiteSettings) => void;
}) {
  const [mMessage, setMMessage] = useState('');
  const [mReason, setMReason] = useState('');
  const [mBusy, setMBusy] = useState(false);
  const [mError, setMError] = useState<string | null>(null);
  const [aText, setAText] = useState('');
  const [aTone, setATone] = useState<'info' | 'warn'>('info');
  const [aHours, setAHours] = useState('24');
  const [aBusy, setABusy] = useState(false);
  const [aError, setAError] = useState<string | null>(null);
  const [dBusy, setDBusy] = useState(false);
  const [dError, setDError] = useState<string | null>(null);

  const demo = async (on: boolean) => {
    setDBusy(true);
    setDError(null);
    try {
      const next = await api<SiteSettings>('/api/system/site', { method: 'POST', body: { kind: 'demo', on } });
      onSite(next);
      setDemoMode(next.demo.on);
    } catch (err) {
      setDError(err instanceof Error ? err.message : 'Could not change demo mode');
    } finally {
      setDBusy(false);
    }
  };

  const maintenance = async (on: boolean) => {
    if (mReason.trim().length < MIN_ADMIN_REASON_LENGTH || mBusy) {
      setMError(`Give a reason (at least ${MIN_ADMIN_REASON_LENGTH} characters)`);
      return;
    }
    setMBusy(true);
    setMError(null);
    try {
      onSite(await api<SiteSettings>('/api/system/site', { method: 'POST', body: { kind: 'maintenance', on, message: mMessage, reason: mReason } }));
      setMReason('');
      if (!on) setMMessage('');
    } catch (err) {
      setMError(err instanceof Error ? err.message : 'Could not change maintenance mode');
    } finally {
      setMBusy(false);
    }
  };
  const announce = async (text: string) => {
    setABusy(true);
    setAError(null);
    try {
      onSite(await api<SiteSettings>('/api/system/site', { method: 'POST', body: { kind: 'announcement', text, tone: aTone, hours: Number(aHours) } }));
      setAText('');
    } catch (err) {
      setAError(err instanceof Error ? err.message : 'Could not change the announcement');
    } finally {
      setABusy(false);
    }
  };

  return (
    <SectionCard title="Server" subtitle="Backups, restarts, maintenance mode, demo mode and announcements. Every action is recorded in the audit trail.">
      <div className="space-y-4">
        {actions && !actions.available && (
          <Alert tone="info" title="Backup now and Restart are installed with the next deployment">
            They need a small helper on the server, which the deploy script installs.
          </Alert>
        )}
        {actions?.actions.map((a) => <ActionRow key={a.action} state={a} available={actions.available} onDone={onActions} />)}

        <div className={`rounded-xl border p-3 ${site?.maintenance.on ? 'border-warn-200 bg-warn-50' : 'border-line'}`}>
          <p className="flex items-center gap-2 font-semibold text-ink">
            <WrenchIcon className="h-4 w-4 text-ink-muted" aria-hidden="true" /> Maintenance mode{' '}
            <span className={`rounded-full px-2 py-0.5 text-xs ${site?.maintenance.on ? 'bg-warn-600 text-white' : 'bg-canvas text-ink-muted'}`}>{site?.maintenance.on ? 'On' : 'Off'}</span>
          </p>
          <p className="text-sm text-ink-muted">
            While on, nobody but you can save anything; everyone can still open and read records, and sees a notice at the top of the page.
          </p>
          {site?.maintenance.on && (
            <p className="mt-1 text-sm text-warn-700">
              On since {site.maintenance.since ? formatTimestamp(site.maintenance.since) : '—'} ({site.maintenance.by}): “{site.maintenance.message}”
            </p>
          )}
          <div className="mt-3 space-y-3">
            {mError && <Alert tone="danger" title={mError} />}
            {!site?.maintenance.on && (
              <InputField id="m-message" label="Message for staff" value={mMessage} onChange={setMMessage} placeholder="e.g. Back by 18:00. Write on paper until then." />
            )}
            <TextAreaField id="m-reason" label="Reason" value={mReason} onChange={setMReason} required rows={2} placeholder="e.g. Restoring a backup" />
            <Button
              variant={site?.maintenance.on ? 'primary' : 'secondary'}
              icon={mBusy ? <Loader2Icon className="h-4 w-4 animate-spin" aria-hidden="true" /> : <WrenchIcon className="h-4 w-4" aria-hidden="true" />}
              onClick={() => void maintenance(!site?.maintenance.on)}
              disabled={mBusy || !site}
            >
              {site?.maintenance.on ? 'Turn maintenance off' : 'Turn maintenance on'}
            </Button>
          </div>
        </div>

        <div className={`rounded-xl border p-3 ${site?.demo.on ? 'border-brand-200 bg-brand-50' : 'border-line'}`}>
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 font-semibold text-ink">
                <EyeIcon className="h-4 w-4 text-ink-muted" aria-hidden="true" /> Demo mode: open all modules{' '}
                <span className={`rounded-full px-2 py-0.5 text-xs ${site?.demo.on ? 'bg-brand-600 text-white' : 'bg-canvas text-ink-muted'}`}>{site?.demo.on ? 'On' : 'Off'}</span>
              </p>
              <p className="text-sm text-ink-muted">
                For a demonstration: every account sees all 10 modules unlocked, with Previous / Next through them. Saving and locking still follow each role and the module order, so real records are safe.
              </p>
              {site?.demo.on && site.demo.since && (
                <p className="mt-1 text-sm text-brand-800">
                  On since {formatTimestamp(site.demo.since)} ({site.demo.by}). Turn it off after the demo.
                </p>
              )}
            </div>
            <Button
              variant={site?.demo.on ? 'primary' : 'secondary'}
              icon={dBusy ? <Loader2Icon className="h-4 w-4 animate-spin" aria-hidden="true" /> : <EyeIcon className="h-4 w-4" aria-hidden="true" />}
              onClick={() => void demo(!site?.demo.on)}
              disabled={dBusy || !site}
            >
              {site?.demo.on ? 'Turn demo mode off' : 'Open all modules'}
            </Button>
          </div>
          {dError && <div className="mt-3"><Alert tone="danger" title={dError} /></div>}
        </div>

        <div className="rounded-xl border border-line p-3">
          <p className="flex items-center gap-2 font-semibold text-ink">
            <MegaphoneIcon className="h-4 w-4 text-ink-muted" aria-hidden="true" /> Announcement
          </p>
          <p className="text-sm text-ink-muted">A banner at the top of every page for everyone signed in.</p>
          {site?.announcement && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1 text-sm text-ink">
                Showing: “{site.announcement.text}”{site.announcement.until ? ` until ${formatTimestamp(site.announcement.until)}` : ''}
              </p>
              <Button variant="secondary" onClick={() => void announce('')} disabled={aBusy}>
                Remove
              </Button>
            </div>
          )}
          <div className="mt-3 space-y-3">
            {aError && <Alert tone="danger" title={aError} />}
            <InputField id="a-text" label={site?.announcement ? 'Replace with' : 'Text'} value={aText} onChange={setAText} placeholder="e.g. Server maintenance today 18:00–18:30" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="a-tone" className="block text-sm font-semibold text-ink">
                  Style
                </label>
                <select id="a-tone" value={aTone} onChange={(e) => setATone(e.target.value as 'info' | 'warn')} className={fieldCls}>
                  <option value="info">Information (teal)</option>
                  <option value="warn">Warning (amber)</option>
                </select>
              </div>
              <div>
                <label htmlFor="a-hours" className="block text-sm font-semibold text-ink">
                  Show for
                </label>
                <select id="a-hours" value={aHours} onChange={(e) => setAHours(e.target.value)} className={fieldCls}>
                  <option value="2">2 hours</option>
                  <option value="8">8 hours</option>
                  <option value="24">1 day</option>
                  <option value="72">3 days</option>
                  <option value="168">1 week</option>
                  <option value="0">Until I remove it</option>
                </select>
              </div>
            </div>
            <Button icon={<MegaphoneIcon className="h-4 w-4" aria-hidden="true" />} onClick={() => void announce(aText)} disabled={aBusy || aText.trim().length < 3}>
              {aBusy ? 'Saving…' : 'Show announcement'}
            </Button>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
