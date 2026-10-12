import type { StaffUser } from '../types/crf';

/** Placeholder identities for the demo build — deliberately no real names or designations. */
export const STAFF: Record<'demo' | 'test1' | 'test2' | 'test3', StaffUser> = {
  demo: { name: 'demo', role: 'Demo account' },
  test1: { name: 'test1', role: 'Test account' },
  test2: { name: 'test2', role: 'Test account' },
  test3: { name: 'test3', role: 'Test account' },
};

export const DEFAULT_USER: StaffUser = STAFF.test1;
