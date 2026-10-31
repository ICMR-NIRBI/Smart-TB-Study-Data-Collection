import { reader, withTransaction } from '../../../../server/mongo/tx';
import { apiHandler, readJson } from '../../../../server/http';
import { ApiError } from '../../../../server/errors';
import { createRole, listRoles } from '../../../../server/roles';

/** Roles for the pickers on the staff screens: administrators and the PI. */
export async function GET() {
  return apiHandler(async (user) => {
    if (!user.isAdmin && user.role !== 'pi') throw new ApiError(403, 'Only administrators can see the roles');
    return { roles: await listRoles(reader) };
  });
}

/** Add a role: `{ label, description?, modules }` (PI or data manager). */
export async function POST(req: Request) {
  return apiHandler(
    async (user) => {
      const body = await readJson(req);
      return { role: await withTransaction({ userId: user.id, reason: 'Role added' }, (c) => createRole(c, user, body)) };
    },
    { mutating: true },
  );
}
