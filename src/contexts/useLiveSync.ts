'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { toast } from 'sonner';
import { useAuth, type Session } from './AuthContext';
import { api } from '../utils/api';
import { getModuleDef } from '../utils/gating';
import type { ModuleId, Participant } from '../types/crf';

/*
 * Keeps this screen in step with everyone else's (see server/live.ts):
 *  - a live connection (/api/live) says which record changed; that record is fetched again through the normal API;
 *  - if the connection is blocked (some firewalls hold it open without passing anything), the list is checked every
 *    30 seconds instead, and whenever the tab comes back into view;
 *  - this screen's own unsaved typing is never replaced by a fresh copy (CrfStore's overlay);
 *  - if someone else changes a field this screen saved in the last two minutes, a warning says so.
 */

export type LiveStatus = 'connecting' | 'live' | 'polling';
export interface LiveChange {
  at: number;
  kind: string;
  module: number | null;
  by: string;
  mine: boolean;
}
export interface LiveEditor {
  userId: string;
  name: string;
  role: string;
  module: number;
}

type ServerEvent =
  | { type: 'hello'; userId: string; presence: { uid: string; editors: LiveEditor[] }[] }
  | { type: 'participant'; uid: string; module: number | null; kind: string; byId: string | null; by: string }
  | { type: 'account'; userId: string }
  | { type: 'presence'; uid: string; editors: LiveEditor[] };

const POLL_MS = 30_000;
/** No word from the live connection for this long: treat it as blocked and fall back to checking. */
const SILENT_MS = 60_000;
const CONFLICT_WINDOW_MS = 2 * 60_000;

const KIND_TEXT: Record<string, string> = {
  locked: 'locked',
  reopened: 'reopened for correction',
  discontinued: 'marked discontinued',
  photo: 'photo added',
  changed: 'updated',
  created: 'enrolled',
};

function openParticipant(): { uid: string; module: number | null } | null {
  const m = window.location.pathname.match(/^\/p\/([^/]+)/);
  if (!m) return null;
  const mod = Number(new URLSearchParams(window.location.search).get('m'));
  return { uid: decodeURIComponent(m[1]), module: Number.isInteger(mod) && mod >= 1 && mod <= 10 ? mod : null };
}

export function useLiveSync(args: {
  session: Session | null;
  reload: () => Promise<void>;
  overlay: (p: Participant) => Participant;
  setParticipants: Dispatch<SetStateAction<Participant[]>>;
  lastSent: MutableRefObject<Map<string, { fields: Record<string, unknown>; at: number }>>;
  pending: MutableRefObject<Map<string, Record<string, unknown>>>;
  inflight: MutableRefObject<Map<string, Record<string, unknown>>>;
}) {
  const { session, reload, overlay, setParticipants, lastSent, pending, inflight } = args;
  const { refreshSession } = useAuth();
  const [status, setStatus] = useState<LiveStatus>('connecting');
  const [changes, setChanges] = useState<Record<string, LiveChange>>({});
  const [editors, setEditors] = useState<Record<string, LiveEditor[]>>({});
  const lastHeard = useRef(0);
  const lastSync = useRef(Date.now());
  const me = session?.userId ?? '';
  const signedIn = !!session && !session.mustChangePassword;

  /** Fetches one record after someone changed it and lays this screen's unsaved typing back on top. */
  const refreshOne = useCallback(
    async (e: Extract<ServerEvent, { type: 'participant' }>) => {
      // This screen's own saves: it already shows them (another tab of the same account still refreshes).
      if (e.byId === me && e.kind === 'changed') {
        const now = Date.now();
        const busyHere = [...lastSent.current].some(([k, v]) => k.startsWith(`${e.uid}|`) && now - v.at < 5000) ||
          [...pending.current.keys(), ...inflight.current.keys()].some((k) => k.startsWith(`${e.uid}|`));
        if (busyHere) return;
      }
      let fresh: Participant;
      try {
        ({ participant: fresh } = await api<{ participant: Participant }>(`/api/participants/${encodeURIComponent(e.uid)}`));
      } catch {
        return; // removed or no longer visible; the next full check settles it
      }
      const mine = e.byId === me;
      setParticipants((prev) => {
        const next = overlay(fresh);
        return prev.some((p) => p.uid === next.uid) ? prev.map((p) => (p.uid === next.uid ? next : p)) : [next, ...prev];
      });
      setChanges((c) => ({ ...c, [e.uid]: { at: Date.now(), kind: e.kind, module: e.module, by: e.by, mine } }));
      // Re-render once the highlight is over, so "Just updated by …" goes away by itself.
      window.setTimeout(() => setChanges((c) => ({ ...c })), 6500);
      if (mine) return;

      // Someone else overwrote a field this screen saved a moment ago (and is not still typing in).
      if (e.module) {
        const key = `${e.uid}|${e.module}`;
        const sent = lastSent.current.get(key);
        if (sent && Date.now() - sent.at < CONFLICT_WINDOW_MS) {
          const local = { ...(inflight.current.get(key) ?? {}), ...(pending.current.get(key) ?? {}) };
          const now = (fresh.data as unknown as Record<string, Record<string, unknown>>)[`m${e.module}`] ?? {};
          const clashes = Object.keys(sent.fields).filter((f) => !(f in local) && JSON.stringify(now[f]) !== JSON.stringify(sent.fields[f]));
          if (clashes.length) {
            for (const f of clashes) delete sent.fields[f];
            toast.warning(`${e.by || 'Someone'} changed ${clashes.length === 1 ? 'a field' : `${clashes.length} fields`} you just entered`, {
              id: `clash-${key}`,
              description: `Module ${e.module}: their value is now shown. Please check it.`,
              duration: 12_000,
            });
            return;
          }
        }
      }

      // A short note when the record on screen changes in a way that matters.
      const open = openParticipant();
      if (open?.uid === e.uid && (e.kind !== 'changed' || (e.module && open.module === e.module))) {
        const what = e.module ? `Module ${e.module} (${getModuleDef(e.module as ModuleId).step})` : 'This participant';
        toast.info(`${what} ${KIND_TEXT[e.kind] ?? 'updated'}${e.by ? ` by ${e.by}` : ''}`, { id: `live-${e.uid}-${e.module}`, duration: 5000 });
      }
    },
    [me, overlay, setParticipants, lastSent, pending, inflight],
  );

  const fullSync = useCallback(async () => {
    lastSync.current = Date.now();
    await reload();
  }, [reload]);

  // The live connection.
  useEffect(() => {
    if (!signedIn || typeof EventSource === 'undefined') {
      setStatus('polling');
      return;
    }
    let source: EventSource | null = null;
    let closed = false;
    let wasDown = false;
    const connect = () => {
      source = new EventSource('/api/live');
      setStatus('connecting');
      source.onmessage = (msg) => {
        lastHeard.current = Date.now();
        let e: ServerEvent;
        try {
          e = JSON.parse(msg.data) as ServerEvent;
        } catch {
          return;
        }
        if (e.type === 'hello') {
          setStatus('live');
          setEditors(Object.fromEntries(e.presence.map((p) => [p.uid, p.editors])));
          if (wasDown) void fullSync(); // catch up on anything missed while disconnected
          wasDown = false;
        } else if (e.type === 'participant') void refreshOne(e);
        else if (e.type === 'presence') setEditors((cur) => ({ ...cur, [e.uid]: e.editors }));
        else if (e.type === 'account') void refreshSession();
      };
      source.onerror = () => {
        wasDown = true;
        setStatus('polling');
        // The browser retries by itself; a closed source (e.g. signed out) is reopened after a pause.
        if (source?.readyState === EventSource.CLOSED && !closed) window.setTimeout(() => !closed && connect(), 10_000);
      };
    };
    connect();
    return () => {
      closed = true;
      source?.close();
    };
  }, [signedIn, refreshOne, fullSync, refreshSession]);

  // Fallback: check every 30 s while the connection is down or silent, and when the tab comes back into view.
  useEffect(() => {
    if (!signedIn) return;
    const tick = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      const silent = Date.now() - lastHeard.current > SILENT_MS;
      if (silent && status !== 'connecting') setStatus('polling');
      if ((status !== 'live' || silent) && Date.now() - lastSync.current >= POLL_MS) void fullSync();
    }, 5_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastSync.current >= POLL_MS) void fullSync();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(tick);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [signedIn, status, fullSync]);

  // Others only: this screen does not need to be told that its own user is editing.
  const others = useMemo(() => Object.fromEntries(Object.entries(editors).map(([uid, list]) => [uid, list.filter((e) => e.userId !== me)])), [editors, me]);
  return useMemo(() => ({ status, changes, editors: others }), [status, changes, others]);
}

/** Tells everyone else "I have this module open for entry" every 20 s while it is, and when leaving it. */
export function usePresence(uid: string | null, module: number | null) {
  useEffect(() => {
    if (!uid || !module) return;
    const send = (m: number | null) =>
      fetch('/api/live/presence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid, module: m }), credentials: 'same-origin', keepalive: true }).catch(() => {});
    void send(module);
    const timer = window.setInterval(() => document.visibilityState === 'visible' && void send(module), 20_000);
    const onHide = () => void send(document.visibilityState === 'hidden' ? null : module);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onHide);
      void send(null);
    };
  }, [uid, module]);
}
