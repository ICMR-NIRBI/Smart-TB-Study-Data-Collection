import React from 'react';
import { AlertOctagonIcon, AlertTriangleIcon, CheckCircle2Icon, InfoIcon, LockIcon } from 'lucide-react';

type AlertTone = 'danger' | 'warn' | 'ok' | 'info' | 'neutral';

interface AlertProps {
  tone: AlertTone;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

const TONES: Record<AlertTone, { box: string; icon: React.ElementType; iconCls: string; title: string }> = {
  danger: { box: 'border-danger-200 bg-danger-50', icon: AlertOctagonIcon, iconCls: 'text-danger-600', title: 'text-danger-700' },
  warn: { box: 'border-warn-200 bg-warn-50', icon: AlertTriangleIcon, iconCls: 'text-warn-600', title: 'text-warn-700' },
  ok: { box: 'border-ok-200 bg-ok-50', icon: CheckCircle2Icon, iconCls: 'text-ok-600', title: 'text-ok-700' },
  info: { box: 'border-brand-200 bg-brand-50', icon: InfoIcon, iconCls: 'text-brand-600', title: 'text-brand-800' },
  neutral: { box: 'border-lock-300 bg-lock-100', icon: LockIcon, iconCls: 'text-lock-600', title: 'text-ink' },
};

export function Alert({ tone, title, children, action, className = '' }: AlertProps) {
  const t = TONES[tone];
  const Icon = t.icon;
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={`flex gap-3 rounded-2xl border p-4 ${t.box} ${className}`}>
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${t.iconCls}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className={`font-semibold ${t.title}`}>{title}</p>
        {children && <div className="mt-1 text-sm text-ink-soft">{children}</div>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}
