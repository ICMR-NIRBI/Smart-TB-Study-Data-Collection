import type { RoleKey } from '../data/roles';

export type AccessRequestStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export interface AccessRequest {
  id: string;
  name: string;
  email: string;
  requestedRole: RoleKey;
  note: string;
  status: AccessRequestStatus;
  createdAt: string;
  expiresAt: string;
  decidedBy: string;
  decidedAt: string;
  /** Role the PI gave when approving. */
  decisionRole: RoleKey | '';
  decisionReason: string;
}
