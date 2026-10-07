import type { StaffUser } from '../types/crf';

export const STAFF_ROLES = ['Research Officer', 'Phlebotomist', 'PK Scientist', 'Principal Investigator'] as const;

export const STAFF: Record<'ro' | 'phleb' | 'pk' | 'pi', StaffUser> = {
  ro: { name: 'Dr. Priya Mukherjee', role: 'Research Officer' },
  phleb: { name: 'Sourav Das', role: 'Phlebotomist' },
  pk: { name: 'Dr. Neha Srivastava', role: 'PK Scientist' },
  pi: { name: 'Prof. Arindam Basu', role: 'Principal Investigator' },
};

export const DEFAULT_USER: StaffUser = STAFF.ro;
