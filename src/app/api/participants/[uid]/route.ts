import { getPool, withTransaction } from '../../../../server/db';
import { apiHandler, readJson } from '../../../../server/http';
import { ApiError, discontinue, loadParticipants } from '../../../../server/participants';

type Ctx = { params: Promise<{ uid: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { uid } = await params;
  return apiHandler(async (user) => {
    const [participant] = await loadParticipants(getPool(), user, [uid]);
    if (!participant) throw new ApiError(404, 'Participant not found');
    return { participant };
  });
}

/** `{ action: 'discontinue', reason }` */
export async function POST(req: Request, { params }: Ctx) {
  const { uid } = await params;
  return apiHandler(
    async (user) => {
      const body = await readJson(req);
      if (body.action !== 'discontinue') throw new ApiError(400, 'Unknown action');
      return { participant: await withTransaction({ userId: user.id }, (c) => discontinue(c, user, uid, body.reason)) };
    },
    { mutating: true },
  );
}
