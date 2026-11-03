import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { getSessionUser, isSameOrigin, type SessionUser } from './auth';
import { ApiError } from './participants';
import { describeError, isSystemAdmin, logEvent } from './system';
import { siteSettingsCached } from './siteSettings';
import type { ModuleId } from '../types/crf';

/** Runs an API handler for a signed-in user and turns errors into JSON responses. */
export async function apiHandler(
  fn: (user: SessionUser) => Promise<unknown>,
  opts: { mutating?: boolean; /** Allowed while the account still has a temporary password. */ allowTemporaryPassword?: boolean } = {},
): Promise<NextResponse> {
  let email: string | undefined;
  try {
    if (opts.mutating && !(await isSameOrigin())) throw new ApiError(403, 'Cross-site request rejected');
    const user = await getSessionUser();
    email = user?.email;
    if (!user) throw new ApiError(401, 'Your session has ended. Please log in again.');
    if (user.mustChangePassword && !opts.allowTemporaryPassword) {
      throw new ApiError(403, 'Choose a new password before continuing.', { code: 'PASSWORD_CHANGE_REQUIRED' });
    }
    // Maintenance mode (System control): saving is paused for everyone but the system administrator.
    if (opts.mutating && !isSystemAdmin(user.email)) {
      const site = await siteSettingsCached();
      if (site.maintenance.on) throw new ApiError(503, `Saving is paused for maintenance. ${site.maintenance.message}`.trim(), { code: 'MAINTENANCE' });
    }
    const result = await fn(user);
    return NextResponse.json(result ?? { ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err, { email });
  }
}

/** The page the request came from (its path only), to tell where an error happened. */
async function pageOfRequest(): Promise<string | undefined> {
  try {
    const ref = (await headers()).get('referer');
    return ref ? new URL(ref).pathname.slice(0, 200) : undefined;
  } catch {
    return undefined;
  }
}

export async function errorResponse(err: unknown, ctx: { email?: string } = {}): Promise<NextResponse> {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: err.message, details: err.details }, { status: err.status });
  }
  console.error('[api]', err);
  void logEvent('SERVER_ERROR', { reason: describeError(err), email: ctx.email, page: await pageOfRequest() });
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
