export interface VisitWindowDef {
  key: string;
  label: string;
  fromDay: number;
  toDay: number;
}

export const VISIT_WINDOWS: VisitWindowDef[] = [
  { key: 'd7', label: 'Day 7 revisit', fromDay: 7, toDay: 9 },
  { key: 'pk', label: 'PK sampling', fromDay: 8, toDay: 10 },
  { key: 'm1', label: 'Month 1', fromDay: 27, toDay: 33 },
  { key: 'm2', label: 'Month 2', fromDay: 55, toDay: 65 },
];
