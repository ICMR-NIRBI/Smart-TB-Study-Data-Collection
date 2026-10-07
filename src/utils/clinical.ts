import { EXCLUSION_CRITERIA, INCLUSION_CRITERIA, type Criterion } from '../data/criteria';
import { timeToMinutes } from './dates';
import type { Gender, M2Data, M3Data, WeightBand } from '../types/crf';

export function toNum(v: string | undefined): number | null {
  if (v === undefined || v === null || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function fmt(n: number | null, digits = 1): string {
  return n === null || !Number.isFinite(n) ? '—' : n.toFixed(digits);
}

export function calcBmi(heightCm: string, weightKg: string): number | null {
  const h = toNum(heightCm);
  const w = toNum(weightKg);
  if (!h || !w) return null;
  const m = h / 100;
  return w / (m * m);
}

/** Janmahasatian fat-free mass (kg). */
export function calcFfm(weightKg: string, bmi: number | null, gender: Gender): number | null {
  const w = toNum(weightKg);
  if (!w || !bmi) return null;
  if (gender === 'male') return (9270 * w) / (6680 + 216 * bmi);
  if (gender === 'female') return (9270 * w) / (8780 + 244 * bmi);
  return null;
}

export function calcCompliance(dispensed: string, returned: string): number | null {
  const d = toNum(dispensed);
  const r = toNum(returned);
  if (!d || r === null) return null;
  return (r / d) * 100;
}

export function suggestWeightBand(weight: string): WeightBand {
  const w = toNum(weight);
  if (w === null) return '';
  if (w < 35) return '25-34';
  if (w < 50) return '35-49';
  if (w < 65) return '50-64';
  if (w <= 75) return '65-75';
  return '>75';
}

export function fastingHours(dinner: string, t0: string): number | null {
  const d = timeToMinutes(dinner);
  const t = timeToMinutes(t0);
  if (d === null || t === null) return null;
  let diff = t - d;
  if (diff <= 0) diff += 1440;
  return diff / 60;
}

export interface EligibilityResult {
  eligible: boolean | null;
  answered: number;
  total: number;
  failedInclusion: Criterion[];
  positiveExclusion: Criterion[];
}

export function evaluateEligibility(m2: M2Data): EligibilityResult {
  const failedInclusion = INCLUSION_CRITERIA.filter((c) => m2.inclusion[c.key] === 'no');
  const positiveExclusion = EXCLUSION_CRITERIA.filter((c) => m2.exclusion[c.key] === 'yes');
  const total = INCLUSION_CRITERIA.length + EXCLUSION_CRITERIA.length;
  const answered =
    INCLUSION_CRITERIA.filter((c) => m2.inclusion[c.key]).length +
    EXCLUSION_CRITERIA.filter((c) => m2.exclusion[c.key]).length;
  const anyFail = failedInclusion.length > 0 || positiveExclusion.length > 0;
  const eligible = anyFail ? false : answered === total ? true : null;
  return { eligible, answered, total, failedInclusion, positiveExclusion };
}

const AST_ALT_LIMIT = 120; // 3 × ULN (40 U/L)
const TBIL_LIMIT = 2.4; // 2 × ULN (1.2 mg/dL)
const CREAT_LIMIT = 2.0;

export function labWarnings(m3: M3Data): Record<string, string> {
  const w: Record<string, string> = {};
  const ast = toNum(m3.ast);
  const alt = toNum(m3.alt);
  const tbil = toNum(m3.tbil);
  const creat = toNum(m3.creatinine);
  const hba1c = toNum(m3.hba1c);
  const plt = toNum(m3.platelets);
  const hb = toNum(m3.hb);
  if (ast !== null && ast > AST_ALT_LIMIT) w.ast = `>3× ULN (${AST_ALT_LIMIT} U/L) — meets hepatic exclusion threshold`;
  if (alt !== null && alt > AST_ALT_LIMIT) w.alt = `>3× ULN (${AST_ALT_LIMIT} U/L) — meets hepatic exclusion threshold`;
  if (tbil !== null && tbil > TBIL_LIMIT) w.tbil = `>2× ULN (${TBIL_LIMIT} mg/dL) — meets hepatic exclusion threshold`;
  if (creat !== null && creat > CREAT_LIMIT) w.creatinine = 'Creatinine >2.0 mg/dL — meets renal exclusion threshold';
  if (hb !== null && hb < 8) w.hb = 'Severe anaemia (<8 g/dL) — review with investigator';
  if (plt !== null && plt < 100000) w.platelets = 'Thrombocytopenia (<1,00,000 /cu mm)';
  if (hba1c !== null && hba1c >= 6.5 && m3.diabetes !== 'yes') w.diabetes = 'HbA1c ≥6.5% suggests diabetes — confirm co-morbidity';
  return w;
}
