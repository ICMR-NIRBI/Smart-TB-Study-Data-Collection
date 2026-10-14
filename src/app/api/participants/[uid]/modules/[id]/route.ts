import { setAuditContext, withTransaction } from '../../../../../../server/db';
import { apiHandler, parseModuleId, readJson } from '../../../../../../server/http';
import {
  ApiError,
  completeModule,
  currentEditReason,
  patchModule,
  reopenModule,
  saveDraft,
} from '../../../../../../server/participants';

type Ctx = { params: Promise<{ uid: string; id: string }> };

/** Save field changes: `{ patch: { field: value, ... } }` (shallow merge into the module). */
export async function PATCH(req: Request, { params }: Ctx) {
  const { uid, id: rawId } = await params;
  return apiHandler(
    async (user) => {
      const id = parseModuleId(rawId);
      const body = await readJson(req);
      await withTransaction({ userId: user.id }, async (c) => {
        const reason = await currentEditReason(c, uid, id);
        if (reason) await setAuditContext(c, { userId: user.id, reason });
        await patchModule(c, user, uid, id, body.patch);
      });
      return { ok: true };
    },
    { mutating: true },
  );
}

/** Module actions: `{ action: 'draft' | 'complete' | 'reopen', reason? }` */
export async function POST(req: Request, { params }: Ctx) {
  const { uid, id: rawId } = await params;
  return apiHandler(
    async (user) => {
      const id = parseModuleId(rawId);
      const body = await readJson(req);
      const action = body.action;
      const reasonText = typeof body.reason === 'string' ? body.reason.trim() : '';

      const participant = await withTransaction({ userId: user.id, reason: action === 'reopen' ? reasonText : undefined }, async (c) => {
        if (action === 'draft') return saveDraft(c, user, uid, id);
        if (action === 'complete') {
          const reason = await currentEditReason(c, uid, id);
          if (reason) await setAuditContext(c, { userId: user.id, reason });
          return completeModule(c, user, uid, id);
        }
        if (action === 'reopen') return reopenModule(c, user, uid, id, reasonText);
        throw new ApiError(400, 'Unknown action');
      });
      return { participant };
    },
    { mutating: true },
  );
}
