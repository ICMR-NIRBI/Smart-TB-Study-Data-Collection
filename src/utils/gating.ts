import { MODULES, type ModuleDef } from '../data/modules';
import { PREVIEW_MODE } from '../data/previewMode';
import { VISIT_WINDOWS } from '../data/visitWindows';
import { evaluateEligibility } from './clinical';
import { addDays, todayISO } from './dates';
import type { ModuleAccess, ModuleId, Participant, ParticipantStatus } from '../types/crf';

const SEQUENTIAL: ModuleId[] = [1, 2, 3, 4, 5, 6, 7, 8];

export function getModuleDef(id: ModuleId): ModuleDef {
  return MODULES.find((m) => m.id === id) ?? MODULES[0];
}

export function isIneligible(p: Participant): boolean {
  return p.meta[2].completed && evaluateEligibility(p.data.m2).eligible === false;
}

export function isRecordLocked(p: Participant): boolean {
  return p.meta[10].completed;
}

export function getCurrentModule(p: Participant): ModuleId {
  if (p.meta[10].completed) return 10;
  if (isIneligible(p) || p.discontinuationRequested) return 10;
  const next = SEQUENTIAL.find((id) => !p.meta[id].completed);
  return next ?? 10;
}

/** Access ignoring preview mode — what the server enforces when a module is locked. */
export function strictAccess(p: Participant, id: ModuleId): ModuleAccess {
  if (p.meta[id].completed) return 'complete';
  if (isRecordLocked(p)) return 'locked';
  if (id === 9) return isIneligible(p) ? 'locked' : 'open';
  return getCurrentModule(p) === id ? 'current' : 'locked';
}

/** True when a module is only reachable because preview mode lifted its lock (it can be viewed, not locked). */
export function isPreviewOnly(p: Participant, id: ModuleId): boolean {
  return PREVIEW_MODE && strictAccess(p, id) === 'locked';
}

export function getAccess(p: Participant, id: ModuleId): ModuleAccess {
  const access = strictAccess(p, id);
  return PREVIEW_MODE && access === 'locked' ? 'open' : access;
}

export function getStatus(p: Participant): ParticipantStatus {
  if (isIneligible(p)) return 'ineligible';
  if (p.meta[10].completed) {
    if (p.data.m10.reason === 'screen_failure') return 'ineligible';
    return p.data.m10.status === 'completed' ? 'completed' : 'discontinued';
  }
  if (p.discontinuationRequested) return 'discontinued';
  return 'in_progress';
}

export function completedCount(p: Participant): number {
  return Object.values(p.meta).filter((m) => m.completed).length;
}

export function lockReason(p: Participant, id: ModuleId): string {
  if (isRecordLocked(p)) return 'Record closed';
  if (isIneligible(p) && id >= 3 && id <= 9) return 'Locked — screen failure';
  if (p.discontinuationRequested && id !== 10) return 'Locked — discontinued';
  return `Complete Module ${getCurrentModule(p)} first`;
}

export interface VisitWindow {
  key: string;
  label: string;
  fromDay: number;
  toDay: number;
  from: string;
  to: string;
  state: 'upcoming' | 'open' | 'past';
}

export function getVisitWindows(startDate: string): VisitWindow[] {
  if (!startDate) return [];
  const today = todayISO();
  return VISIT_WINDOWS.map((w) => {
    const from = addDays(startDate, w.fromDay);
    const to = addDays(startDate, w.toDay);
    const state = today < from ? 'upcoming' : today > to ? 'past' : 'open';
    return { ...w, from, to, state };
  });
}
