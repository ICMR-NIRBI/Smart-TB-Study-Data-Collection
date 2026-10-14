import { NextResponse } from 'next/server';
import { isSameOrigin } from '../../../server/auth';
import { getPool, withTransaction } from '../../../server/db';
import { errorResponse, readJson } from '../../../server/http';
import { ApiError } from '../../../server/participants';
import { completeSetup, describeSetupToken } from '../../../server/staff';

const NO_STORE = { 'Cache-Control': 'no-store' };

/** Who a setup link belongs to, so the page can greet them. `?token=` */
export async function GET(req: Request) {
  try {
    const token = new URL(req.url).searchParams.get('token') ?? '';
    const account = token ? await describeSetupToken(getPool(), token) : null;
    if (!account) throw new ApiError(410, 'This setup link has expired or was already used. Ask the study administrator for a new one.');
    return NextResponse.json({ account }, { headers: NO_STORE });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Set the password: `{ token, password }` */
export async function POST(req: Request) {
  try {
    if (!(await isSameOrigin())) throw new ApiError(403, 'Cross-site request rejected');
    const body = await readJson(req);
    const token = typeof body.token === 'string' ? body.token : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!token) throw new ApiError(400, 'Missing setup link');
    await withTransaction({}, (c) => completeSetup(c, token, password));
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (err) {
    return errorResponse(err);
  }
}
