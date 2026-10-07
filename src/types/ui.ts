export type SegmentTone = 'brand' | 'ok' | 'warn' | 'danger';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  tone?: SegmentTone;
  disabled?: boolean;
  description?: string;
}
