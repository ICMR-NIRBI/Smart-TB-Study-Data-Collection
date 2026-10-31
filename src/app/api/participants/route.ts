import { reader, withTransaction } from '../../../server/mongo/tx';
import { apiHandler } from '../../../server/http';
import { createParticipant, loadParticipants } from '../../../server/participants';

export async function GET() {
  return apiHandler(async (user) => ({ participants: await loadParticipants(reader, user) }));
}

export async function POST() {
  return apiHandler(
    async (user) => ({ participant: await withTransaction({ userId: user.id }, (c) => createParticipant(c, user)) }),
    { mutating: true },
  );
}
