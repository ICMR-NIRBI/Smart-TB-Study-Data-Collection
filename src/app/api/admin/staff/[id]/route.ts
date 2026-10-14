import { withTransaction } from '../../../../../server/db';
import { apiHandler, readJson } from '../../../../../server/http';
import { ApiError } from '../../../../../server/participants';
import {
  assertAdmin,
  requireReason,
  resendInvite,
  resetStaffPassword,
  setDelegations,
  setStaffActive,
  updateStaff,
} from '../../../../../server/staff';

type Ctx = { params: Promise<{ id: string }> };

/** Change name, role or administrator rights: `{ name?, role?, isAdmin?, reason }` */
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  return apiHandler(
    async (user) => {
      assertAdmin(user);
      const body = await readJson(req);
      const reason = requireReason(body.reason);
      return { member: await withTransaction({ userId: user.id, reason }, (c) => updateStaff(c, user, id, body)) };
    },
    { mutating: true },
  );
}

/** `{ action: 'deactivate' | 'reactivate' | 'reset' | 'resend' | 'delegations', reason, delegations? }` */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  return apiHandler(
    async (user) => {
      assertAdmin(user);
      const body = await readJson(req);
      const action = body.action;
      if (action === 'resend') {
        return withTransaction({ userId: user.id, reason: 'Setup link re-issued' }, (c) => resendInvite(c, user, id));
      }
      const reason = requireReason(body.reason);
      return withTransaction({ userId: user.id, reason }, async (c) => {
        if (action === 'deactivate' || action === 'reactivate') return { member: await setStaffActive(c, user, id, action === 'reactivate') };
        if (action === 'reset') return resetStaffPassword(c, user, id);
        if (action === 'delegations') return { member: await setDelegations(c, user, id, body.delegations, reason) };
        throw new ApiError(400, 'Unknown action');
      });
    },
    { mutating: true },
  );
}
