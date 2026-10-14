import { NextResponse } from 'next/server';
import { getPool } from '../../../server/db';

/** For uptime monitoring: 200 when the app and database respond, 503 otherwise. Reveals nothing else. */
export async function GET() {
  try {
    await getPool().query('select 1');
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
