import { ROLE_LABELS } from './roles';
import type { StaffUser } from '../types/crf';

/** Placeholder identities for demo data and the local test accounts — deliberately no real names. */
export const STAFF: Record<'demo' | 'test1' | 'test2' | 'test3' | 'test4', StaffUser> = {
  demo: { name: 'demo', role: ROLE_LABELS.pi },
  test1: { name: 'test1', role: ROLE_LABELS.research_officer },
  test2: { name: 'test2', role: ROLE_LABELS.phlebotomist },
  test3: { name: 'test3', role: ROLE_LABELS.pk_scientist },
  test4: { name: 'test4', role: ROLE_LABELS.data_manager },
};
