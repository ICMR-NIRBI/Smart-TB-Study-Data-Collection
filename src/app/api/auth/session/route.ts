import { NextResponse } from 'next/server';
import { getSessionUser } from '../../../../server/auth';
import { errorResponse } from '../../../../server/http';

export async function GET() {
  try {
    const user = await getSessionUser();
    return NextResponse.json({ user }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err);
  }
}
