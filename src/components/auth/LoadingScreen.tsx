import React from 'react';
import { HERO_FALLBACK } from '../../data/assets';

interface LoadingScreenProps {
  /** What is happening, e.g. "Signing you in…" — read out by screen readers only. */
  message?: string;
}

/** Full-screen loader shown when signing in and out and while the app gets ready: just the spinner. */
export function LoadingScreen({ message = 'Loading…' }: LoadingScreenProps) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{ background: HERO_FALLBACK }}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="absolute inset-0 bg-gradient-to-b from-forest-950/70 via-forest-950/40 to-forest-950/80" aria-hidden="true" />
      <div className="spinner relative" aria-hidden="true" />
      <span className="sr-only">{message}</span>
    </div>
  );
}
