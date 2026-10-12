import { STAFF } from './staff';
import type { StaffUser } from '../types/crf';

/**
 * DEV ONLY.
 * Replace with server-side auth before real use: a MongoDB `users` collection with
 * argon2 password hashes, httpOnly session cookies, and role checks on every API route.
 */
export interface DemoAccount {
  email: string;
  password: string;
  user: StaffUser;
  isAdmin?: boolean;
  label: string;
}

export const DEMO_PASSWORD = 'SmartTB@2026';

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { email: 'demo@smarttb.study', password: DEMO_PASSWORD, user: STAFF.demo, isAdmin: true, label: 'demo · admin' },
  { email: 'test1@smarttb.study', password: DEMO_PASSWORD, user: STAFF.test1, label: 'test1' },
  { email: 'test2@smarttb.study', password: DEMO_PASSWORD, user: STAFF.test2, label: 'test2' },
  { email: 'test3@smarttb.study', password: DEMO_PASSWORD, user: STAFF.test3, label: 'test3' },
];

export function findAccount(email: string): DemoAccount | undefined {
  const e = email.trim().toLowerCase();
  return DEMO_ACCOUNTS.find((a) => a.email === e);
}
