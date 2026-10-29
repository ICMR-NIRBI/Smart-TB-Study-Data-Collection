/** An invitation link that nobody has used yet. */
export interface StaffInvite {
  id: string;
  role: string;
  roleLabel: string;
  isAdmin: boolean;
  createdAt: string;
  expiresAt: string;
  createdBy: string;
}
