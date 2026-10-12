import { EXCLUSION_CRITERIA, INCLUSION_CRITERIA } from '../data/criteria';
import { TIMEPOINTS } from '../data/timepoints';
import { DRUGS } from '../data/drugs';
import { todayISO } from './dates';
import type {
  AdverseEvent,
  ConcEntry,
  CrfData,
  DrugKey,
  ModuleId,
  ModuleKey,
  ModuleMeta,
  Participant,
  TimepointEntry,
  YesNo,
} from '../types/crf';

export const ALL_MODULE_IDS: ModuleId[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export function moduleKey(id: ModuleId): ModuleKey {
  return `m${id}` as ModuleKey;
}

export function createUid(prefix = 'p'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyTimepoint(): TimepointEntry {
  return {
    actual: '',
    blood: false,
    bloodImg: '',
    plasma: false,
    plasmaImg: '',
    salivaSwab: false,
    salivaPaper: false,
    stabilizer: false,
    comments: '',
  };
}

export function emptyConc(): Record<DrugKey, Record<string, ConcEntry>> {
  const out = {} as Record<DrugKey, Record<string, ConcEntry>>;
  DRUGS.forEach((d) => {
    out[d.key] = Object.fromEntries(TIMEPOINTS.map((tp) => [tp.key, { plasma: '', saliva: '' }]));
  });
  return out;
}

export function emptyAdverseEvent(): AdverseEvent {
  return {
    id: createUid('ae'),
    term: '',
    startDate: '',
    stopDate: '',
    ongoing: false,
    grade: '',
    relationship: '',
    sae: '',
    action: '',
    outcome: '',
  };
}

export function emptyCrf(): CrfData {
  return {
    m1: { participantId: '', screeningDate: todayISO(), dob: '', gender: '', ethnicity: '', phone: '', address: '' },
    m2: {
      inclusion: Object.fromEntries(INCLUSION_CRITERIA.map((c) => [c.key, ''])) as Record<string, YesNo>,
      exclusion: Object.fromEntries(EXCLUSION_CRITERIA.map((c) => [c.key, ''])) as Record<string, YesNo>,
      investigatorName: '',
      signDate: '',
    },
    m3: {
      height: '', weight: '', hr: '', sbp: '', dbp: '', jaundice: '',
      hb: '', tlc: '', platelets: '', tbil: '', dbil: '', ast: '', alt: '', alp: '',
      creatinine: '', urea: '', fbs: '', rbs: '', hba1c: '', diabetes: '',
      smear: '', mtbDetected: '', rifResistance: '', micR: '', micH: '', micZ: '', micE: '',
    },
    m4: {
      startDate: '', weightBand: '', doseR: '', doseH: '', doseZ: '', doseE: '',
      revisitDate: '', missedDoses: '', daysMissed: '', consecutiveDays: '',
      toxicity: '', admitted: '', dinnerTime: '',
    },
    m5: {
      samplingDate: '', t0: '', fastingConfirmed: '', breakfastGiven: '', lunchGiven: '', dinnerGiven: '',
      timepoints: Object.fromEntries(TIMEPOINTS.map((tp) => [tp.key, emptyTimepoint()])),
      signerName: '', signDate: '',
    },
    m6: {
      conc: emptyConc(),
      pkFailure: { R: '', H: '', Z: '', E: '' },
      scientistName: '', signDate: '',
    },
    m7: { visitDate: '', dosesDispensed: '', blistersReturned: '', cough: '', fever: '', weight: '', adr: '' },
    m8: {
      evalDate: '', cumulativeCompliance: '', smear: '', smearGrade: '', culture: '', outcome: '',
      lpaPerformed: '', lpaDate: '', labName: '', rifMutation: '', rifMutationText: '',
      inhMutation: '', inhMutationText: '', dstAvailable: '', dstR: '', dstH: '', dstZ: '', dstE: '',
    },
    m9: { events: [], noEvents: false },
    m10: { date: '', status: '', reason: '', attest: false, piName: '', signDate: '' },
  };
}

export function emptyMeta(): ModuleMeta {
  return { completed: false, completedBy: '', completedRole: '', completedAt: '', editing: false, draftSavedAt: '', edits: [] };
}

export function emptyMetaMap(): Record<ModuleId, ModuleMeta> {
  const map = {} as Record<ModuleId, ModuleMeta>;
  ALL_MODULE_IDS.forEach((id) => {
    map[id] = emptyMeta();
  });
  return map;
}

export function newParticipant(): Participant {
  const now = new Date().toISOString();
  return {
    uid: createUid(),
    createdAt: now,
    updatedAt: now,
    discontinuationRequested: false,
    data: emptyCrf(),
    meta: emptyMetaMap(),
  };
}
