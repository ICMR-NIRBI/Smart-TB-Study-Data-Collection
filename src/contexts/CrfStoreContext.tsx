'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from './AuthContext';
import { api, ApiRequestError } from '../utils/api';
import type { Actor } from '../data/roles';
import type { CrfData, M10Reason, ModuleId, ModuleKey, Participant, StaffUser } from '../types/crf';

/** Field edits are batched per module and sent this long after the last keystroke. */
const SAVE_DELAY_MS = 600;

export type ActionResult = { ok: true } | { ok: false; error: string; details?: unknown };

interface CrfStore {
  participants: Participant[];
  loading: boolean;
  loadError: string | null;
  /** True while field edits are waiting to reach the server. */
  saving: boolean;
  user: StaffUser;
  actor: Actor;
  reload: () => Promise<void>;
  enroll: () => Promise<string | null>;
  updateModuleData: <K extends ModuleKey>(uid: string, key: K, patch: Partial<CrfData[K]>) => void;
  saveDraft: (uid: string, id: ModuleId) => Promise<ActionResult>;
  completeModule: (uid: string, id: ModuleId) => Promise<ActionResult>;
  requestEdit: (uid: string, id: ModuleId, reason: string) => Promise<ActionResult>;
  discontinue: (uid: string, reason: M10Reason) => Promise<ActionResult>;
}

const CrfStoreContext = createContext<CrfStore | null>(null);

const NO_USER: StaffUser = { name: '', role: '' };
const NO_ACTOR: Actor = { role: 'research_officer', isAdmin: false, delegations: [] };

const errorOf = (err: unknown): ActionResult => ({
  ok: false,
  error: err instanceof Error ? err.message : 'Something went wrong',
  details: err instanceof ApiRequestError ? err.details : undefined,
});

export function CrfStoreProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const pending = useRef(new Map<string, Record<string, unknown>>());
  const chains = useRef(new Map<string, Promise<void>>());
  const timer = useRef<number | null>(null);

  const replace = useCallback((next: Participant) => {
    setParticipants((prev) => (prev.some((p) => p.uid === next.uid) ? prev.map((p) => (p.uid === next.uid ? next : p)) : [next, ...prev]));
  }, []);

  const reload = useCallback(async () => {
    try {
      const { participants: list } = await api<{ participants: Participant[] }>('/api/participants');
      setParticipants(list);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load participants');
    } finally {
      setLoading(false);
    }
  }, []);

  const reloadOne = useCallback(
    async (uid: string) => {
      try {
        const { participant } = await api<{ participant: Participant }>(`/api/participants/${encodeURIComponent(uid)}`);
        replace(participant);
      } catch {
        /* the next full reload will resync */
      }
    },
    [replace],
  );

  useEffect(() => {
    if (!session || session.mustChangePassword) {
      setParticipants([]);
      setLoading(true);
      return;
    }
    void reload();
  }, [session, reload]);

  // --- Field edits: optimistic locally, batched to the server per module --------------------------

  const refreshSaving = useCallback(() => setSaving(pending.current.size > 0 || chains.current.size > 0), []);

  const sendKey = useCallback(
    (key: string): Promise<void> => {
      const patch = pending.current.get(key);
      if (!patch) return chains.current.get(key) ?? Promise.resolve();
      pending.current.delete(key);
      const [uid, id] = key.split('|');
      const run = (chains.current.get(key) ?? Promise.resolve())
        .then(() => api(`/api/participants/${encodeURIComponent(uid)}/modules/${id}`, { method: 'PATCH', body: { patch } }))
        .then(() => undefined)
        .catch((err: unknown) => {
          toast.error('Change not saved', { description: err instanceof Error ? err.message : undefined });
          void reloadOne(uid);
        })
        .finally(() => {
          if (chains.current.get(key) === run) chains.current.delete(key);
          refreshSaving();
        });
      chains.current.set(key, run);
      return run;
    },
    [refreshSaving, reloadOne],
  );

  /** Sends queued edits (all, or one participant's) and waits until the server has them. */
  const flush = useCallback(
    async (uid?: string) => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
      const keys = [...new Set([...pending.current.keys(), ...chains.current.keys()])].filter((k) => !uid || k.startsWith(`${uid}|`));
      await Promise.all(keys.map(sendKey));
      // Re-arm the timer for other participants' edits that were left queued.
      if (pending.current.size) timer.current = window.setTimeout(() => void flush(), SAVE_DELAY_MS);
    },
    [sendKey],
  );

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (pending.current.size || chains.current.size) e.preventDefault();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [flush]);

  const updateModuleData = useCallback(
    <K extends ModuleKey>(uid: string, key: K, patch: Partial<CrfData[K]>) => {
      setParticipants((prev) =>
        prev.map((p) =>
          p.uid === uid
            ? { ...p, updatedAt: new Date().toISOString(), data: { ...p.data, [key]: { ...p.data[key], ...patch } } as CrfData }
            : p,
        ),
      );
      const qKey = `${uid}|${key.slice(1)}`;
      pending.current.set(qKey, { ...(pending.current.get(qKey) ?? {}), ...patch });
      setSaving(true);
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), SAVE_DELAY_MS);
    },
    [flush],
  );

  // --- Actions: saved edits first, then the server decides and returns the updated record ----------

  /** Sends queued edits first, then posts the action; `id` targets a module, otherwise the participant. */
  const postAction = useCallback(
    async (uid: string, id: ModuleId | null, body: Record<string, unknown>): Promise<ActionResult> => {
      try {
        await flush(uid);
        const path = `/api/participants/${encodeURIComponent(uid)}${id === null ? '' : `/modules/${id}`}`;
        const { participant } = await api<{ participant: Participant }>(path, { method: 'POST', body });
        replace(participant);
        return { ok: true };
      } catch (err) {
        return errorOf(err);
      }
    },
    [flush, replace],
  );

  const saveDraft = useCallback((uid: string, id: ModuleId) => postAction(uid, id, { action: 'draft' }), [postAction]);
  const completeModule = useCallback((uid: string, id: ModuleId) => postAction(uid, id, { action: 'complete' }), [postAction]);
  const requestEdit = useCallback(
    (uid: string, id: ModuleId, reason: string) => postAction(uid, id, { action: 'reopen', reason }),
    [postAction],
  );
  const discontinue = useCallback(
    (uid: string, reason: M10Reason) => postAction(uid, null, { action: 'discontinue', reason }),
    [postAction],
  );

  const enroll = useCallback(async () => {
    try {
      const { participant } = await api<{ participant: Participant }>('/api/participants', { method: 'POST' });
      replace(participant);
      return participant.uid;
    } catch (err) {
      toast.error('Could not enroll participant', { description: err instanceof Error ? err.message : undefined });
      return null;
    }
  }, [replace]);

  const value = useMemo<CrfStore>(
    () => ({
      participants,
      loading,
      loadError,
      saving,
      user: session?.user ?? NO_USER,
      actor: session?.actor ?? NO_ACTOR,
      reload,
      enroll,
      updateModuleData,
      saveDraft,
      completeModule,
      requestEdit,
      discontinue,
    }),
    [participants, loading, loadError, saving, session, reload, enroll, updateModuleData, saveDraft, completeModule, requestEdit, discontinue],
  );

  return <CrfStoreContext.Provider value={value}>{children}</CrfStoreContext.Provider>;
}

export function useCrfStore(): CrfStore {
  const ctx = useContext(CrfStoreContext);
  if (!ctx) throw new Error('useCrfStore must be used within CrfStoreProvider');
  return ctx;
}
