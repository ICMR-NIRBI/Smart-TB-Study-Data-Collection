import { NextResponse } from 'next/server';
import { isSameOrigin } from '../../../server/auth';
import { withTransaction } from '../../../server/mongo/tx';
import { errorResponse, readJson } from '../../../server/http';
import { ApiError } from '../../../server/errors';
import { allow } from '../../../server/rateLimit';
import { isAlreadyRecorded, submitAccessRequest } from '../../../server/accessRequests';

const HOUR = 60 * 60 * 1000;

/**
 * Public form: `{ name, email, role, note, password, website }`. `website` is a hidden trap field that people leave empty.
 * The answer is the same whether or not the request was stored, so it reveals nothing about existing accounts.
 */
export async function POST(req: Request) {
  try {
    if (!(await isSameOrigin())) throw new ApiError(403, 'Cross-site request rejected');
    // Caddy sets X-Forwarded-For to the real visitor address.
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!allow(`access-request:${ip}`, 5, HOUR) || !allow('access-request:all', 60, HOUR)) {
      throw new ApiError(429, 'Too many requests. Please try again later.');
    }
    const body = await readJson(req);
    if (typeof body.website === 'string' && body.website) return NextResponse.json({ ok: true });
    try {
      await withTransaction({}, (c) => submitAccessRequest(c, body));
    } catch (err) {
      // An identical request arriving at the same instant: the answer is the same either way.
      if (!isAlreadyRecorded(err)) throw err;
    }
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err);
  }
}
