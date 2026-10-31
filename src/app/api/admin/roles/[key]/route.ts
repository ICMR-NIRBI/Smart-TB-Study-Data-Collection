import { withTransaction } from '../../../../../server/mongo/tx';
import { apiHandler } from '../../../../../server/http';
import { readJson } from '../../../../../server/http';
import { deleteRole, updateRoleModules } from '../../../../../server/roles';

/** Change the modules of a custom role: `{ modules }` (PI or data manager). */
export async function PATCH(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return apiHandler(
    async (user) => {
      const body = await readJson(req);
      await withTransaction({ userId: user.id, reason: 'Role modules changed' }, (c) => updateRoleModules(c, user, key, body.modules));
      return { ok: true };
    },
    { mutating: true },
  );
}

/** Remove a role nobody holds any more (PI or data manager). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return apiHandler(
    async (user) => {
      await withTransaction({ userId: user.id, reason: 'Role removed' }, (c) => deleteRole(c, user, key));
      return { ok: true };
    },
    { mutating: true },
  );
}
