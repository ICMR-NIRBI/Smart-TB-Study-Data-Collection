import { withTransaction } from '../../../../../server/db';
import { apiHandler } from '../../../../../server/http';
import { deleteRole } from '../../../../../server/roles';

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
