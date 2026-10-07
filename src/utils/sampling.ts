import { TIMEPOINTS, type TimepointDef } from '../data/timepoints';
import { isValidTime } from './dates';
import type { M5Data, TimepointEntry } from '../types/crf';

export const IMAGE_ID_PATTERN = /^\d{4}$/;

export function imagePrefix(kind: 'BL' | 'PL', hours: number): string {
  return `IMG-${kind}-${String(hours).padStart(2, '0')}-`;
}

export function isTimepointComplete(def: TimepointDef, e: TimepointEntry): boolean {
  if (!isValidTime(e.actual)) return false;
  const saliva = e.salivaSwab && e.salivaPaper;
  if (def.salivaOnly) return saliva;
  return (
    saliva &&
    e.blood &&
    IMAGE_ID_PATTERN.test(e.bloodImg) &&
    e.plasma &&
    IMAGE_ID_PATTERN.test(e.plasmaImg) &&
    e.stabilizer
  );
}

export interface SampleCounters {
  blood: number;
  bloodTotal: number;
  saliva: number;
  salivaTotal: number;
  images: number;
  imagesTotal: number;
  complete: number;
  total: number;
}

export function sampleCounters(m5: M5Data): SampleCounters {
  const bloodTps = TIMEPOINTS.filter((tp) => !tp.salivaOnly);
  let blood = 0;
  let saliva = 0;
  let images = 0;
  let complete = 0;
  TIMEPOINTS.forEach((tp) => {
    const e = m5.timepoints[tp.key];
    if (!e) return;
    if (e.salivaSwab && e.salivaPaper) saliva++;
    if (!tp.salivaOnly) {
      if (e.blood) blood++;
      if (IMAGE_ID_PATTERN.test(e.bloodImg)) images++;
      if (IMAGE_ID_PATTERN.test(e.plasmaImg)) images++;
    }
    if (isTimepointComplete(tp, e)) complete++;
  });
  return {
    blood,
    bloodTotal: bloodTps.length,
    saliva,
    salivaTotal: TIMEPOINTS.length,
    images,
    imagesTotal: bloodTps.length * 2,
    complete,
    total: TIMEPOINTS.length,
  };
}
