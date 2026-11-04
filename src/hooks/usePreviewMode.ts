import { useSyncExternalStore } from 'react';
import { PREVIEW_MODE } from '../data/previewMode';

/*
 * Demo mode, switched on from System control: every module is shown open for everyone and Previous / Next steps
 * through all ten, so the whole form can be shown in a demonstration. It only changes what is shown: what can be
 * filled in, saved and locked stays exactly as normal (the server is not told about it). The site banner fetches the
 * switch every minute and calls setDemoMode.
 */
let demoOn = false;
const listeners = new Set<() => void>();

export function setDemoMode(on: boolean) {
  if (demoOn === on) return;
  demoOn = on;
  listeners.forEach((fn) => fn());
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

/** True in demo mode, or in a build with preview mode on. */
export function usePreviewMode(): boolean {
  const demo = useSyncExternalStore(subscribe, () => demoOn, () => false);
  return PREVIEW_MODE || demo;
}
