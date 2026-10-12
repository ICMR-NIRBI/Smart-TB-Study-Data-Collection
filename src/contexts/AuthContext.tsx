'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useCrfStore } from './CrfStoreContext';
import { findAccount } from '../data/demoAccounts';
import type { StaffUser } from '../types/crf';

const SESSION_KEY = 'smart-tb-crf:session:v2';
const ATTEMPTS_KEY = 'smart-tb-crf:login-attempts:v1';

export const IDLE_TIMEOUT_MIN = 15;
const IDLE_TIMEOUT_MS = IDLE_TIMEOUT_MIN * 60 * 1000;
const IDLE_WARNING_MS = (IDLE_TIMEOUT_MIN - 2) * 60 * 1000;
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000;

export type AuthNotice = 'signed_out' | 'timeout' | null;

export interface Session {
  email: string;
  user: StaffUser;
  isAdmin: boolean;
  startedAt: string;
  lastActiveAt: number;
}

export type SignInResult = { ok: true } | { ok: false; error: string; locked?: boolean };

interface AuthStore {
  session: Session | null;
  notice: AuthNotice;
  clearNotice: () => void;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signOut: (reason?: 'signed_out' | 'timeout') => void;
  lockoutRemaining: (email: string) => number;
}

type Attempts = Record<string, { fails: number; lockedUntil: number }>;

const AuthContext = createContext<AuthStore | null>(null);

function readJson<T>(storage: Storage, key: string, fallback: T): T {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(storage: Storage, key: string, value: unknown) {
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

function loadSession(): Session | null {
  const s = readJson<Session | null>(sessionStorage, SESSION_KEY, null);
  if (s && Date.now() - s.lastActiveAt > IDLE_TIMEOUT_MS) {
    writeJson(sessionStorage, SESSION_KEY, null);
    return null;
  }
  return s;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser } = useCrfStore();
  const [session, setSession] = useState<Session | null>(loadSession);
  const [notice, setNotice] = useState<AuthNotice>(null);
  const lastActiveRef = useRef<number>(session?.lastActiveAt ?? Date.now());
  const warnedRef = useRef(false);

  // The signed-in account is the identity stamped on completed modules.
  useEffect(() => {
    if (session) setUser(session.user);
  }, [session, setUser]);

  const signOut = useCallback((reason: 'signed_out' | 'timeout' = 'signed_out') => {
    writeJson(sessionStorage, SESSION_KEY, null);
    warnedRef.current = false;
    toast.dismiss('idle-warning');
    setSession(null);
    setNotice(reason);
  }, []);

  const clearNotice = useCallback(() => setNotice(null), []);

  const lockoutRemaining = useCallback((email: string) => {
    const rec = readJson<Attempts>(localStorage, ATTEMPTS_KEY, {})[email.trim().toLowerCase()];
    return rec && rec.lockedUntil > Date.now() ? rec.lockedUntil - Date.now() : 0;
  }, []);

  const signIn = useCallback(async (emailRaw: string, password: string): Promise<SignInResult> => {
    const email = emailRaw.trim().toLowerCase();
    await new Promise((r) => setTimeout(r, 700));

    const attempts = readJson<Attempts>(localStorage, ATTEMPTS_KEY, {});
    const rec = attempts[email] ?? { fails: 0, lockedUntil: 0 };
    if (rec.lockedUntil > Date.now()) {
      const mins = Math.ceil((rec.lockedUntil - Date.now()) / 60000);
      return { ok: false, locked: true, error: `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.` };
    }

    const account = findAccount(email);
    if (!account || account.password !== password) {
      const fails = (rec.lockedUntil ? 0 : rec.fails) + 1;
      const locked = fails >= MAX_ATTEMPTS;
      attempts[email] = { fails, lockedUntil: locked ? Date.now() + LOCKOUT_MS : 0 };
      writeJson(localStorage, ATTEMPTS_KEY, attempts);
      if (locked) return { ok: false, locked: true, error: 'Too many failed attempts. Sign-in is locked for 5 minutes.' };
      const left = MAX_ATTEMPTS - fails;
      return { ok: false, error: `Incorrect email or password. ${left} attempt${left === 1 ? '' : 's'} remaining.` };
    }

    delete attempts[email];
    writeJson(localStorage, ATTEMPTS_KEY, attempts);
    const now = Date.now();
    const next: Session = {
      email,
      user: account.user,
      isAdmin: Boolean(account.isAdmin),
      startedAt: new Date(now).toISOString(),
      lastActiveAt: now,
    };
    lastActiveRef.current = now;
    warnedRef.current = false;
    writeJson(sessionStorage, SESSION_KEY, next);
    setNotice(null);
    setSession(next);
    return { ok: true };
  }, []);

  // Idle timeout: warn 2 minutes before, sign out at 15 minutes of inactivity.
  useEffect(() => {
    if (!session) return;
    let lastWrite = 0;
    const markActive = () => {
      const now = Date.now();
      lastActiveRef.current = now;
      if (warnedRef.current) {
        warnedRef.current = false;
        toast.dismiss('idle-warning');
      }
      if (now - lastWrite > 15000) {
        lastWrite = now;
        writeJson(sessionStorage, SESSION_KEY, { ...session, lastActiveAt: now });
      }
    };
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, markActive, { passive: true }));
    const tick = window.setInterval(() => {
      const idle = Date.now() - lastActiveRef.current;
      if (idle >= IDLE_TIMEOUT_MS) {
        signOut('timeout');
      } else if (idle >= IDLE_WARNING_MS && !warnedRef.current) {
        warnedRef.current = true;
        toast.warning('You will be signed out soon', {
          id: 'idle-warning',
          description: 'No activity for 13 minutes. Tap anywhere to stay signed in.',
          duration: Infinity,
        });
      }
    }, 15000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, markActive));
      window.clearInterval(tick);
    };
  }, [session, signOut]);

  const value = useMemo<AuthStore>(
    () => ({ session, notice, clearNotice, signIn, signOut, lockoutRemaining }),
    [session, notice, clearNotice, signIn, signOut, lockoutRemaining],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthStore {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
