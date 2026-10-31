import { reader, withTransaction } from '../../../../server/mongo/tx';
import { apiHandler, readJson } from '../../../../server/http';
import { assertAdmin, createStaff, listStaff } from '../../../../server/staff';

export async function GET() {
  return apiHandler(async (user) => {
    assertAdmin(user);
    return { staff: await listStaff(reader) };
  });
}

/** Add staff: `{ name, email, role, isAdmin }` → the new account and a one-time setup link. */
export async function POST(req: Request) {
  return apiHandler(
    async (user) => {
      assertAdmin(user);
      const body = await readJson(req);
      return withTransaction({ userId: user.id, reason: 'New staff account' }, (c) => createStaff(c, user, body));
    },
    { mutating: true },
  );
}
