'use client';

import { useEffect } from 'react';

/**
 * Sends errors that happen in a staff member's browser (a crash on a particular phone, say) to the server, so they
 * appear under Errors on System control. Each distinct message is sent once per page load, at most 10 per load.
 */
export function ErrorReporter() {
  useEffect(() => {
    const sent = new Set<string>();
    const report = (message: string, where: string) => {
      const text = message.slice(0, 300);
      if (!text || sent.has(text) || sent.size >= 10) return;
      sent.add(text);
      try {
        void fetch('/api/client-error', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, where: where.slice(0, 160), page: window.location.pathname }),
          keepalive: true,
          credentials: 'same-origin',
        }).catch(() => {});
      } catch {
        /* never let reporting cause an error of its own */
      }
    };
    const onError = (e: ErrorEvent) => {
      // Errors from scripts on other sites (browser extensions) carry no useful detail.
      if (!e.message || e.message === 'Script error.') return;
      const file = (e.filename || '').split('/').pop() ?? '';
      report(e.message, file ? `${file}:${e.lineno}` : '');
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason as { message?: string; name?: string } | string | undefined;
      const message = typeof r === 'string' ? r : r?.message ? `${r.name ?? 'Error'}: ${r.message}` : '';
      // Network hiccups and expected answers from the server are not crashes.
      if (!message || /Failed to fetch|NetworkError|Load failed|AbortError/i.test(message)) return;
      report(message, 'unhandled promise');
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);
  return null;
}
