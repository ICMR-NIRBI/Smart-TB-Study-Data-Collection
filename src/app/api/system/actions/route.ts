import { apiHandler, readJson } from '../../../../server/http';
import { requestServerAction } from '../../../../server/serverActions';

/** Ask the server to take a backup now or restart the app: `{ action: 'backup' | 'restart', reason }`. */
export async function POST(req: Request) {
  return apiHandler(async (user) => requestServerAction(user, await readJson(req)), { mutating: true });
}
