import type { RoleKey } from '../data/roles';
import type { ModuleId } from './crf';

export type StaffStatus = 'invited' | 'active' | 'deactivated';

export interface Delegation {
  moduleId: ModuleId;
  reason: string;
  /** Last day the delegation applies (YYYY-MM-DD), or '' for no end date. */
  expiresAt: string;
  grantedAt: string;
  grantedBy: string;
}

export interface StaffMember {
  id: string;
  email: string;
  name: string;
  role: RoleKey;
  /** Display name of the role, including roles added by the PI. */
  roleLabel: string;
  isAdmin: boolean;
  status: StaffStatus;
  /** Has a temporary password and has not chosen their own yet. */
  mustChangePassword: boolean;
  lastSignInAt: string;
  createdAt: string;
  delegations: Delegation[];
}

export interface StaffHistoryEntry {
  at: string;
  by: string;
  action: string;
  summary: string;
  reason: string;
}

/** Returned once when a setup link is created; only its hash is stored. */
export interface SetupLink {
  token: string;
  expiresAt: string;
}
