import { NextResponse } from 'next/server';
import { isSameOrigin, signIn } from '../../../../server/auth';
import { errorResponse, readJson } from '../../../../server/http';
import { ApiError } from '../../../../server/errors';

export async function POST(req: Request) {
  try {
    if (!(await isSameOrigin())) throw new ApiError(403, 'Cross-site request rejected');
    const body = await readJson(req);
    const email = typeof body.email === 'string' ? body.email : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!email || !password) throw new ApiError(400, 'Enter your email and password');

    const result = await signIn(email, password);
    if (!result.ok) return NextResponse.json(result, { status: result.locked ? 429 : 401 });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err);
  }
}
