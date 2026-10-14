import { getPool, withTransaction } from '../../../server/db';
import { apiHandler } from '../../../server/http';
import { createParticipant, loadParticipants } from '../../../server/participants';

export async function GET() {
  return apiHandler(async (user) => ({ participants: await loadParticipants(getPool(), user) }));
}

export async function POST() {
  return apiHandler(
    async (user) => ({ participant: await withTransaction({ userId: user.id }, (c) => createParticipant(c, user)) }),
    { mutating: true },
  );
}
