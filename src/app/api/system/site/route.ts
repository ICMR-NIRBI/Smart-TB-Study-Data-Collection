import { apiHandler, readJson } from '../../../../server/http';
import { ApiError } from '../../../../server/errors';
import { withTransaction } from '../../../../server/mongo/tx';
import { setAnnouncement, setMaintenance } from '../../../../server/siteSettings';
import { assertSystemAdmin } from '../../../../server/system';

/**
 * Maintenance mode: `{ kind: 'maintenance', on, message, reason }`.
 * Announcement banner: `{ kind: 'announcement', text, tone: 'info' | 'warn', hours }` (empty text clears it).
 */
export async function POST(req: Request) {
  return apiHandler(
    async (user) => {
      assertSystemAdmin(user);
      const body = await readJson(req);
      if (body.kind === 'maintenance') {
        return withTransaction({ userId: user.id, reason: String(body.reason ?? '') }, (tx) => setMaintenance(tx, user, body));
      }
      if (body.kind === 'announcement') {
        return withTransaction({ userId: user.id, reason: 'Announcement banner' }, (tx) => setAnnouncement(tx, user, body));
      }
      throw new ApiError(400, 'Unknown setting');
    },
    { mutating: true },
  );
}
