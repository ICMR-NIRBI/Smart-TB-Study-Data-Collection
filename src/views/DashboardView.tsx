import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { PlusIcon, SearchIcon, UserIcon, UsersIcon } from 'lucide-react';
import { ParticipantCard } from '../components/dashboard/ParticipantCard';
import { UserSheet } from '../components/dashboard/UserSheet';
import { useCrfStore } from '../contexts/CrfStoreContext';
import { IDLE_TIMEOUT_MIN, useAuth } from '../contexts/AuthContext';
import { SITE_NAME } from '../data/modules';
import { getStatus } from '../utils/gating';
import type { ParticipantStatus } from '../types/crf';

type Filter = 'all' | ParticipantStatus;

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'completed', label: 'Completed' },
  { key: 'ineligible', label: 'Ineligible' },
  { key: 'discontinued', label: 'Discontinued' },
];

export function DashboardView() {
  const { participants, user, enroll, resetDemo } = useCrfStore();
  const { session, signOut } = useAuth();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [userOpen, setUserOpen] = useState(false);

  const rows = useMemo(
    () => participants.map((p) => ({ p, status: getStatus(p) })).sort((a, b) => b.p.updatedAt.localeCompare(a.p.updatedAt)),
    [participants],
  );

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: rows.length, in_progress: 0, completed: 0, ineligible: 0, discontinued: 0 };
    rows.forEach((r) => {
      c[r.status]++;
    });
    return c;
  }, [rows]);

  const q = query.trim().toLowerCase();
  const visible = rows.filter(
    (r) => (filter === 'all' || r.status === filter) && (!q || (r.p.data.m1.participantId || 'new participant').toLowerCase().includes(q)),
  );

  const handleEnroll = () => {
    const uid = enroll();
    router.push(`/p/${uid}`);
  };

  const initials = user.name
    .replace(/^(Dr\.|Prof\.)\s*/i, '')
    .split(/\s+/)
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="min-h-screen w-full bg-canvas">
      <header className="border-b border-line bg-white">
        <div className="mx-auto max-w-3xl px-4 pb-4 pt-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight text-ink">SMART-TB CRF</h1>
              <p className="truncate text-sm text-ink-muted">HRZE pharmacokinetics · {SITE_NAME}</p>
            </div>
            <button
              type="button"
              onClick={() => setUserOpen(true)}
              aria-label={`Signed in as ${user.name}, ${user.role}. Account and sign out`}
              className="flex min-h-[44px] shrink-0 items-center gap-2 rounded-full border border-line py-1 pl-1 pr-1 transition-colors duration-150 hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 sm:pr-3"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
                {initials || <UserIcon className="h-4 w-4" aria-hidden="true" />}
              </span>
              <span className="hidden text-left sm:block">
                <span className="block text-sm font-medium leading-tight text-ink">{user.name}</span>
                <span className="block text-xs leading-tight text-ink-muted">{user.role}</span>
              </span>
            </button>
          </div>
          <div className="relative mt-4">
            <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
            <label htmlFor="search" className="sr-only">
              Search by participant ID
            </label>
            <input
              id="search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search participant ID"
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
        <h2 className="sr-only">Participants</h2>
        {visible.length > 0 ? (
          <ul className="space-y-3">
            {visible.map(({ p, status }) => (
              <li key={p.uid}>
                <ParticipantCard participant={p} status={status} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-10 flex flex-col items-center text-center">
            <UsersIcon className="h-10 w-10 text-ink-muted" aria-hidden="true" />
            <p className="mt-3 font-medium text-ink">No participants match</p>
            <p className="text-sm text-ink-muted">Try another ID or clear the filter.</p>
          </div>
        )}
      </main>

      <button
        type="button"
        onClick={handleEnroll}
        className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-4 z-30 flex min-h-[56px] items-center gap-2 rounded-2xl bg-brand-600 pl-4 pr-5 font-semibold text-white shadow-lg transition-[background-color,transform] duration-150 ease-out hover:bg-brand-700 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 lg:right-[calc(50%_-_23rem)]"
      >
        <PlusIcon className="h-5 w-5" aria-hidden="true" />
        Enroll participant
      </button>

      <UserSheet
        open={userOpen}
        user={user}
        email={session?.email ?? ''}
        isAdmin={Boolean(session?.isAdmin)}
        idleMinutes={IDLE_TIMEOUT_MIN}
        onClose={() => setUserOpen(false)}
        onSignOut={() => {
          setUserOpen(false);
          signOut('signed_out');
        }}
        onResetDemo={() => {
          resetDemo();
          setUserOpen(false);
          toast('Demo data restored');
        }}
      />
    </div>
  );
}
