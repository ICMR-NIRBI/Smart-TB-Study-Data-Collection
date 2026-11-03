import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { getSessionUser, isSameOrigin } from '../../../server/auth';
import { SYSTEM_LOG_COLLECTION } from '../../../server/mongo/schema';
import { reader } from '../../../server/mongo/tx';
import { logEvent } from '../../../server/system';

/**
 * An error in a staff member's browser (a crash on a phone), sent by the app itself so it shows on System control.
 * Same-site only, short, and limited to 20 reports per address per 10 minutes. Always answers 204.
 */
export async function POST(req: Request) {
  try {
    if (!(await isSameOrigin())) return new NextResponse(null, { status: 204 });
    const h = await headers();
    const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
    const recent = await reader.count(SYSTEM_LOG_COLLECTION, { kind: 'CLIENT_ERROR', ip, at: { $gte: new Date(Date.now() - 10 * 60 * 1000) } });
    if (recent >= 20) return new NextResponse(null, { status: 204 });
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const text = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '');
    const message = text(body.message, 300);
    if (!message) return new NextResponse(null, { status: 204 });
    const where = text(body.where, 160);
    const user = await getSessionUser().catch(() => null);
    await logEvent('CLIENT_ERROR', {
      reason: where ? `${message} (${where})` : message,
      page: text(body.page, 200) || undefined,
      email: user?.email,
      ip,
      userAgent: h.get('user-agent')?.slice(0, 200) ?? null,
    });
  } catch {
    /* reporting must never cause trouble of its own */
  }
  return new NextResponse(null, { status: 204 });
}
