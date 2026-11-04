import { apiHandler, readJson } from '../../../../server/http';
import { ApiError } from '../../../../server/errors';
import { withTransaction } from '../../../../server/mongo/tx';
import { setAnnouncement, setDemo, setMaintenance } from '../../../../server/siteSettings';
import { assertSystemAdmin } from '../../../../server/system';

/**
 * Maintenance mode: `{ kind: 'maintenance', on, message, reason }`.
 * Announcement banner: `{ kind: 'announcement', text, tone: 'info' | 'warn', hours }` (empty text clears it).
 * Demo mode (every module shown open): `{ kind: 'demo', on }`.
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
      if (body.kind === 'demo') {
        return withTransaction({ userId: user.id, reason: body.on === true ? 'Demo mode on: all modules open' : 'Demo mode off' }, (tx) => setDemo(tx, user, body));
      }
      throw new ApiError(400, 'Unknown setting');
    },
    { mutating: true },
  );
}
