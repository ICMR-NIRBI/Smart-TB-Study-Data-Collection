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
  { email: 'admin@smarttb.study', password: DEMO_PASSWORD, user: STAFF.pi, isAdmin: true, label: 'Admin · Principal Investigator' },
  { email: 'ro@smarttb.study', password: DEMO_PASSWORD, user: STAFF.ro, label: 'Research Officer' },
  { email: 'phleb@smarttb.study', password: DEMO_PASSWORD, user: STAFF.phleb, label: 'Phlebotomist' },
  { email: 'pk@smarttb.study', password: DEMO_PASSWORD, user: STAFF.pk, label: 'PK Scientist' },
];

export function findAccount(email: string): DemoAccount | undefined {
  const e = email.trim().toLowerCase();
  return DEMO_ACCOUNTS.find((a) => a.email === e);
}
