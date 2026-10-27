import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeftIcon, ChevronRightIcon, Loader2Icon, SearchIcon, ShieldAlertIcon, UserPlusIcon } from 'lucide-react';
import { toast } from 'sonner';
import { AccessRequestSheet } from '../components/admin/AccessRequestSheet';
import { AddStaffSheet } from '../components/admin/AddStaffSheet';
import { StaffSheet } from '../components/admin/StaffSheet';
import { SetupLinkSheet } from '../components/admin/SetupLinkSheet';
import { useAuth } from '../contexts/AuthContext';
import { ROLE_LABELS } from '../data/roles';
import { api } from '../utils/api';
import { formatTimestamp } from '../utils/dates';
import type { AccessRequest } from '../types/accessRequests';
import type { SetupLink, StaffMember, StaffStatus } from '../types/staff';

type Filter = 'all' | StaffStatus;

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'invited', label: 'Invited' },
  { key: 'deactivated', label: 'Deactivated' },
];

const STATUS_CHIP: Record<StaffStatus, { label: string; cls: string }> = {
  active: { label: 'Active', cls: 'border-ok-200 bg-ok-50 text-ok-700' },
  invited: { label: 'Invited', cls: 'border-warn-200 bg-warn-50 text-warn-700' },
  deactivated: { label: 'Deactivated', cls: 'border-lock-300 bg-lock-100 text-lock-600' },
};

export function AdminView() {
  const { session } = useAuth();
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [linkFor, setLinkFor] = useState<{ member: StaffMember; link: SetupLink } | null>(null);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [requestId, setRequestId] = useState<string | null>(null);
  const isPi = session?.actor.role === 'pi';

  const load = useCallback(async () => {
    try {
      const res = await api<{ staff: StaffMember[] }>('/api/admin/staff');
      setStaff(res.staff);
      setSelfId(res.staff.find((s) => s.email === session?.email)?.id ?? null);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load staff');
    }
  }, [session?.email]);

  const loadRequests = useCallback(async () => {
    try {
      setRequests((await api<{ requests: AccessRequest[] }>('/api/admin/requests')).requests);
    } catch {
      /* the staff list still works without the inbox */
    }
  }, []);

  useEffect(() => {
    if (session?.actor.isAdmin) void load();
  }, [session?.actor.isAdmin, load]);

  useEffect(() => {
    if (isPi) void loadRequests();
  }, [isPi, loadRequests]);

  const upsert = (m: StaffMember) => setStaff((prev) => (prev?.some((s) => s.id === m.id) ? prev.map((s) => (s.id === m.id ? m : s)) : [m, ...(prev ?? [])]));

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, active: 0, invited: 0, deactivated: 0 };
    staff?.forEach((s) => {
      c.all++;
      c[s.status]++;
    });
    return c;
  }, [staff]);

  if (!session?.actor.isAdmin) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-canvas px-6 text-center">
        <ShieldAlertIcon className="h-10 w-10 text-ink-muted" aria-hidden="true" />
        <h1 className="text-lg font-semibold text-ink">Administrators only</h1>
        <p className="max-w-sm text-sm text-ink-muted">Staff accounts are managed by the PI and the data manager.</p>
        <Link href="/" className="mt-2 flex min-h-[48px] items-center rounded-xl bg-brand-600 px-5 font-semibold text-white hover:bg-brand-700">
          Back to dashboard
        </Link>
      </main>
    );
  }

  const q = query.trim().toLowerCase();
  const visible = (staff ?? []).filter(
    (s) => (filter === 'all' || s.status === filter) && (!q || s.name.toLowerCase().includes(q) || s.email.includes(q)),
  );
  const open = staff?.find((s) => s.id === openId) ?? null;

  return (
    <div className="min-h-screen w-full bg-canvas">
      <header className="border-b border-line bg-white">
        <div className="mx-auto max-w-3xl px-4 pb-4 pt-5">
          <div className="flex items-center gap-2">
            <Link
              href="/"
              aria-label="Back to dashboard"
              className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-ink-soft hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
            >
              <ArrowLeftIcon className="h-5 w-5" aria-hidden="true" />
            </Link>
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight text-ink">Staff accounts</h1>
              <p className="text-sm text-ink-muted">Accounts come from invitations or approved requests. They are deactivated, never deleted.</p>
            </div>
          </div>
          <div className="relative mt-4">
            <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
            <label htmlFor="staff-search" className="sr-only">
              Search staff
            </label>
            <input
              id="staff-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or email"
              className="h-12 w-full rounded-xl border border-line-strong bg-white pl-11 pr-3 text-base text-ink outline-none transition-colors duration-150 placeholder:text-ink-muted/80 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
            />
          </div>
        </div>
        <div className="mx-auto max-w-3xl">
          <div role="group" aria-label="Filter by status" className="scrollbar-none flex gap-2 overflow-x-auto px-4 pb-3">
            {FILTERS.map((f) => {
              const active = filter === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(f.key)}
                  className={`flex min-h-[40px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm font-medium transition-[background-color,border-color,color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 ${
                    active ? 'border-ink bg-ink text-white' : 'border-line-strong bg-white text-ink-soft hover:bg-canvas'
                  }`}
                >
                  {f.label}
                  <span className={`tabular-nums ${active ? 'text-white/75' : 'text-ink-muted'}`}>{counts[f.key]}</span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-32 pt-4">
        {isPi && requests.length > 0 && (
          <section aria-labelledby="requests-heading" className="mb-6">
            <h2 id="requests-heading" className="mb-2 text-sm font-semibold text-ink">
              Access requests
              {requests.some((r) => r.status === 'pending') && (
                <span className="ml-2 rounded-full bg-warn-50 px-2 py-0.5 text-xs font-semibold text-warn-700">
                  {requests.filter((r) => r.status === 'pending').length} waiting
                </span>
              )}
            </h2>
            <ul className="space-y-2">
              {requests
                .filter((r) => r.status === 'pending')
                .map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setRequestId(r.id)}
                      className="flex w-full items-center gap-3 rounded-2xl border border-warn-200 bg-warn-50/40 p-4 text-left transition-colors duration-150 hover:border-warn-600/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-ink">{r.name}</p>
                        <p className="truncate text-sm text-ink-muted">{r.email}</p>
                        <p className="mt-1 text-sm text-ink-soft">Asked for {ROLE_LABELS[r.requestedRole]}</p>
                        <p className="text-xs text-ink-muted">Sent {formatTimestamp(r.createdAt)}</p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold text-brand-700">Review</span>
                      <ChevronRightIcon className="h-5 w-5 shrink-0 text-ink-muted" aria-hidden="true" />
                    </button>
                  </li>
                ))}
            </ul>
            {requests.some((r) => r.status !== 'pending') && (
              <details className="mt-3 rounded-2xl border border-line bg-white px-4 py-3 text-sm">
                <summary className="cursor-pointer font-medium text-ink-soft">Recent decisions ({requests.filter((r) => r.status !== 'pending').length})</summary>
                <ul className="mt-3 space-y-2">
                  {requests
                    .filter((r) => r.status !== 'pending')
                    .map((r) => (
                      <li key={r.id}>
                        <button type="button" onClick={() => setRequestId(r.id)} className="flex w-full items-center justify-between gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600">
                          <span className="min-w-0 truncate text-ink">
                            {r.name} <span className="text-ink-muted">· {r.email}</span>
                          </span>
                          <span className="shrink-0 capitalize text-ink-muted">{r.status}</span>
                        </button>
                      </li>
                    ))}
                </ul>
              </details>
            )}
          </section>
        )}
        <h2 className="sr-only">Staff</h2>
        {staff === null && !loadError ? (
          <div className="mt-16 flex justify-center text-ink-muted" aria-busy="true">
            <Loader2Icon className="h-6 w-6 animate-spin" aria-hidden="true" />
            <span className="sr-only">Loading staff</span>
          </div>
        ) : loadError ? (
          <div className="mt-10 flex flex-col items-center text-center" role="alert">
            <p className="font-medium text-ink">Could not load staff</p>
            <p className="text-sm text-ink-muted">{loadError}</p>
            <button type="button" onClick={() => void load()} className="mt-3 min-h-[44px] rounded-xl border border-line-strong px-4 text-sm font-semibold text-ink hover:bg-white">
              Try again
            </button>
          </div>
        ) : visible.length === 0 ? (
          <p className="mt-10 text-center text-sm text-ink-muted">No staff match.</p>
        ) : (
          <ul className="space-y-3">
            {visible.map((s) => {
              const chip = STATUS_CHIP[s.status];
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(s.id)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-line bg-white p-4 text-left transition-colors duration-150 hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-ink">{s.name}</span>
                        {s.id === selfId && <span className="text-xs text-ink-muted">(you)</span>}
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${chip.cls}`}>{chip.label}</span>
                        {s.isAdmin && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">Admin</span>}
                      </div>
                      <p className="truncate text-sm text-ink-muted">{s.email}</p>
                      <p className="mt-1 text-sm text-ink-soft">
                        {ROLE_LABELS[s.role]}
                        {s.delegations.length > 0 && ` · extra: ${s.delegations.map((d) => `M${d.moduleId}`).join(', ')}`}
                      </p>
                      <p className="text-xs text-ink-muted">{s.lastSignInAt ? `Last signed in ${formatTimestamp(s.lastSignInAt)}` : 'Never signed in'}</p>
                    </div>
                    <ChevronRightIcon className="h-5 w-5 shrink-0 text-ink-muted" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      <button
        type="button"
        onClick={() => setAdding(true)}
        className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-4 z-30 flex min-h-[56px] items-center gap-2 rounded-2xl bg-brand-600 pl-4 pr-5 font-semibold text-white shadow-lg transition-[background-color,transform] duration-150 ease-out hover:bg-brand-700 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 lg:right-[calc(50%_-_23rem)]"
      >
        <UserPlusIcon className="h-5 w-5" aria-hidden="true" />
        Add staff
      </button>

      <AddStaffSheet
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={(member, link) => {
          upsert(member);
          setAdding(false);
          setLinkFor({ member, link });
          toast.success(`${member.name} added`);
        }}
      />
      <StaffSheet
        member={open}
        isSelf={!!open && open.id === selfId}
        onClose={() => setOpenId(null)}
        onUpdated={(m) => {
          upsert(m);
          toast.success('Saved');
        }}
        onLink={(member, link) => {
          setOpenId(null);
          setLinkFor({ member, link });
        }}
      />
      <AccessRequestSheet
        request={requests.find((r) => r.id === requestId) ?? null}
        onClose={() => setRequestId(null)}
        onDecided={(r, outcome) => {
          setRequestId(null);
          toast.success(outcome === 'approved' ? `${r.name} can now sign in` : 'Request rejected');
          void loadRequests();
          void load();
        }}
      />
      <SetupLinkSheet member={linkFor?.member ?? null} link={linkFor?.link ?? null} onClose={() => setLinkFor(null)} />
    </div>
  );
}
