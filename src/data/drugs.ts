import type { DrugKey } from '../types/crf';

export interface DrugDef {
  key: DrugKey;
  name: string;
  micKey: 'micR' | 'micH' | 'micZ' | 'micE';
  doseKey: 'doseR' | 'doseH' | 'doseZ' | 'doseE';
}

export const DRUGS: DrugDef[] = [
  { key: 'R', name: 'Rifampicin', micKey: 'micR', doseKey: 'doseR' },
  { key: 'H', name: 'Isoniazid', micKey: 'micH', doseKey: 'doseH' },
  { key: 'Z', name: 'Pyrazinamide', micKey: 'micZ', doseKey: 'doseZ' },
  { key: 'E', name: 'Ethambutol', micKey: 'micE', doseKey: 'doseE' },
];
