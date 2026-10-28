'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api, ApiRequestError, UNAUTHORIZED_EVENT } from '../utils/api';
import { LoadingScreen } from '../components/auth/LoadingScreen';
import type { Actor, RoleKey } from '../data/roles';
import type { ModuleId, StaffUser } from '../types/crf';

export const IDLE_TIMEOUT_MIN = 15;
const IDLE_TIMEOUT_MS = IDLE_TIMEOUT_MIN * 60 * 1000;
const IDLE_WARNING_MS = (IDLE_TIMEOUT_MIN - 2) * 60 * 1000;
/** While someone is active on the page, refresh the server session at most this often. */
const KEEPALIVE_MS = 60 * 1000;
/** How long the loading screen stays up when someone signs in or signs out. */
export const AUTH_TRANSITION_MS = 6 * 1000;

export type AuthTransition = 'signing_in' | 'signing_out' | null;

export type AuthNotice = 'signed_out' | 'timeout' | null;

export interface Session {
  email: string;
  user: StaffUser;
  actor: Actor;
  /** Signed in with a temporary password: only choosing a new one is allowed. */
  mustChangePassword: boolean;
}

export type SignInResult = { ok: true } | { ok: false; error: string; locked?: boolean };

interface AuthStore {
  session: Session | null;
  /** True until the server has said whether a session exists. */
  loading: boolean;
  /** Set while the sign-in or sign-out loading screen is showing. */
  transition: AuthTransition;
  notice: AuthNotice;
  clearNotice: () => void;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  /** Testing phase only: sign in to a test account without a password. */
  signInAsTest: (email: string) => Promise<SignInResult>;
  signOut: (reason?: 'signed_out' | 'timeout') => void;
  /** Called once the server has accepted a new password. */
  passwordChanged: () => void;
  lockoutRemaining: (email: string) => number;
}

interface ServerUser {
  id: string;
  email: string;
  name: string;
  role: RoleKey;
  roleLabel: string;
  isAdmin: boolean;
  delegations: ModuleId[];
  entryModules: ModuleId[];
  mustChangePassword: boolean;
}

function toSession(u: ServerUser): Session {
  return {
    email: u.email,
    user: { name: u.name, role: u.roleLabel },
    actor: { role: u.role, entryModules: u.entryModules, isAdmin: u.isAdmin, delegations: u.delegations },
    mustChangePassword: u.mustChangePassword,
  };
}

const AuthContext = createContext<AuthStore | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<AuthNotice>(null);
  const [lockouts, setLockouts] = useState<Record<string, number>>({});
  const [transition, setTransition] = useState<AuthTransition>(null);
  const transitionRef = useRef<AuthTransition>(null);
  const transitionTimer = useRef<number | null>(null);
  const lastActiveRef = useRef<number>(Date.now());
  const warnedRef = useRef(false);

  /** Shows the loading screen for AUTH_TRANSITION_MS, then runs `then`. */
  const hold = useCallback((kind: Exclude<AuthTransition, null>, then?: () => void) => {
    if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current);
    transitionRef.current = kind;
    setTransition(kind);
    transitionTimer.current = window.setTimeout(() => {
      transitionTimer.current = null;
      then?.();
      transitionRef.current = null;
      setTransition(null);
    }, AUTH_TRANSITION_MS);
  }, []);

  useEffect(
    () => () => {
      if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current);
    },
    [],
  );

  useEffect(() => {
    api<{ user: ServerUser | null }>('/api/auth/session')
      .then(({ user }) => setSession(user ? toSession(user) : null))
      .catch(() => setSession(null))
      .finally(() => setLoading(false));
  }, []);

  const endLocally = useCallback((reason: 'signed_out' | 'timeout') => {
    warnedRef.current = false;
    toast.dismiss('idle-warning');
    setSession(null);
    setNotice(reason);
  }, []);

  const signOut = useCallback(
    (reason: 'signed_out' | 'timeout' = 'signed_out') => {
      // The server session ends straight away; the loading screen covers the app until the hold is over.
      api('/api/auth/logout', { method: 'POST' }).catch(() => {});
      if (reason === 'signed_out') hold('signing_out', () => endLocally('signed_out'));
      else endLocally(reason);
    },
    [endLocally, hold],
  );

  // Any API call that finds the server session gone sends the user back to the login page.
  useEffect(() => {
    const onUnauthorized = () => {
      if (transitionRef.current !== 'signing_out') endLocally('timeout');
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [endLocally]);

  const clearNotice = useCallback(() => setNotice(null), []);

  const passwordChanged = useCallback(() => setSession((s) => (s ? { ...s, mustChangePassword: false } : s)), []);

  const lockoutRemaining = useCallback(
    (email: string) => Math.max(0, (lockouts[email.trim().toLowerCase()] ?? 0) - Date.now()),
    [lockouts],
  );

  /** Shared by both sign-in routes once the server has accepted the user. */
  const begin = useCallback(
    (user: ServerUser): SignInResult => {
      lastActiveRef.current = Date.now();
      warnedRef.current = false;
      setNotice(null);
      setSession(toSession(user));
      hold('signing_in');
      return { ok: true };
    },
    [hold],
  );

  const signIn = useCallback(async (emailRaw: string, password: string): Promise<SignInResult> => {
    const email = emailRaw.trim().toLowerCase();
    try {
      const { user } = await api<{ user: ServerUser }>('/api/auth/login', { method: 'POST', body: { email, password } });
      return begin(user);
    } catch (err) {
      if (!(err instanceof ApiRequestError)) return { ok: false, error: 'Sign-in failed. Please try again.' };
      if (err.status === 429) {
        setLockouts((l) => ({ ...l, [email]: Date.now() + 5 * 60 * 1000 }));
        return { ok: false, locked: true, error: err.message };
      }
      return { ok: false, error: err.message };
    }
  }, [begin]);

  const signInAsTest = useCallback(async (email: string): Promise<SignInResult> => {
    try {
      const { user } = await api<{ user: ServerUser }>('/api/auth/test-accounts', { method: 'POST', body: { email } });
      return begin(user);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Sign-in failed. Please try again.' };
    }
  }, [begin]);

  // Idle timeout: warn 2 minutes before, sign out at 15 minutes of inactivity. The server enforces the same limit.
  useEffect(() => {
    if (!session) return;
    let lastPing = Date.now();
    const markActive = () => {
      const now = Date.now();
      lastActiveRef.current = now;
      if (warnedRef.current) {
        warnedRef.current = false;
        toast.dismiss('idle-warning');
      }
      if (now - lastPing > KEEPALIVE_MS) {
        lastPing = now;
        api<{ user: ServerUser | null }>('/api/auth/session')
          .then(({ user }) => {
            if (!user) endLocally('timeout');
          })
          .catch(() => {});
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
  }, [session, signOut, endLocally]);

  const value = useMemo<AuthStore>(
    () => ({ session, loading, transition, notice, clearNotice, signIn, signInAsTest, signOut, passwordChanged, lockoutRemaining }),
    [session, loading, transition, notice, clearNotice, signIn, signInAsTest, signOut, passwordChanged, lockoutRemaining],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      {transition && <LoadingScreen message={transition === 'signing_in' ? 'Signing you in…' : 'Signing you out…'} />}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthStore {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
