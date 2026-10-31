import { reader } from '../../../../../../server/mongo/tx';
import { apiHandler } from '../../../../../../server/http';
import { assertAdmin, staffHistory } from '../../../../../../server/staff';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return apiHandler(async (user) => {
    assertAdmin(user);
    return { history: await staffHistory(reader, id) };
  });
}
