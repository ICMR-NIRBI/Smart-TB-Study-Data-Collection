import { NextResponse } from 'next/server';
import { signOut } from '../../../../server/auth';
import { errorResponse } from '../../../../server/http';

export async function POST() {
  try {
    await signOut();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
