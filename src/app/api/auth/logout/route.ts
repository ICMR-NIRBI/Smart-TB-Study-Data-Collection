import { NextResponse } from 'next/server';
import { isSameOrigin, signOut } from '../../../../server/auth';
import { errorResponse } from '../../../../server/http';
import { ApiError } from '../../../../server/errors';

export async function POST() {
  try {
    if (!(await isSameOrigin())) throw new ApiError(403, 'Cross-site request rejected');
    await signOut();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
