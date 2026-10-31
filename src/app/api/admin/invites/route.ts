import { reader, withTransaction } from '../../../../server/mongo/tx';
import { apiHandler, readJson } from '../../../../server/http';
import { assertAdmin } from '../../../../server/staff';
import { createInvite, listInvites } from '../../../../server/invites';

/** Invitations that have not been used yet. */
export async function GET() {
  return apiHandler(async (user) => {
    assertAdmin(user);
    return { invites: await listInvites(reader) };
  });
}

/** Make an invitation link for a role: `{ role, isAdmin? }`. The person fills in their own name, email and password. */
export async function POST(req: Request) {
  return apiHandler(
    async (user) => {
      assertAdmin(user);
      const body = await readJson(req);
      return withTransaction({ userId: user.id, reason: 'Staff invitation created' }, (c) => createInvite(c, user, body));
    },
    { mutating: true },
  );
}
