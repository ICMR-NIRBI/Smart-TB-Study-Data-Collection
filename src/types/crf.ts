export type YesNo = '' | 'yes' | 'no';
export type ModuleId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type DrugKey = 'R' | 'H' | 'Z' | 'E';
export type Gender = '' | 'male' | 'female' | 'other';
export type SmearGrade = '' | 'scanty' | '1+' | '2+' | '3+';
export type WeightBand = '' | '25-34' | '35-49' | '50-64' | '65-75' | '>75';
export type Detection = '' | 'not_detected' | 'detected';

export interface M1Data {
  participantId: string;
  screeningDate: string;
  dob: string;
  gender: Gender;
  ethnicity: string;
  phone: string;
  address: string;
}

export interface M2Data {
  inclusion: Record<string, YesNo>;
  exclusion: Record<string, YesNo>;
  investigatorName: string;
  signature: string;
  signDate: string;
}

export interface M3Data {
  height: string;
  weight: string;
  hr: string;
  sbp: string;
  dbp: string;
  jaundice: YesNo;
  hb: string;
  tlc: string;
  platelets: string;
  tbil: string;
  dbil: string;
  ast: string;
  alt: string;
  alp: string;
  creatinine: string;
  urea: string;
  fbs: string;
  rbs: string;
  hba1c: string;
  diabetes: YesNo;
  smear: SmearGrade;
  mtbDetected: YesNo;
  rifResistance: Detection;
  micR: string;
  micH: string;
  micZ: string;
  micE: string;
}

export interface M4Data {
  startDate: string;
  weightBand: WeightBand;
  doseR: string;
  doseH: string;
  doseZ: string;
  doseE: string;
  revisitDate: string;
  missedDoses: '' | 'none' | 'missed';
  daysMissed: string;
  consecutiveDays: string;
  toxicity: '' | 'present' | 'absent';
  admitted: YesNo;
  dinnerTime: string;
}

export interface TimepointEntry {
  actual: string;
  blood: boolean;
  bloodImg: string;
  plasma: boolean;
  plasmaImg: string;
  salivaSwab: boolean;
  salivaPaper: boolean;
  stabilizer: boolean;
  comments: string;
}

export interface M5Data {
  samplingDate: string;
  t0: string;
  fastingConfirmed: YesNo;
  breakfastGiven: string;
  lunchGiven: string;
  dinnerGiven: string;
  timepoints: Record<string, TimepointEntry>;
  signerName: string;
  signature: string;
}

export interface ConcEntry {
  plasma: string;
  saliva: string;
}

export interface M6Data {
  conc: Record<DrugKey, Record<string, ConcEntry>>;
  pkFailure: Record<DrugKey, YesNo>;
  scientistName: string;
  signature: string;
  signDate: string;
}

export interface M7Data {
  visitDate: string;
  dosesDispensed: string;
  blistersReturned: string;
  cough: '' | 'resolved' | 'improved' | 'unchanged';
  fever: '' | 'resolved' | 'persistent';
  weight: string;
  adr: '' | 'none' | 'present';
}

export interface M8Data {
  evalDate: string;
  cumulativeCompliance: string;
  smear: '' | 'negative' | 'positive';
  smearGrade: SmearGrade;
  culture: '' | 'negative' | 'positive';
  outcome: '' | 'success' | 'failure';
  lpaPerformed: '' | 'yes' | 'na';
  lpaDate: string;
  labName: string;
  rifMutation: Detection;
  rifMutationText: string;
  inhMutation: Detection;
  inhMutationText: string;
  dstAvailable: YesNo;
  dstR: YesNo;
  dstH: YesNo;
  dstZ: YesNo;
  dstE: YesNo;
}

export interface AdverseEvent {
  id: string;
  term: string;
  startDate: string;
  stopDate: string;
  ongoing: boolean;
  grade: '' | '1' | '2' | '3' | '4';
  relationship: '' | 'definite' | 'probable' | 'possible' | 'unlikely';
  sae: YesNo;
  action: '' | 'none' | 'interrupted' | 'stopped';
  outcome: '' | 'resolved' | 'ongoing';
}

export interface M9Data {
  events: AdverseEvent[];
  noEvents: boolean;
}

export type M10Reason = '' | 'withdrawal' | 'toxicity' | 'resistance' | 'ltfu' | 'death' | 'screen_failure';

export interface M10Data {
  date: string;
  status: '' | 'completed' | 'discontinued';
  reason: M10Reason;
  attest: boolean;
  piName: string;
  signature: string;
  signDate: string;
}

export interface CrfData {
  m1: M1Data;
  m2: M2Data;
  m3: M3Data;
  m4: M4Data;
  m5: M5Data;
  m6: M6Data;
  m7: M7Data;
  m8: M8Data;
  m9: M9Data;
  m10: M10Data;
}

export type ModuleKey = keyof CrfData;

export interface EditLogEntry {
  at: string;
  by: string;
  role: string;
  reason: string;
}

export interface ModuleMeta {
  completed: boolean;
  completedBy: string;
  completedRole: string;
  completedAt: string;
  editing: boolean;
  draftSavedAt: string;
  edits: EditLogEntry[];
}

export interface Participant {
  uid: string;
  createdAt: string;
  updatedAt: string;
  discontinuationRequested: boolean;
  data: CrfData;
  meta: Record<ModuleId, ModuleMeta>;
}

export interface StaffUser {
  name: string;
  role: string;
}

export type ParticipantStatus = 'in_progress' | 'completed' | 'ineligible' | 'discontinued';
export type ModuleAccess = 'complete' | 'current' | 'open' | 'locked';

export interface ModuleProps<K extends ModuleKey> {
  participant: Participant;
  data: CrfData[K];
  update: (patch: Partial<CrfData[K]>) => void;
  readOnly: boolean;
  errors: Record<string, string>;
  onOpenModule: (id: ModuleId) => void;
  onDiscontinue: (reason: M10Reason) => void;
}
