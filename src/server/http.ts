import { NextResponse } from 'next/server';
import { getSessionUser, isSameOrigin, type SessionUser } from './auth';
import { ApiError } from './participants';
import type { ModuleId } from '../types/crf';

/** Runs an API handler for a signed-in user and turns errors into JSON responses. */
export async function apiHandler(
  fn: (user: SessionUser) => Promise<unknown>,
  opts: { mutating?: boolean } = {},
): Promise<NextResponse> {
  try {
    if (opts.mutating && !(await isSameOrigin())) throw new ApiError(403, 'Cross-site request rejected');
    const user = await getSessionUser();
    if (!user) throw new ApiError(401, 'Your session has ended. Please log in again.');
    const result = await fn(user);
    return NextResponse.json(result ?? { ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err);
  }
}

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: err.message, details: err.details }, { status: err.status });
  }
  console.error('[api]', err);
  return NextResponse.json({ error: 'Something went wrong on the server. Please try again.' }, { status: 500 });
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  } catch {
    throw new ApiError(400, 'Invalid request body');
  }
}

export function parseModuleId(raw: string): ModuleId {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 10) throw new ApiError(400, 'Invalid module');
  return n as ModuleId;
}
