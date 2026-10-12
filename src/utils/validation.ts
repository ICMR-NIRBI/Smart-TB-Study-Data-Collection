import { EXCLUSION_CRITERIA, INCLUSION_CRITERIA } from '../data/criteria';
import { DRUGS } from '../data/drugs';
import { TIMEPOINTS } from '../data/timepoints';
import { MEALS } from '../data/timepoints';
import { ageInYears, isValidTime } from './dates';
import { isIneligible } from './gating';
import { IMAGE_ID_PATTERN, isTimepointComplete } from './sampling';
import { toNum } from './clinical';
import type { ModuleId, Participant } from '../types/crf';

export type Errors = Record<string, string>;
const REQUIRED = 'Required';

function need(e: Errors, key: string, v: string | boolean, msg = REQUIRED) {
  if (v === '' || v === false) e[key] = msg;
}

function needNumber(e: Errors, key: string, v: string, range?: [number, number], unit = '') {
  if (v.trim() === '') {
    e[key] = REQUIRED;
    return;
  }
  const n = toNum(v);
  if (n === null) {
    e[key] = 'Enter a valid number';
    return;
  }
  if (range && (n < range[0] || n > range[1])) e[key] = `Expected ${range[0]}–${range[1]}${unit ? ` ${unit}` : ''}`;
}

function needTime(e: Errors, key: string, v: string) {
  if (!v) e[key] = REQUIRED;
  else if (!isValidTime(v)) e[key] = 'Use 24-h HH:MM';
}

export function hasErrorIn(errors: Errors, keys: string[]): boolean {
  const all = Object.keys(errors);
  return keys.some((k) => all.some((e) => e === k || e.startsWith(`${k}.`)));
}

function v1(p: Participant): Errors {
  const d = p.data.m1;
  const e: Errors = {};
  if (!/^SMART-TB-\d{3}-\d{3}$/.test(d.participantId)) e.participantId = d.participantId ? 'Use format SMART-TB-###-###' : REQUIRED;
  need(e, 'screeningDate', d.screeningDate);
  need(e, 'dob', d.dob);
  const age = ageInYears(d.dob, d.screeningDate);
  if (age !== null) {
    if (age < 0) e.dob = 'Date of birth must be before screening';
    else if (age < 18) e.age = 'Participant must be ≥18 years at screening';
  }
  need(e, 'gender', d.gender);
  need(e, 'ethnicity', d.ethnicity.trim());
  if (!d.phone.trim()) e.phone = REQUIRED;
  else if (d.phone.replace(/\D/g, '').length < 10) e.phone = 'Enter a 10-digit phone number';
  need(e, 'address', d.address.trim());
  return e;
}

function v2(p: Participant): Errors {
  const d = p.data.m2;
  const e: Errors = {};
  INCLUSION_CRITERIA.forEach((c) => need(e, `inc.${c.key}`, d.inclusion[c.key] ?? '', 'Answer Yes or No'));
  EXCLUSION_CRITERIA.forEach((c) => need(e, `exc.${c.key}`, d.exclusion[c.key] ?? '', 'Answer Yes or No'));
  need(e, 'investigatorName', d.investigatorName.trim());
  need(e, 'signDate', d.signDate ?? '');
  return e;
}

function v3(p: Participant): Errors {
  const d = p.data.m3;
  const e: Errors = {};
  needNumber(e, 'height', d.height, [100, 230], 'cm');
  needNumber(e, 'weight', d.weight, [20, 200], 'kg');
  needNumber(e, 'hr', d.hr, [30, 200], 'bpm');
  needNumber(e, 'sbp', d.sbp, [60, 250], 'mmHg');
  needNumber(e, 'dbp', d.dbp, [30, 150], 'mmHg');
  if (!e.sbp && !e.dbp && Number(d.dbp) >= Number(d.sbp)) e.dbp = 'Diastolic must be lower than systolic';
  need(e, 'jaundice', d.jaundice);
  needNumber(e, 'hb', d.hb, [2, 22], 'g/dL');
  needNumber(e, 'tlc', d.tlc, [500, 100000]);
  needNumber(e, 'platelets', d.platelets, [5000, 1500000]);
  needNumber(e, 'tbil', d.tbil, [0, 40], 'mg/dL');
  needNumber(e, 'dbil', d.dbil, [0, 30], 'mg/dL');
  if (!e.tbil && !e.dbil && Number(d.dbil) > Number(d.tbil)) e.dbil = 'Cannot exceed total bilirubin';
  needNumber(e, 'ast', d.ast, [0, 5000], 'U/L');
  needNumber(e, 'alt', d.alt, [0, 5000], 'U/L');
  needNumber(e, 'alp', d.alp, [0, 3000], 'U/L');
  needNumber(e, 'creatinine', d.creatinine, [0.1, 20], 'mg/dL');
  needNumber(e, 'urea', d.urea, [1, 400], 'mg/dL');
  if (!d.fbs.trim() && !d.rbs.trim()) e.fbs = 'Enter FBS or RBS';
  if (d.fbs.trim()) needNumber(e, 'fbs', d.fbs, [20, 700], 'mg/dL');
  if (d.rbs.trim()) needNumber(e, 'rbs', d.rbs, [20, 900], 'mg/dL');
  needNumber(e, 'hba1c', d.hba1c, [3, 20], '%');
  need(e, 'diabetes', d.diabetes);
  need(e, 'smear', d.smear);
  need(e, 'mtbDetected', d.mtbDetected);
  need(e, 'rifResistance', d.rifResistance);
  if (d.rifResistance === 'detected') e.rifResistance = 'Rifampicin resistance detected — participant is ineligible';
  (['micR', 'micH', 'micZ', 'micE'] as const).forEach((k) => {
    needNumber(e, k, d[k]);
    if (!e[k] && Number(d[k]) <= 0) e[k] = 'Must be greater than 0';
  });
  return e;
}

function v4(p: Participant): Errors {
  const d = p.data.m4;
  const e: Errors = {};
  need(e, 'startDate', d.startDate);
  if (d.startDate && p.data.m1.screeningDate && d.startDate < p.data.m1.screeningDate) e.startDate = 'Cannot be before screening date';
  need(e, 'weightBand', d.weightBand);
  (['doseR', 'doseH', 'doseZ', 'doseE'] as const).forEach((k) => needNumber(e, k, d[k], [1, 3000], 'mg'));
  need(e, 'revisitDate', d.revisitDate);
  if (d.revisitDate && d.startDate && d.revisitDate <= d.startDate) e.revisitDate = 'Must be after treatment start';
  need(e, 'missedDoses', d.missedDoses);
  if (d.missedDoses === 'missed') {
    needNumber(e, 'daysMissed', d.daysMissed, [1, 9], 'days');
    needNumber(e, 'consecutiveDays', d.consecutiveDays, [0, 14], 'days');
    if (!e.consecutiveDays && Number(d.consecutiveDays) < 7) {
      e.consecutiveDays = 'At least 7 consecutive dosing days are required before PK sampling';
    }
  }
  need(e, 'toxicity', d.toxicity);
  if (d.toxicity === 'present') e.toxicity = 'Toxicity present — PK sampling is halted';
  need(e, 'admitted', d.admitted);
  if (d.admitted === 'no') e.admitted = 'Participant must be admitted the evening before sampling';
  needTime(e, 'dinnerTime', d.dinnerTime);
  return e;
}

function v5(p: Participant): Errors {
  const d = p.data.m5;
  const e: Errors = {};
  need(e, 'samplingDate', d.samplingDate);
  needTime(e, 't0', d.t0);
  need(e, 'fastingConfirmed', d.fastingConfirmed);
  if (d.fastingConfirmed === 'no') e.fastingConfirmed = 'Fasting ≥8 h is required before dosing';
  MEALS.forEach((m) => needTime(e, m.key, d[m.key]));
  TIMEPOINTS.forEach((tp) => {
    const entry = d.timepoints[tp.key];
    if (!entry) return;
    if (entry.bloodImg && !IMAGE_ID_PATTERN.test(entry.bloodImg)) e[`tp.${tp.key}.bloodImg`] = 'Enter 4 digits';
    if (entry.plasmaImg && !IMAGE_ID_PATTERN.test(entry.plasmaImg)) e[`tp.${tp.key}.plasmaImg`] = 'Enter 4 digits';
    if (entry.actual && !isValidTime(entry.actual)) e[`tp.${tp.key}.actual`] = 'Use 24-h HH:MM';
    if (!isTimepointComplete(tp, entry) && !entry.comments.trim()) {
      e[`tp.${tp.key}`] = 'Incomplete — finish the checklist or record a deviation';
    }
  });
  need(e, 'signerName', d.signerName.trim());
  need(e, 'signDate', d.signDate ?? '');
  return e;
}

function v6(p: Participant): Errors {
  const d = p.data.m6;
  const e: Errors = {};
  DRUGS.forEach((drug) => {
    let missing = 0;
    TIMEPOINTS.forEach((tp) => {
      const entry = d.conc[drug.key][tp.key];
      if (!tp.salivaOnly && toNum(entry.plasma) === null) {
        e[`conc.${drug.key}.${tp.key}`] = REQUIRED;
        missing++;
      }
      if (entry.saliva.trim() && toNum(entry.saliva) === null) e[`conc.${drug.key}.${tp.key}.saliva`] = 'Invalid';
    });
    if (missing > 0) e[`drug.${drug.key}`] = `${missing} plasma value${missing === 1 ? '' : 's'} missing`;
    need(e, `pkFailure.${drug.key}`, d.pkFailure[drug.key]);
  });
  need(e, 'scientistName', d.scientistName.trim());
  need(e, 'signDate', d.signDate ?? '');
  return e;
}

function v7(p: Participant): Errors {
  const d = p.data.m7;
  const e: Errors = {};
  need(e, 'visitDate', d.visitDate);
  needNumber(e, 'dosesDispensed', d.dosesDispensed, [1, 120]);
  needNumber(e, 'blistersReturned', d.blistersReturned, [0, 120]);
  if (!e.dosesDispensed && !e.blistersReturned && Number(d.blistersReturned) > Number(d.dosesDispensed)) {
    e.blistersReturned = 'Cannot exceed doses dispensed';
  }
  need(e, 'cough', d.cough);
  need(e, 'fever', d.fever);
  needNumber(e, 'weight', d.weight, [20, 200], 'kg');
  need(e, 'adr', d.adr);
  return e;
}

function v8(p: Participant): Errors {
  const d = p.data.m8;
  const e: Errors = {};
  need(e, 'evalDate', d.evalDate);
  needNumber(e, 'cumulativeCompliance', d.cumulativeCompliance, [0, 100], '%');
  need(e, 'smear', d.smear);
  if (d.smear === 'positive') need(e, 'smearGrade', d.smearGrade);
  need(e, 'culture', d.culture);
  need(e, 'outcome', d.outcome);
  if (d.outcome === 'failure') {
    need(e, 'lpaPerformed', d.lpaPerformed);
    if (d.lpaPerformed === 'yes') {
      need(e, 'lpaDate', d.lpaDate);
      need(e, 'labName', d.labName.trim());
      need(e, 'rifMutation', d.rifMutation);
      if (d.rifMutation === 'detected') need(e, 'rifMutationText', d.rifMutationText.trim());
      need(e, 'inhMutation', d.inhMutation);
      if (d.inhMutation === 'detected') need(e, 'inhMutationText', d.inhMutationText.trim());
    }
    need(e, 'dstAvailable', d.dstAvailable);
    if (d.dstAvailable === 'yes') (['dstR', 'dstH', 'dstZ', 'dstE'] as const).forEach((k) => need(e, k, d[k]));
  }
  return e;
}

function v9(p: Participant): Errors {
  const d = p.data.m9;
  const e: Errors = {};
  if (d.noEvents && d.events.length > 0) e.events = 'Remove the listed events or untick "No adverse events"';
  if (!d.noEvents && d.events.length === 0) e.events = 'Add an adverse event or confirm there are none';
  d.events.forEach((ev) => {
    const k = `ae.${ev.id}`;
    need(e, `${k}.term`, ev.term.trim());
    need(e, `${k}.startDate`, ev.startDate);
    if (!ev.ongoing) {
      need(e, `${k}.stopDate`, ev.stopDate, 'Enter stop date or mark ongoing');
      if (ev.stopDate && ev.startDate && ev.stopDate < ev.startDate) e[`${k}.stopDate`] = 'Cannot be before start date';
    }
    need(e, `${k}.grade`, ev.grade);
    need(e, `${k}.relationship`, ev.relationship);
    need(e, `${k}.sae`, ev.sae);
    need(e, `${k}.action`, ev.action);
    need(e, `${k}.outcome`, ev.outcome);
  });
  return e;
}

function v10(p: Participant): Errors {
  const d = p.data.m10;
  const e: Errors = {};
  need(e, 'date', d.date);
  need(e, 'status', d.status);
  if (d.status === 'completed' && !p.meta[8].completed) e.status = 'Module 8 must be completed first';
  if (d.status === 'discontinued') need(e, 'reason', d.reason, 'Select a reason');
  if (isIneligible(p) && d.reason !== 'screen_failure') e.reason = 'Screen failure is required for ineligible participants';
  if (d.reason === 'death' && !p.data.m9.events.some((ev) => ev.sae === 'yes')) {
    e.reason = 'Death requires an SAE documented in Module 9';
  }
  need(e, 'attest', d.attest, 'PI attestation is required');
  need(e, 'piName', d.piName.trim());
  need(e, 'signDate', d.signDate ?? '');
  return e;
}

const VALIDATORS: Record<ModuleId, (p: Participant) => Errors> = {
  1: v1, 2: v2, 3: v3, 4: v4, 5: v5, 6: v6, 7: v7, 8: v8, 9: v9, 10: v10,
};

export function validateModule(id: ModuleId, p: Participant): Errors {
  return VALIDATORS[id](p);
}
