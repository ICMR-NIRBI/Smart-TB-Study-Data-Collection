import { apiHandler, readJson } from '../../../../server/http';
import { withTransaction } from '../../../../server/mongo/tx';
import { assertSystemAdmin, setAccountPassword } from '../../../../server/system';
import { requireReason } from '../../../../server/staff';

/** Set a password for any other account: `{ userId, password, mustChange, reason }`. */
export async function POST(req: Request) {
  return apiHandler(
    async (user) => {
      assertSystemAdmin(user);
      const body = await readJson(req);
      const reason = requireReason(body.reason);
      return withTransaction({ userId: user.id, reason }, (tx) => setAccountPassword(tx, user, body));
    },
    { mutating: true },
  );
}
