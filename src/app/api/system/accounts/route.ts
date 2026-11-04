import { apiHandler, readJson } from '../../../../server/http';
import { withTransaction } from '../../../../server/mongo/tx';
import { accountAccess, assertSystemAdmin, rescueAccount } from '../../../../server/system';
import { changeRole, requireReason } from '../../../../server/staff';

/** An account's sign-in lock and signed-in devices: `?id=<account id>`. */
export async function GET(req: Request) {
  return apiHandler(async (user) => {
    assertSystemAdmin(user);
    return accountAccess(new URL(req.url).searchParams.get('id') ?? '');
  });
}

/**
 * Unlock a locked sign-in or sign an account out everywhere: `{ userId, action: 'unlock' | 'signout', reason }`.
 * One-click role change: `{ userId, action: 'role', role }` (returns the account; refused during the cooldown).
 */
export async function POST(req: Request) {
  return apiHandler(
    async (user) => {
      assertSystemAdmin(user);
      const body = await readJson(req);
      if (body.action === 'role') {
        const userId = String(body.userId ?? '');
        const member = await withTransaction({ userId: user.id, reason: 'Role changed from System control' }, (tx) => changeRole(tx, user, userId, body.role));
        return { id: member.id, role: member.role, roleLabel: member.roleLabel, roleLockedUntil: member.roleLockedUntil };
      }
      const reason = requireReason(body.reason);
      await withTransaction({ userId: user.id, reason }, (tx) => rescueAccount(tx, user, body));
      return accountAccess(String(body.userId));
    },
    { mutating: true },
  );
}
