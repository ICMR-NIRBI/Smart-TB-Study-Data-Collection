import React, { useEffect, useMemo, useState } from 'react';
import { HistoryIcon, KeyRoundIcon, Loader2Icon, SendIcon, ShuffleIcon, Trash2Icon, UserCheckIcon, UserXIcon } from 'lucide-react';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { InputField } from '../ui/InputField';
import { ChoiceField } from '../ui/ChoiceField';
import { CheckToggle } from '../ui/CheckToggle';
import { TextAreaField } from '../ui/TextAreaField';
import { Alert } from '../ui/Alert';
import { MODULES } from '../../data/modules';
import { roleModules, type RoleKey } from '../../data/roles';
import type { RoleInfo } from '../../types/roles';
import { api } from '../../utils/api';
import { MIN_ADMIN_REASON_LENGTH as MIN_REASON, generateTemporaryPassword, passwordProblem } from '../../utils/accountRules';
import { formatDMY, formatTimestamp, todayISO } from '../../utils/dates';
import type { ModuleId } from '../../types/crf';
import type { SetupLink, StaffHistoryEntry, StaffMember } from '../../types/staff';

const roleOptions = (roles: RoleInfo[]) => roles.map((r) => ({ value: r.key, label: r.label, description: r.description }));

type PendingKind = 'details' | 'delegations' | 'deactivate' | 'reactivate' | 'reset' | 'temporary' | 'delete';

const PENDING: Record<PendingKind, { title: string; confirm: string; danger?: boolean; note: string }> = {
  details: { title: 'Save account changes', confirm: 'Save changes', note: 'The change and your reason are kept in the audit trail.' },
  delegations: { title: 'Save extra modules', confirm: 'Save extra modules', note: 'This is the study delegation log; your reason is recorded with it.' },
  deactivate: {
    title: 'Deactivate account',
    confirm: 'Deactivate',
    danger: true,
    note: 'They are signed out immediately and cannot sign in. Their name stays on everything they entered.',
  },
  delete: {
    title: 'Delete account',
    confirm: 'Delete account',
    danger: true,
    note: 'The account is erased and cannot be brought back. This only works for an account that has not entered data or made changes; otherwise deactivate it. The deletion and your reason stay in the audit trail.',
  },
  reactivate: { title: 'Reactivate account', confirm: 'Reactivate', note: 'They can sign in again with their existing password.' },
  temporary: {
    title: 'Set temporary password',
    confirm: 'Set temporary password',
    danger: true,
    note: 'Their current password stops working and they are signed out. They sign in with the temporary password and must choose their own before they can do anything else. You will see it once, to give them privately.',
  },
  reset: {
    title: 'Reset password',
    confirm: 'Reset and create link',
    danger: true,
    note: 'Their current password stops working and they are signed out. You will get a new one-time setup link to send them.',
  },
};

interface StaffSheetProps {
  member: StaffMember | null;
  roles: RoleInfo[];
  isSelf: boolean;
  /** The PI and the data manager may delete accounts (not their own; only the PI may delete the PI). */
  canDelete: boolean;
  onClose: () => void;
  onUpdated: (member: StaffMember) => void;
  onDeleted: (member: StaffMember) => void;
  onLink: (member: StaffMember, link: SetupLink) => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-t border-line pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {children}
    </section>
  );
}

export function StaffSheet({ member, roles, isSelf, canDelete, onClose, onUpdated, onDeleted, onLink }: StaffSheetProps) {
  const [name, setName] = useState('');
  const [role, setRole] = useState<RoleKey>('research_officer');
  const [isAdmin, setIsAdmin] = useState(false);
  const [dels, setDels] = useState<Partial<Record<ModuleId, string>>>({});
  const [pending, setPending] = useState<PendingKind | null>(null);
  const [reason, setReason] = useState('');
  const [reasonTouched, setReasonTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState('');
  const [issued, setIssued] = useState<string | null>(null);
  const [history, setHistory] = useState<StaffHistoryEntry[] | null>(null);
  const memberId = member?.id;

  // Reset the form whenever a different person is opened.
  useEffect(() => {
    if (!member) return;
    setName(member.name);
    setRole(member.role);
    setIsAdmin(member.isAdmin);
    setDels(Object.fromEntries(member.delegations.map((d) => [d.moduleId, d.expiresAt])));
    setPending(null);
    setError(null);
    setIssued(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId]);

  useEffect(() => {
    if (!memberId) return;
    setHistory(null);
    api<{ history: StaffHistoryEntry[] }>(`/api/admin/staff/${memberId}/history`)
      .then((r) => setHistory(r.history))
      .catch(() => setHistory([]));
  }, [memberId, member]);

  const detailsDirty = !!member && (name.trim() !== member.name || role !== member.role || isAdmin !== member.isAdmin);
  const delegationsDirty = useMemo(() => {
    if (!member) return false;
    const before = Object.fromEntries(member.delegations.map((d) => [d.moduleId, d.expiresAt]));
    return JSON.stringify(Object.entries(before).sort()) !== JSON.stringify(Object.entries(dels).sort());
  }, [member, dels]);

  if (!member) return <Sheet open={false} onClose={onClose} title="" />;

  const deactivated = member.status === 'deactivated';
  const included = roles.find((r) => r.key === role)?.modules ?? roleModules(role);

  const ask = (kind: PendingKind) => {
    setPending(kind);
    setReason('');
    setReasonTouched(false);
    setTempPassword(kind === 'temporary' ? generateTemporaryPassword() : '');
    setError(null);
  };

  const confirm = async () => {
    setReasonTouched(true);
    if (!pending || reason.trim().length < MIN_REASON || busy) return;
    if (pending === 'temporary' && passwordProblem(tempPassword, member.email)) return;
    setBusy(true);
    setError(null);
    const base = `/api/admin/staff/${member.id}`;
    try {
      if (pending === 'delete') {
        await api(base, { method: 'DELETE', body: { reason } });
        setPending(null);
        onDeleted(member);
        return;
      } else if (pending === 'details') {
        const res = await api<{ member: StaffMember }>(base, { method: 'PATCH', body: { name: name.trim(), role, isAdmin, reason } });
        onUpdated(res.member);
      } else if (pending === 'temporary') {
        const res = await api<{ member: StaffMember }>(base, { method: 'POST', body: { action: 'temporary', reason, password: tempPassword } });
        onUpdated(res.member);
        setIssued(tempPassword);
        setTempPassword('');
      } else if (pending === 'reset') {
        const res = await api<{ member: StaffMember; link: SetupLink }>(base, { method: 'POST', body: { action: 'reset', reason } });
        onUpdated(res.member);
        onLink(res.member, res.link);
      } else {
        const body =
          pending === 'delegations'
            ? { action: 'delegations', reason, delegations: Object.entries(dels).map(([moduleId, expiresAt]) => ({ moduleId: Number(moduleId), expiresAt })) }
            : { action: pending, reason };
        const res = await api<{ member: StaffMember }>(base, { method: 'POST', body });
        onUpdated(res.member);
      }
      setPending(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ member: StaffMember; link: SetupLink }>(`/api/admin/staff/${member.id}`, { method: 'POST', body: { action: 'resend' } });
      onLink(res.member, res.link);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create link');
    } finally {
      setBusy(false);
    }
  };

  const toggleModule = (id: ModuleId, on: boolean) =>
    setDels((d) => {
      const next = { ...d };
      if (on) next[id] = '';
      else delete next[id];
      return next;
    });

  if (issued) {
    return (
      <Sheet
        open
        onClose={() => setIssued(null)}
        title="Temporary password set"
        description={`${member.name} · ${member.email}`}
        footer={
          <Button className="flex-1" onClick={() => setIssued(null)}>
            Done
          </Button>
        }
      >
        <div className="space-y-4">
          <Alert tone="ok" title="Give this to them privately">
            It is shown only now. They must choose their own password at their first sign-in.
          </Alert>
          <p className="select-all break-all rounded-lg border border-line-strong bg-canvas px-3 py-3 font-mono text-lg text-ink">{issued}</p>
        </div>
      </Sheet>
    );
  }

  if (pending) {
    const p = PENDING[pending];
    const short = reason.trim().length < MIN_REASON;
    return (
      <Sheet
        open
        onClose={() => setPending(null)}
        title={p.title}
        description={`${member.name} · ${member.email}`}
        footer={
          <>
            <Button variant="secondary" className="flex-1" onClick={() => setPending(null)} disabled={busy}>
              Back
            </Button>
            <Button variant={p.danger ? 'danger' : 'primary'} className="flex-[1.6]" onClick={() => void confirm()} disabled={busy}>
              {busy ? 'Saving…' : p.confirm}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error && <Alert tone="danger" title={error} />}
          <p className="text-sm text-ink-soft">{p.note}</p>
          {pending === 'temporary' && (
            <InputField
              id="temp-password"
              label="Temporary password"
              value={tempPassword}
              onChange={setTempPassword}
              required
              error={reasonTouched ? (passwordProblem(tempPassword, member.email) ?? undefined) : undefined}
              hint="At least 10 characters, with letters and numbers"
              action={
                <Button variant="secondary" icon={<ShuffleIcon className="h-4 w-4" aria-hidden="true" />} onClick={() => setTempPassword(generateTemporaryPassword())}>
                  New random
                </Button>
              }
            />
          )}
          <TextAreaField
            id="admin-reason"
            label="Reason"
            value={reason}
            onChange={setReason}
            required
            rows={3}
            placeholder="e.g. Joined the study team as phlebotomist from 14/10/2026"
            error={reasonTouched && short ? `Enter at least ${MIN_REASON} characters` : undefined}
          />
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={member.name}
      description={`${member.email} · ${member.status === 'invited' ? 'Invited, password not set yet' : deactivated ? 'Deactivated' : member.mustChangePassword ? 'Active, temporary password not changed yet' : 'Active'}${
        member.lastSignInAt ? ` · last signed in ${formatTimestamp(member.lastSignInAt)}` : ''
      }`}
      footer={
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-5">
        {error && <Alert tone="danger" title={error} />}
        {isSelf && <Alert tone="info" title="This is your own account">The other administrator changes your role, admin rights or password.</Alert>}

        <Section title="Account">
          <InputField id="edit-name" label="Full name" value={name} onChange={setName} readOnly={deactivated} />
          <ChoiceField id="edit-role" label="Role" options={roleOptions(roles)} value={role} onChange={setRole} layout="stack" readOnly={isSelf} />
          <CheckToggle
            label="Study administrator"
            description="Manages staff accounts and sees participant contact details"
            checked={isAdmin}
            onChange={setIsAdmin}
            readOnly={isSelf || deactivated}
          />
          <Button className="w-full" onClick={() => ask('details')} disabled={!detailsDirty || name.trim().length < 2}>
            Save account changes
          </Button>
        </Section>

        <Section title="Extra modules (delegation log)">
          <p className="text-sm text-ink-muted">
            Lets this person enter and sign off modules beyond their role, for example a co-investigator signing eligibility. Leave the end date empty for no
            end date.
          </p>
          <ul className="space-y-2">
            {MODULES.map((m) => {
              const inRole = included.includes(m.id);
              const on = m.id in dels;
              return (
                <li key={m.id} className="space-y-2">
                  <CheckToggle
                    label={`Module ${m.id} · ${m.short}`}
                    description={inRole ? 'Already part of this role' : undefined}
                    checked={on}
                    onChange={(v) => toggleModule(m.id, v)}
                    readOnly={deactivated || (inRole && !on)}
                  />
                  {on && (
                    <InputField
                      id={`del-end-${m.id}`}
                      label={`Module ${m.id} delegation ends`}
                      kind="date"
                      value={dels[m.id] ?? ''}
                      onChange={(v) => setDels((d) => ({ ...d, [m.id]: v }))}
                      hint={
                        !dels[m.id]
                          ? 'No end date'
                          : (dels[m.id] ?? '') < todayISO()
                            ? `Ended ${formatDMY(dels[m.id] ?? '')} — no longer applies`
                            : `Last day: ${formatDMY(dels[m.id] ?? '')}`
                      }
                    />
                  )}
                </li>
              );
            })}
          </ul>
          <Button className="w-full" onClick={() => ask('delegations')} disabled={!delegationsDirty}>
            Save extra modules
          </Button>
        </Section>

        {!isSelf && (
          <Section title="Sign-in">
            <div className="grid gap-2 sm:grid-cols-2">
              {member.status === 'invited' && (
                <Button variant="secondary" icon={<SendIcon className="h-4 w-4" aria-hidden="true" />} onClick={() => void resend()} disabled={busy}>
                  New setup link
                </Button>
              )}
              {!deactivated && (
                <Button variant="secondary" icon={<KeyRoundIcon className="h-4 w-4" aria-hidden="true" />} onClick={() => ask('temporary')}>
                  Set temporary password
                </Button>
              )}
              {member.status === 'active' && (
                <Button variant="secondary" icon={<KeyRoundIcon className="h-4 w-4" aria-hidden="true" />} onClick={() => ask('reset')}>
                  Reset password
                </Button>
              )}
              {deactivated ? (
                <Button variant="secondary" icon={<UserCheckIcon className="h-4 w-4" aria-hidden="true" />} onClick={() => ask('reactivate')}>
                  Reactivate
                </Button>
              ) : (
                <Button variant="danger-outline" icon={<UserXIcon className="h-4 w-4" aria-hidden="true" />} onClick={() => ask('deactivate')}>
                  Deactivate
                </Button>
              )}
            </div>
          </Section>
        )}

        {canDelete && !isSelf && (
          <Section title="Delete account">
            <p className="text-sm text-ink-muted">
              Erases this account for good. Only possible if they have not entered data or made changes in the study; otherwise deactivate them.
            </p>
            <Button variant="danger-outline" className="w-full" icon={<Trash2Icon className="h-4 w-4" aria-hidden="true" />} onClick={() => ask('delete')}>
              Delete account
            </Button>
          </Section>
        )}

        <Section title="History">
          {history === null ? (
            <p className="flex items-center gap-2 text-sm text-ink-muted">
              <Loader2Icon className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading…
            </p>
          ) : history.length === 0 ? (
            <p className="text-sm text-ink-muted">No changes recorded yet.</p>
          ) : (
            <ol className="space-y-3">
              {history.map((h, i) => (
                <li key={`${h.at}-${i}`} className="flex gap-3 text-sm">
                  <HistoryIcon className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-ink">{h.summary}</p>
                    <p className="text-xs text-ink-muted">
                      {formatTimestamp(h.at)} · {h.by}
                      {h.reason ? ` · “${h.reason}”` : ''}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Section>
      </div>
    </Sheet>
  );
}
