import { changeOwnPassword } from '../../../../server/auth';
import { apiHandler, readJson } from '../../../../server/http';
import { ApiError } from '../../../../server/participants';

/** The signed-in person chooses a new password: `{ currentPassword, newPassword }`. Allowed while a temporary password is still in use. */
export async function POST(req: Request) {
  return apiHandler(
    async (user) => {
      const body = await readJson(req);
      const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
      const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
      if (!currentPassword || !newPassword) throw new ApiError(400, 'Enter your current and new password');
      await changeOwnPassword(user, currentPassword, newPassword);
      return { ok: true };
    },
    { mutating: true, allowTemporaryPassword: true },
  );
}
