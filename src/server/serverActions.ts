import { existsSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ApiError } from './errors';
import { withTransaction } from './mongo/tx';
import { requireReason } from './staff';
import { assertSystemAdmin } from './system';

/*
 * "Take a backup now" and "Restart the app" from System control. The app runs with few rights and cannot do either
 * itself; it only drops a request file. A small root service on the server (deploy/smarttb-actions.sh, started by
 * smarttb-actions.path) does exactly these two things and nothing else, and writes the result where the app can read it.
 */

export const SERVER_ACTIONS = { backup: 'Take a backup now', restart: 'Restart the app' } as const;
export type ServerAction = keyof typeof SERVER_ACTIONS;

const requestDir = () => process.env.SMARTTB_ACTIONS_DIR ?? join(process.cwd(), '.smarttb-actions', 'requests');
const statusDir = () => process.env.SMARTTB_ACTIONS_STATUS_DIR ?? join(process.cwd(), '.smarttb-actions', 'status');
const MIN_GAP_MS = 2 * 60 * 1000;

export interface ActionState {
  action: ServerAction;
  label: string;
  pendingSince: string | null;
  last: { ok: boolean; message: string; startedAt: string; finishedAt: string } | null;
}
export interface ServerActionsStatus {
  /** False until the server helper is installed (deploy.sh does it). */
  available: boolean;
  actions: ActionState[];
}

function lastResult(action: ServerAction): ActionState['last'] {
  try {
    const raw = JSON.parse(readFileSync(join(statusDir(), `${action}.json`), 'utf8')) as Record<string, unknown>;
    return { ok: raw.ok === true, message: String(raw.message ?? ''), startedAt: String(raw.startedAt ?? ''), finishedAt: String(raw.finishedAt ?? '') };
  } catch {
    return null;
  }
}

export function serverActionsStatus(): ServerActionsStatus {
  const available = existsSync(join(statusDir(), 'installed'));
  return {
    available,
    actions: (Object.keys(SERVER_ACTIONS) as ServerAction[]).map((action) => {
      const req = join(requestDir(), `${action}.request`);
      return { action, label: SERVER_ACTIONS[action], pendingSince: existsSync(req) ? statSync(req).mtime.toISOString() : null, last: lastResult(action) };
    }),
  };
}

/** Asks the server helper to run an action. One at a time, and not again within two minutes. Audited, with the reason. */
export async function requestServerAction(actor: { id: string; email: string }, body: Record<string, unknown>): Promise<ServerActionsStatus> {
  assertSystemAdmin(actor);
  const action = body.action as ServerAction;
  if (!(action in SERVER_ACTIONS)) throw new ApiError(400, 'Unknown action');
  const reason = requireReason(body.reason);
  const status = serverActionsStatus();
  if (!status.available) throw new ApiError(409, 'The server helper is not installed yet. It is installed by the next deployment.');
  const state = status.actions.find((a) => a.action === action)!;
  if (state.pendingSince) throw new ApiError(409, 'Already requested; the server is working on it.');
  if (state.last?.startedAt && Date.now() - new Date(state.last.startedAt).getTime() < MIN_GAP_MS) {
    throw new ApiError(429, 'This was run less than two minutes ago. Wait a moment before running it again.');
  }
  await withTransaction({ userId: actor.id, reason }, (tx) => tx.record('server_actions', action, `${action.toUpperCase()}_REQUESTED`));
  mkdirSync(requestDir(), { recursive: true });
  try {
    // 'wx': never overwrite or follow an existing file.
    writeFileSync(join(requestDir(), `${action}.request`), JSON.stringify({ by: actor.email, at: new Date().toISOString() }), { flag: 'wx', mode: 0o640 });
  } catch {
    throw new ApiError(409, 'Already requested; the server is working on it.');
  }
  return serverActionsStatus();
}
