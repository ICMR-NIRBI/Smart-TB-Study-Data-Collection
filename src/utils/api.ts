export class ApiRequestError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

/** Fired when the server says the session has ended, so the auth layer can return to the login page. */
export const UNAUTHORIZED_EVENT = 'smarttb:unauthorized';

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? 'GET',
      headers: init.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    throw new ApiRequestError(0, 'Cannot reach the server. Check the connection and try again.');
  }
  const json = (await res.json().catch(() => ({}))) as { error?: string; details?: unknown };
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/api/auth/')) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw new ApiRequestError(res.status, json.error ?? `Request failed (${res.status})`, json.details);
  }
  return json as T;
}
