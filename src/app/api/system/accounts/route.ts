import { apiHandler, readJson } from '../../../../server/http';
import { withTransaction } from '../../../../server/mongo/tx';
import { accountAccess, assertSystemAdmin, rescueAccount } from '../../../../server/system';
import { requireReason } from '../../../../server/staff';

/** An account's sign-in lock and signed-in devices: `?id=<account id>`. */
export async function GET(req: Request) {
  return apiHandler(async (user) => {
    assertSystemAdmin(user);
    return accountAccess(new URL(req.url).searchParams.get('id') ?? '');
  });
}

/** Unlock a locked sign-in or sign an account out everywhere: `{ userId, action: 'unlock' | 'signout', reason }`. */
export async function POST(req: Request) {
  return apiHandler(
    async (user) => {
      assertSystemAdmin(user);
      const body = await readJson(req);
      const reason = requireReason(body.reason);
      await withTransaction({ userId: user.id, reason }, (tx) => rescueAccount(tx, user, body));
      return accountAccess(String(body.userId));
    },
    { mutating: true },
  );
}
