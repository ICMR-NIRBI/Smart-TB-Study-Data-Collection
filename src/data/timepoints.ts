export interface TimepointDef {
  key: string;
  hours: number;
  label: string;
  note?: string;
  salivaOnly: boolean;
}

export const TIMEPOINTS: TimepointDef[] = [
  { key: '0', hours: 0, label: '0 h', note: 'Pre-dose', salivaOnly: false },
  { key: '1', hours: 1, label: '1 h', salivaOnly: false },
  { key: '2', hours: 2, label: '2 h', salivaOnly: false },
  { key: '3', hours: 3, label: '3 h', salivaOnly: false },
  { key: '4', hours: 4, label: '4 h', salivaOnly: false },
  { key: '5', hours: 5, label: '5 h', note: 'Saliva only', salivaOnly: true },
  { key: '6', hours: 6, label: '6 h', salivaOnly: false },
  { key: '7', hours: 7, label: '7 h', note: 'Saliva only', salivaOnly: true },
  { key: '8', hours: 8, label: '8 h', salivaOnly: false },
  { key: '12', hours: 12, label: '12 h', salivaOnly: false },
  { key: '24', hours: 24, label: '24 h', salivaOnly: false },
];

export const MEALS = [
  { key: 'breakfastGiven', label: 'Breakfast', offset: 2.5, offsetLabel: 'T0 + 2.5 h' },
  { key: 'lunchGiven', label: 'Lunch', offset: 4.5, offsetLabel: 'T0 + 4.5 h' },
  { key: 'dinnerGiven', label: 'Dinner', offset: 10, offsetLabel: 'T0 + 10 h' },
] as const;
