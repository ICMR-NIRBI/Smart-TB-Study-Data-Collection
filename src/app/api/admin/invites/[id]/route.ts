import { withTransaction } from '../../../../../server/db';
import { apiHandler } from '../../../../../server/http';
import { revokeInvite } from '../../../../../server/invites';

/** Withdraw an invitation that has not been used. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return apiHandler(
    async (user) => {
      await withTransaction({ userId: user.id, reason: 'Staff invitation withdrawn' }, (c) => revokeInvite(c, user, id));
      return { ok: true };
    },
    { mutating: true },
  );
}
