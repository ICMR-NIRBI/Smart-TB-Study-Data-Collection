import React from 'react';
import { CheckCircle2Icon, CircleAlertIcon, CircleHelpIcon, TriangleAlertIcon } from 'lucide-react';
import { SectionCard } from '../../components/ui/SectionCard';
import { formatTimestamp } from '../../utils/dates';

export type HealthState = 'ok' | 'warn' | 'bad' | 'unknown';
export interface HealthCheck {
  key: string;
  label: string;
  state: HealthState;
  value: string;
  detail: string;
}
export interface Health {
  checks: HealthCheck[];
  counts: { accounts: number; activeAccounts: number; participants: number; photos: number; auditEntries: number };
  app: { version: string; startedAt: string; serverTime: string; node: string };
}

const STYLE: Record<HealthState, { box: string; value: string; icon: React.ElementType; iconCls: string; word: string }> = {
  ok: { box: 'border-line bg-white', value: 'text-ink', icon: CheckCircle2Icon, iconCls: 'text-ok-600', word: 'OK' },
  warn: { box: 'border-warn-200 bg-warn-50', value: 'text-warn-700', icon: TriangleAlertIcon, iconCls: 'text-warn-600', word: 'Needs attention' },
  bad: { box: 'border-danger-200 bg-danger-50', value: 'text-danger-700', icon: CircleAlertIcon, iconCls: 'text-danger-600', word: 'Problem' },
  unknown: { box: 'border-line bg-canvas', value: 'text-ink-soft', icon: CircleHelpIcon, iconCls: 'text-ink-muted', word: 'Unknown' },
};

function Tile({ c }: { c: HealthCheck }) {
  const s = STYLE[c.state];
  const Icon = s.icon;
  return (
    <div className={`rounded-xl border p-3 ${s.box}`}>
      <p className="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
        <Icon className={`h-4 w-4 shrink-0 ${s.iconCls}`} aria-label={s.word} />
        {c.label}
      </p>
      <p className={`mt-1 text-base font-semibold ${s.value}`}>{c.value}</p>
      {c.detail && <p className="mt-0.5 text-xs text-ink-muted">{c.detail}</p>}
    </div>
  );
}

/** The health tiles, with a one-line summary of anything that needs attention. */
export function HealthPanel({ health }: { health: Health | null }) {
  if (!health) {
    return (
      <SectionCard title="Health">
        <p className="text-sm text-ink-muted">Loading…</p>
      </SectionCard>
    );
  }
  const problems = health.checks.filter((c) => c.state === 'bad');
  const warnings = health.checks.filter((c) => c.state === 'warn');
  const summary = problems.length
    ? { cls: 'border-danger-200 bg-danger-50 text-danger-700', text: `${problems.length} problem${problems.length > 1 ? 's' : ''}: ${problems.map((c) => c.label).join(', ')}` }
    : warnings.length
      ? { cls: 'border-warn-200 bg-warn-50 text-warn-700', text: `Needs attention: ${warnings.map((c) => c.label).join(', ')}` }
      : { cls: 'border-ok-200 bg-ok-50 text-ok-700', text: 'Everything looks fine' };
  const n = health.counts;
  return (
    <SectionCard title="Health" subtitle="Checked each time this page loads or you press Refresh.">
      <div className="space-y-3">
        <p role="status" className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${summary.cls}`}>
          {summary.text}
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {health.checks.map((c) => (
            <Tile key={c.key} c={c} />
          ))}
        </div>
        <p className="text-xs text-ink-muted">
          {n.participants} participants · {n.photos} photos · {n.activeAccounts} of {n.accounts} accounts active · {n.auditEntries} audit entries
        </p>
        <p className="text-xs text-ink-muted">
          App version {health.app.version} · running since {formatTimestamp(health.app.startedAt)} · server time {formatTimestamp(health.app.serverTime)}
        </p>
      </div>
    </SectionCard>
  );
}
