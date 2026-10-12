'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { seedParticipants } from '../data/participants';
import { DEFAULT_USER } from '../data/staff';
import { isIneligible } from '../utils/gating';
import { newParticipant } from '../utils/participant';
import type { CrfData, M10Reason, ModuleId, ModuleKey, Participant, StaffUser } from '../types/crf';

// Local-only persistence for the dev phase. Swap these two loaders/savers for API calls when MongoDB is connected.
const STORAGE_KEY = 'smart-tb-crf:participants:v3';

interface CrfStore {
  participants: Participant[];
  user: StaffUser;
  setUser: (user: StaffUser) => void;
  enroll: () => string;
  updateModuleData: <K extends ModuleKey>(uid: string, key: K, patch: Partial<CrfData[K]>) => void;
  saveDraft: (uid: string, id: ModuleId) => void;
  completeModule: (uid: string, id: ModuleId) => void;
  requestEdit: (uid: string, id: ModuleId, reason: string) => void;
  discontinue: (uid: string, reason: M10Reason) => void;
  resetDemo: () => void;
}

const CrfStoreContext = createContext<CrfStore | null>(null);

function cloneSeed(): Participant[] {
  return JSON.parse(JSON.stringify(seedParticipants)) as Participant[];
}

function loadParticipants(): Participant[] {
  try {
    // Older demo data used placeholder staff names (v1) and drawn signatures (v2); drop it for the current shape.
    ['smart-tb-crf:participants:v1', 'smart-tb-crf:participants:v2'].forEach((k) => localStorage.removeItem(k));
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Participant[];
  } catch {
    /* fall back to seed */
  }
  return cloneSeed();
}

export function CrfStoreProvider({ children }: { children: React.ReactNode }) {
  const [participants, setParticipants] = useState<Participant[]>(loadParticipants);
  const [user, setUser] = useState<StaffUser>(DEFAULT_USER);
  const userRef = useRef(user);
  userRef.current = user;

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(participants));
    } catch {
      /* storage full or unavailable */
    }
  }, [participants]);

  const mutate = useCallback((uid: string, fn: (p: Participant) => Participant) => {
    setParticipants((prev) => prev.map((p) => (p.uid === uid ? { ...fn(p), updatedAt: new Date().toISOString() } : p)));
  }, []);

  const enroll = useCallback(() => {
    const p = newParticipant();
    setParticipants((prev) => [p, ...prev]);
    return p.uid;
  }, []);

  const updateModuleData = useCallback(
    <K extends ModuleKey>(uid: string, key: K, patch: Partial<CrfData[K]>) => {
      mutate(uid, (p) => ({ ...p, data: { ...p.data, [key]: { ...p.data[key], ...patch } } as CrfData }));
    },
    [mutate],
  );

  const saveDraft = useCallback(
    (uid: string, id: ModuleId) => {
      mutate(uid, (p) => ({ ...p, meta: { ...p.meta, [id]: { ...p.meta[id], draftSavedAt: new Date().toISOString() } } }));
    },
    [mutate],
  );

  const completeModule = useCallback(
    (uid: string, id: ModuleId) => {
      mutate(uid, (p) => {
        const u = userRef.current;
        const prev = p.meta[id];
        const next: Participant = {
          ...p,
          meta: {
            ...p.meta,
            [id]: {
              ...prev,
              completed: true,
              editing: false,
              completedBy: prev.completedBy || u.name,
              completedRole: prev.completedRole || u.role,
              completedAt: prev.completedAt || new Date().toISOString(),
            },
          },
        };
        if (id === 2 && isIneligible(next)) {
          next.data = { ...next.data, m10: { ...next.data.m10, status: 'discontinued', reason: 'screen_failure' } };
        }
        return next;
      });
    },
    [mutate],
  );

  const requestEdit = useCallback(
    (uid: string, id: ModuleId, reason: string) => {
      mutate(uid, (p) => {
        const u = userRef.current;
        const prev = p.meta[id];
        return {
          ...p,
          meta: {
            ...p.meta,
            [id]: { ...prev, editing: true, edits: [...prev.edits, { at: new Date().toISOString(), by: u.name, role: u.role, reason }] },
          },
        };
      });
    },
    [mutate],
  );

  const discontinue = useCallback(
    (uid: string, reason: M10Reason) => {
      mutate(uid, (p) => ({
        ...p,
        discontinuationRequested: true,
        data: { ...p.data, m10: { ...p.data.m10, status: 'discontinued', reason: reason || p.data.m10.reason } },
      }));
    },
    [mutate],
  );

  const resetDemo = useCallback(() => setParticipants(cloneSeed()), []);

  const value = useMemo<CrfStore>(
    () => ({
      participants,
      user,
      setUser,
      enroll,
      updateModuleData,
      saveDraft,
      completeModule,
      requestEdit,
      discontinue,
      resetDemo,
    }),
    [participants, user, enroll, updateModuleData, saveDraft, completeModule, requestEdit, discontinue, resetDemo],
  );

  return <CrfStoreContext.Provider value={value}>{children}</CrfStoreContext.Provider>;
}

export function useCrfStore(): CrfStore {
  const ctx = useContext(CrfStoreContext);
  if (!ctx) throw new Error('useCrfStore must be used within CrfStoreProvider');
  return ctx;
}
