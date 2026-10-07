import type { ModuleId } from '../types/crf';

export interface ModuleDef {
  id: ModuleId;
  title: string;
  short: string;
  step: string;
  timing: string;
}

export const MODULES: ModuleDef[] = [
  { id: 1, title: 'Patient Identification & Baseline Demographics', short: 'Identification & Demographics', step: 'Identity', timing: 'At screening · Pulmonary OPD' },
  { id: 2, title: 'Screening & Eligibility Verification', short: 'Screening & Eligibility', step: 'Eligibility', timing: 'Must meet all inclusion and zero exclusion criteria' },
  { id: 3, title: 'Baseline Clinical, Anthropometric & Laboratory Profile', short: 'Baseline Clinical Profile', step: 'Baseline', timing: 'Within 48 h before or at Day 0' },
  { id: 4, title: 'Treatment Initiation & 7-Day Compliance Check', short: 'Treatment Initiation', step: 'Treatment', timing: 'Day 0 · revisit Day 7 (+2)' },
  { id: 5, title: 'Day 8 (+2) Intensive PK Sampling Flowsheet', short: 'Day 8 PK Sampling', step: 'PK sampling', timing: 'Day 8 (+2) · 24-h inpatient sampling' },
  { id: 6, title: 'Bioanalytical LC-MS/MS Results & PK', short: 'Bioanalytical Results & PK', step: 'Bioanalysis', timing: 'PK scientist · Dr. RMLIMS Lucknow / ICMR-NIRBI' },
  { id: 7, title: 'Month 1 Interim Follow-up & Adherence', short: 'Month 1 Follow-up', step: 'Month 1', timing: 'Day 30 ± 3' },
  { id: 8, title: 'Month 2 Microbiological Outcome', short: 'Month 2 Outcome', step: 'Month 2', timing: 'Day 60 ± 5 · end of intensive phase' },
  { id: 9, title: 'Adverse Drug Reactions & Safety Log', short: 'Adverse Events', step: 'Adverse events', timing: 'Accessible anytime · does not block progression' },
  { id: 10, title: 'Study Discontinuation & Final Closeout', short: 'Closeout', step: 'Closeout', timing: 'PI attestation locks the entire record' },
];

export const SITE_NAME = 'NRS Medical College & Hospital, Kolkata';

export const PI_ATTESTATION =
  'I confirm that all clinical, pharmacokinetic, imaging, and microbiological data recorded in this Case Report Form have been collected in compliance with the IEC-approved protocol ver 1.1.1, Good Clinical Practice, and ICMR ethical guidelines.';
