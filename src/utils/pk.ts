import { TIMEPOINTS } from '../data/timepoints';
import { toNum } from './clinical';
import type { ConcEntry } from '../types/crf';

export interface ConcPoint {
  t: number;
  c: number;
}

export interface PkSummary {
  cmax: number | null;
  tmax: number | null;
  auc: number | null;
  mic: number | null;
  cmaxMic: number | null;
  aucMic: number | null;
  tAboveMic: number | null;
  points: number;
}

export function concentrationPoints(entries: Record<string, ConcEntry>, matrix: 'plasma' | 'saliva'): ConcPoint[] {
  return TIMEPOINTS.filter((tp) => matrix === 'saliva' || !tp.salivaOnly)
    .map((tp) => ({ t: tp.hours, c: toNum(entries[tp.key]?.[matrix]) }))
    .filter((p): p is ConcPoint => p.c !== null);
}

function timeAboveSegment(a: ConcPoint, b: ConcPoint, mic: number): number {
  const dt = b.t - a.t;
  if (dt <= 0) return 0;
  const aAbove = a.c > mic;
  const bAbove = b.c > mic;
  if (aAbove && bAbove) return dt;
  if (!aAbove && !bAbove) return 0;
  const tCross = a.t + ((mic - a.c) * dt) / (b.c - a.c);
  return aAbove ? tCross - a.t : b.t - tCross;
}

/** Non-compartmental PK: Cmax, Tmax, AUC0–24 (linear trapezoidal) and MIC-based indices. */
export function computePk(points: ConcPoint[], mic: number | null): PkSummary {
  const pts = points.filter((p) => p.t <= 24).sort((a, b) => a.t - b.t);
  const validMic = mic !== null && mic > 0 ? mic : null;
  if (pts.length === 0) {
    return { cmax: null, tmax: null, auc: null, mic: validMic, cmaxMic: null, aucMic: null, tAboveMic: null, points: 0 };
  }
  let cmax = -Infinity;
  let tmax = 0;
  pts.forEach((p) => {
    if (p.c > cmax) {
      cmax = p.c;
      tmax = p.t;
    }
  });
  let auc = 0;
  let tAbove = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    auc += ((a.c + b.c) / 2) * (b.t - a.t);
    if (validMic !== null) tAbove += timeAboveSegment(a, b, validMic);
  }
  const hasAuc = pts.length >= 2;
  return {
    cmax,
    tmax,
    auc: hasAuc ? auc : null,
    mic: validMic,
    cmaxMic: validMic ? cmax / validMic : null,
    aucMic: validMic && hasAuc ? auc / validMic : null,
    tAboveMic: validMic && hasAuc ? tAbove : null,
    points: pts.length,
  };
}
