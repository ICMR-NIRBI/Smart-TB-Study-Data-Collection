import { withTransaction } from '../../../../../server/db';
import { apiHandler, readJson } from '../../../../../server/http';
import { ApiError } from '../../../../../server/participants';
import { approveAccessRequest, assertPi, expireStale, rejectAccessRequest } from '../../../../../server/accessRequests';

type Ctx = { params: Promise<{ id: string }> };

/** `{ action: 'approve', role? }` or `{ action: 'reject', reason }`. PI only. */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  return apiHandler(
    async (user) => {
      assertPi(user);
      const body = await readJson(req);
      // Done first and committed on its own, so an expiry is recorded even when the decision below is refused.
      await withTransaction({}, (c) => expireStale(c));
      if (body.action === 'approve') {
        await withTransaction({ userId: user.id, reason: 'Access request approved' }, (c) => approveAccessRequest(c, user, id, body));
      } else if (body.action === 'reject') {
        await withTransaction({ userId: user.id, reason: 'Access request rejected' }, (c) => rejectAccessRequest(c, user, id, body.reason));
      } else {
        throw new ApiError(400, 'Unknown action');
      }
      return { ok: true };
    },
    { mutating: true },
  );
}
