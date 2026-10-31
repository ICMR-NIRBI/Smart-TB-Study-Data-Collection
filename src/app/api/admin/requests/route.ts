import { withTransaction } from '../../../../server/mongo/tx';
import { apiHandler } from '../../../../server/http';
import { listAccessRequests } from '../../../../server/accessRequests';

/** The PI's inbox: pending access requests, then recent decisions. */
export async function GET() {
  return apiHandler((user) => withTransaction({}, async (c) => ({ requests: await listAccessRequests(c, user) })));
}
