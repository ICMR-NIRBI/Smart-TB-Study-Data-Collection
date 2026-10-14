import { NextResponse } from 'next/server';
import { isSameOrigin, listTestAccounts, signInAsTestAccount, testLoginEnabled } from '../../../../server/auth';
import { errorResponse, readJson } from '../../../../server/http';
import { ApiError } from '../../../../server/participants';

const NO_STORE = { 'Cache-Control': 'no-store' };

/** Test accounts for one-tap sign-in, or an empty list when ALLOW_TEST_LOGIN is off. */
export async function GET() {
  try {
    return NextResponse.json({ enabled: testLoginEnabled(), accounts: await listTestAccounts() }, { headers: NO_STORE });
  } catch (err) {
    return errorResponse(err);
  }
}

/** One-tap sign-in: `{ email }` */
export async function POST(req: Request) {
  try {
    if (!(await isSameOrigin())) throw new ApiError(403, 'Cross-site request rejected');
    const body = await readJson(req);
    const result = await signInAsTestAccount(typeof body.email === 'string' ? body.email : '');
    if (!result.ok) throw new ApiError(403, result.error);
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (err) {
    return errorResponse(err);
  }
}
