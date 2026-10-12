import { EXCLUSION_CRITERIA, INCLUSION_CRITERIA } from './criteria';
import { TIMEPOINTS } from './timepoints';
import { STAFF } from './staff';
import { emptyCrf, emptyMetaMap, emptyTimepoint } from '../utils/participant';
import { minutesToTime, timeToMinutes } from '../utils/dates';
import type {
  ConcEntry,
  CrfData,
  DrugKey,
  ModuleId,
  ModuleMeta,
  Participant,
  StaffUser,
  TimepointEntry,
  YesNo,
} from '../types/crf';

function done(by: StaffUser, at: string): ModuleMeta {
  return { completed: true, completedBy: by.name, completedRole: by.role, completedAt: at, editing: false, draftSavedAt: '', edits: [] };
}

function metaWith(entries: Partial<Record<ModuleId, ModuleMeta>>): Record<ModuleId, ModuleMeta> {
  const map = emptyMetaMap();
  (Object.keys(map) as unknown as ModuleId[]).forEach((key) => {
    const id = Number(key) as ModuleId;
    const entry = entries[id];
    if (entry) map[id] = entry;
  });
  return map;
}

function screening(date: string, exclusionYes: string[] = []): CrfData['m2'] {
  return {
    inclusion: Object.fromEntries(INCLUSION_CRITERIA.map((c) => [c.key, 'yes'])) as Record<string, YesNo>,
    exclusion: Object.fromEntries(
      EXCLUSION_CRITERIA.map((c) => [c.key, exclusionYes.includes(c.key) ? 'yes' : 'no']),
    ) as Record<string, YesNo>,
    investigatorName: STAFF.demo.name,
    signDate: date,
  };
}

const BASE_M3: CrfData['m3'] = {
  height: '162', weight: '48', hr: '92', sbp: '112', dbp: '72', jaundice: 'no',
  hb: '10.8', tlc: '9800', platelets: '265000', tbil: '0.7', dbil: '0.2', ast: '32', alt: '28', alp: '96',
  creatinine: '0.8', urea: '22', fbs: '94', rbs: '118', hba1c: '5.6', diabetes: 'no',
  smear: '2+', mtbDetected: 'yes', rifResistance: 'not_detected', micR: '0.25', micH: '0.1', micZ: '25', micE: '2',
};

function sampled(t0: string, upToHours: number, deviations: Record<string, number> = {}, comments: Record<string, string> = {}): Record<string, TimepointEntry> {
  const base = timeToMinutes(t0) ?? 0;
  return Object.fromEntries(
    TIMEPOINTS.map((tp, i) => {
      if (tp.hours > upToHours) return [tp.key, emptyTimepoint()];
      const entry: TimepointEntry = {
        actual: minutesToTime(base + tp.hours * 60 + (deviations[tp.key] ?? 0)),
        blood: !tp.salivaOnly,
        bloodImg: tp.salivaOnly ? '' : String(4100 + i * 3),
        plasma: !tp.salivaOnly,
        plasmaImg: tp.salivaOnly ? '' : String(5200 + i * 3),
        salivaSwab: true,
        salivaPaper: true,
        stabilizer: !tp.salivaOnly,
        comments: comments[tp.key] ?? '',
      };
      return [tp.key, entry];
    }),
  );
}

const PK_MODEL: Record<DrugKey, { a: number; ka: number; ke: number; saliva: number }> = {
  R: { a: 18, ka: 1.4, ke: 0.28, saliva: 0.22 },
  H: { a: 6, ka: 2.5, ke: 0.35, saliva: 0.85 },
  Z: { a: 48, ka: 1.8, ke: 0.07, saliva: 0.9 },
  E: { a: 5, ka: 0.9, ke: 0.2, saliva: 0.35 },
};

function simulatedConc(): CrfData['m6']['conc'] {
  const out = {} as CrfData['m6']['conc'];
  (Object.keys(PK_MODEL) as DrugKey[]).forEach((d) => {
    const { a, ka, ke, saliva } = PK_MODEL[d];
    out[d] = Object.fromEntries(
      TIMEPOINTS.map((tp) => {
        const c = tp.hours === 0 ? 0 : a * (Math.exp(-ke * tp.hours) - Math.exp(-ka * tp.hours));
        const entry: ConcEntry = { plasma: tp.salivaOnly ? '' : c.toFixed(2), saliva: (c * saliva).toFixed(2) };
        return [tp.key, entry];
      }),
    );
  });
  return out;
}

function buildSeed(): Participant[] {
  // 1 — In progress, mid PK sampling (Module 5)
  const p1 = emptyCrf();
  p1.m1 = { participantId: 'SMART-TB-001-004', screeningDate: '2026-09-24', dob: '1987-03-14', gender: 'male', ethnicity: 'Bengali', phone: '98301 45672', address: 'Beliaghata, Kolkata East sub-district' };
  p1.m2 = screening('2026-09-24');
  p1.m3 = { ...BASE_M3, height: '168', weight: '52', hr: '88', smear: '3+' };
  p1.m4 = { startDate: '2026-09-26', weightBand: '50-64', doseR: '600', doseH: '300', doseZ: '1600', doseE: '1100', revisitDate: '2026-10-03', missedDoses: 'none', daysMissed: '', consecutiveDays: '', toxicity: 'absent', admitted: 'yes', dinnerTime: '20:30' };
  p1.m5 = { ...p1.m5, samplingDate: '2026-10-05', t0: '07:00', fastingConfirmed: 'yes', breakfastGiven: '09:30', timepoints: { ...sampled('07:00', 2), '3': { ...emptyTimepoint(), actual: '10:02', blood: true, bloodImg: '4109' } } };
  const m1 = metaWith({
    1: done(STAFF.test1, '2026-09-24T10:15:00'),
    2: done(STAFF.demo, '2026-09-24T11:40:00'),
    3: done(STAFF.test1, '2026-09-25T16:05:00'),
    4: done(STAFF.test1, '2026-10-03T12:20:00'),
  });
  m1[5] = { ...m1[5], draftSavedAt: '2026-10-05T10:04:00' };

  // 2 — In progress, next Month 1 follow-up (Module 7)
  const p2 = emptyCrf();
  p2.m1 = { participantId: 'SMART-TB-001-002', screeningDate: '2026-09-04', dob: '1979-11-02', gender: 'female', ethnicity: 'Bengali', phone: '90073 22841', address: 'Tiljala, Kolkata South-East sub-district' };
  p2.m2 = screening('2026-09-04');
  p2.m3 = { ...BASE_M3, height: '154', weight: '44', hb: '9.9', micE: '2.5' };
  p2.m4 = { startDate: '2026-09-06', weightBand: '35-49', doseR: '450', doseH: '225', doseZ: '1200', doseE: '825', revisitDate: '2026-09-13', missedDoses: 'none', daysMissed: '', consecutiveDays: '', toxicity: 'absent', admitted: 'yes', dinnerTime: '20:00' };
  p2.m5 = {
    samplingDate: '2026-09-14', t0: '06:45', fastingConfirmed: 'yes', breakfastGiven: '09:15', lunchGiven: '11:20', dinnerGiven: '16:50',
    timepoints: sampled('06:45', 24, { '12': 14 }, { '12': 'Participant in washroom; sample drawn 14 min late.' }),
    signerName: STAFF.test2.name, signDate: '2026-09-15',
  };
  p2.m6 = { conc: simulatedConc(), pkFailure: { R: 'no', H: 'no', Z: 'no', E: 'yes' }, scientistName: STAFF.test3.name, signDate: '2026-10-01' };
  const m2 = metaWith({
    1: done(STAFF.test1, '2026-09-04T09:50:00'),
    2: done(STAFF.demo, '2026-09-04T11:05:00'),
    3: done(STAFF.test1, '2026-09-05T15:30:00'),
    4: done(STAFF.test1, '2026-09-13T12:45:00'),
    5: done(STAFF.test2, '2026-09-15T08:10:00'),
    6: done(STAFF.test3, '2026-10-01T17:25:00'),
  });

  // 3 — Ineligible (HIV co-infection), routed to closeout
  const p3 = emptyCrf();
  p3.m1 = { participantId: 'SMART-TB-001-003', screeningDate: '2026-09-29', dob: '1969-06-21', gender: 'male', ethnicity: 'Bihari', phone: '83350 61190', address: 'Narkeldanga, Kolkata Central sub-district' };
  p3.m2 = screening('2026-09-29', ['hiv']);
  p3.m10 = { ...p3.m10, status: 'discontinued', reason: 'screen_failure' };
  const m3 = metaWith({
    1: done(STAFF.test1, '2026-09-29T10:40:00'),
    2: done(STAFF.demo, '2026-09-29T12:10:00'),
  });

  // 4 — Discontinued (hepatotoxicity), record closed
  const p4 = emptyCrf();
  p4.m1 = { participantId: 'SMART-TB-001-001', screeningDate: '2026-08-10', dob: '1992-01-30', gender: 'female', ethnicity: 'Bengali', phone: '97480 11523', address: 'Entally, Kolkata Central sub-district' };
  p4.m2 = screening('2026-08-10');
  p4.m3 = { ...BASE_M3, height: '150', weight: '41', smear: '1+' };
  p4.m4 = { startDate: '2026-08-12', weightBand: '35-49', doseR: '450', doseH: '225', doseZ: '1200', doseE: '825', revisitDate: '2026-08-19', missedDoses: 'none', daysMissed: '', consecutiveDays: '', toxicity: 'absent', admitted: 'yes', dinnerTime: '20:15' };
  p4.m9 = {
    noEvents: false,
    events: [{ id: 'ae_seed_1', term: 'Drug-induced hepatitis (ALT 412 U/L)', startDate: '2026-08-20', stopDate: '2026-09-08', ongoing: false, grade: '3', relationship: 'probable', sae: 'no', action: 'stopped', outcome: 'resolved' }],
  };
  p4.m10 = { date: '2026-08-22', status: 'discontinued', reason: 'toxicity', attest: true, piName: STAFF.demo.name, signDate: '2026-08-22' };
  const m4 = metaWith({
    1: done(STAFF.test1, '2026-08-10T10:00:00'),
    2: done(STAFF.demo, '2026-08-10T11:30:00'),
    3: done(STAFF.test1, '2026-08-11T15:10:00'),
    4: done(STAFF.test1, '2026-08-19T13:05:00'),
    9: done(STAFF.test1, '2026-08-21T09:40:00'),
    10: done(STAFF.demo, '2026-08-22T16:15:00'),
  });

  return [
    { uid: 'seed-004', createdAt: '2026-09-24T09:30:00', updatedAt: '2026-10-05T10:04:00', discontinuationRequested: false, data: p1, meta: m1 },
    { uid: 'seed-002', createdAt: '2026-09-04T09:20:00', updatedAt: '2026-10-01T17:25:00', discontinuationRequested: false, data: p2, meta: m2 },
    { uid: 'seed-003', createdAt: '2026-09-29T10:05:00', updatedAt: '2026-09-29T12:10:00', discontinuationRequested: false, data: p3, meta: m3 },
    { uid: 'seed-001', createdAt: '2026-08-10T09:30:00', updatedAt: '2026-08-22T16:15:00', discontinuationRequested: true, data: p4, meta: m4 },
  ];
}

export const seedParticipants: Participant[] = buildSeed();
