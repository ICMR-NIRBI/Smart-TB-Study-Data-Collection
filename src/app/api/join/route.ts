import { NextResponse } from 'next/server';
import { isSameOrigin } from '../../../server/auth';
import { getPool, withTransaction } from '../../../server/db';
import { errorResponse, readJson } from '../../../server/http';
import { acceptInvite, describeInvite } from '../../../server/invites';
import { ApiError } from '../../../server/participants';
import { allow } from '../../../server/rateLimit';

const NO_STORE = { 'Cache-Control': 'no-store' };
const HOUR = 60 * 60 * 1000;
const GONE = 'This invitation link has expired or was already used. Ask the study administrator for a new one.';

function ipOf(req: Request): string {
  // Caddy sets X-Forwarded-For to the real visitor address.
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

/** The role an invitation link is for. `?token=` */
export async function GET(req: Request) {
  try {
    if (!allow(`join-view:${ipOf(req)}`, 60, HOUR)) throw new ApiError(429, 'Too many requests. Please try again later.');
    const token = new URL(req.url).searchParams.get('token') ?? '';
    const invite = token ? await describeInvite(getPool(), token) : null;
    if (!invite) throw new ApiError(410, GONE);
    return NextResponse.json({ invite }, { headers: NO_STORE });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Create the account: `{ token, name, email, password }` */
export async function POST(req: Request) {
  try {
    if (!(await isSameOrigin())) throw new ApiError(403, 'Cross-site request rejected');
    if (!allow(`join:${ipOf(req)}`, 20, HOUR)) throw new ApiError(429, 'Too many attempts. Please try again later.');
    const body = await readJson(req);
    const token = typeof body.token === 'string' ? body.token : '';
    if (!token) throw new ApiError(400, 'Missing invitation link');
    await withTransaction({}, (c) => acceptInvite(c, token, body));
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (err) {
    return errorResponse(err);
  }
}
