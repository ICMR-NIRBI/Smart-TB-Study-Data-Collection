import { peekSessionToken, sessionToken } from '../../../server/auth';
import { allPresence, subscribe, type LiveEvent } from '../../../server/live';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PING_MS = 25_000;
const RECHECK_MS = 60_000;

/**
 * The live channel (server-sent events): every open screen keeps this connection and is told when something changes
 * (see server/live.ts). Only signed-in people may connect; the connection closes when their session ends. It does not
 * count as activity, so it never keeps an idle session alive. Caddy must not compress this path (see deploy/Caddyfile).
 */
export async function GET(req: Request) {
  const token = await sessionToken();
  const user = token ? await peekSessionToken(token) : null;
  if (!token || !user || user.mustChangePassword) return new Response('Not signed in', { status: 401 });

  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      const event = (e: LiveEvent | { type: 'hello'; userId: string; presence: ReturnType<typeof allPresence> }) => send(`data: ${JSON.stringify(e)}\n\n`);

      send('retry: 5000\n\n');
      event({ type: 'hello', userId: user.id, presence: allPresence() });
      const unsubscribe = subscribe((e) => {
        // Account changes go only to the account concerned ('*' = everyone, e.g. a role's modules changed).
        if (e.type === 'account' && e.userId !== user.id && e.userId !== '*') return;
        event(e);
      });
      const ping = setInterval(() => send(': ping\n\n'), PING_MS);
      const recheck = setInterval(() => {
        void peekSessionToken(token)
          .then((still) => {
            if (!still) {
              event({ type: 'account', userId: user.id });
              cleanup();
            }
          })
          .catch(() => {});
      }, RECHECK_MS);

      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(ping);
        clearInterval(recheck);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      req.signal.addEventListener('abort', () => cleanup());
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
