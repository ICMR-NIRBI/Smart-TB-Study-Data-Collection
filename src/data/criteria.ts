export interface Criterion {
  key: string;
  label: string;
}

export const INCLUSION_CRITERIA: Criterion[] = [
  { key: 'age18', label: 'Age ≥18 years' },
  { key: 'newlyDiagnosed', label: 'Newly diagnosed, drug-naïve pulmonary TB' },
  { key: 'hrze', label: 'Prescribed standard first-line fixed-dose HRZE regimen' },
  { key: 'willingAdmission', label: 'Willing to be admitted for 24-h PK intensive sampling at Day 8 (+2)' },
  { key: 'consent', label: 'Written informed consent provided before any study procedure' },
];

export const EXCLUSION_CRITERIA: Criterion[] = [
  { key: 'eptb', label: 'Extra-pulmonary TB' },
  { key: 'hiv', label: 'Known HIV co-infection' },
  { key: 'rifResistance', label: 'Baseline Rifampicin resistance (CBNAAT / TrueNat / LPA)' },
  { key: 'critical', label: 'Critical illness requiring ICU / emergency resuscitation' },
  { key: 'hepatic', label: 'Significant hepatic dysfunction (AST/ALT >3× ULN or total bilirubin >2× ULN)' },
  { key: 'renal', label: 'Significant renal impairment (creatinine >2.0 mg/dL or eGFR <50 mL/min)' },
  { key: 'cardiac', label: 'Serious cardiac arrhythmia or QTc >450 ms (male) / >470 ms (female)' },
];
