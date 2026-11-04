import { NextResponse } from 'next/server';
import { isSameOrigin, peekSessionUser } from '../../../../server/auth';
import { setPresence } from '../../../../server/live';

export const dynamic = 'force-dynamic';

const UID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * "I have Module N of this participant open for entry" (sent every ~20 s while it is) or `module: null` when leaving.
 * Others see "… is editing Module N". Kept in memory only; does not count as activity for the idle sign-out.
 */
export async function POST(req: Request) {
  if (!(await isSameOrigin())) return NextResponse.json({ error: 'Cross-site request rejected' }, { status: 403 });
  const user = await peekSessionUser();
  if (!user || user.mustChangePassword) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { uid?: unknown; module?: unknown };
  const uid = typeof body.uid === 'string' ? body.uid : '';
  const mod = body.module === null ? null : Number(body.module);
  if (!UID_RE.test(uid) || (mod !== null && !(Number.isInteger(mod) && mod >= 1 && mod <= 10))) {
    return NextResponse.json({ error: 'Invalid presence' }, { status: 400 });
  }
  setPresence(uid, user, mod);
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
