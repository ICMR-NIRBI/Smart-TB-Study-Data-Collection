import type { SegmentOption } from '../types/ui';
import type { Detection, Gender, M10Reason, SmearGrade, WeightBand } from '../types/crf';

export const YES_NO: SegmentOption<'yes' | 'no'>[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

export const GENDER_OPTIONS: SegmentOption<Exclude<Gender, ''>>[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

export const SMEAR_OPTIONS: SegmentOption<Exclude<SmearGrade, ''>>[] = [
  { value: 'scanty', label: 'Scanty' },
  { value: '1+', label: '1+' },
  { value: '2+', label: '2+' },
  { value: '3+', label: '3+' },
];

export const DETECTION_OPTIONS: SegmentOption<Exclude<Detection, ''>>[] = [
  { value: 'not_detected', label: 'Not detected' },
  { value: 'detected', label: 'Detected', tone: 'danger' },
];

export const WEIGHT_BANDS: SegmentOption<Exclude<WeightBand, ''>>[] = [
  { value: '25-34', label: '25–34' },
  { value: '35-49', label: '35–49' },
  { value: '50-64', label: '50–64' },
  { value: '65-75', label: '65–75' },
  { value: '>75', label: '>75' },
];

export const DISCONTINUATION_REASONS: SegmentOption<Exclude<M10Reason, '' | 'screen_failure'>>[] = [
  { value: 'withdrawal', label: 'Voluntary withdrawal' },
  { value: 'toxicity', label: 'Significant toxicity / hepatotoxicity', description: 'Requiring regimen modification' },
  { value: 'resistance', label: 'Drug resistance', description: 'Requiring 2nd-line therapy' },
  { value: 'ltfu', label: 'Lost to follow-up' },
  { value: 'death', label: 'Death', description: 'Requires SAE documentation in Module 9' },
];

export const REASON_LABELS: Record<Exclude<M10Reason, ''>, string> = {
  withdrawal: 'Voluntary withdrawal',
  toxicity: 'Significant toxicity / hepatotoxicity',
  resistance: 'Drug resistance requiring 2nd-line therapy',
  ltfu: 'Lost to follow-up',
  death: 'Death',
  screen_failure: 'Screen failure',
};
