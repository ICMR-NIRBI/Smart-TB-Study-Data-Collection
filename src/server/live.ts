import { reader } from './mongo/tx';

/*
 * Live updates: when a change is saved, every open screen is told within a second, so lists and records refresh
 * without a reload. Only the fact of a change travels ("participant X, Module 3 locked, by Y") — never study data;
 * each screen then fetches the record through the normal API, with its normal permission checks.
 *
 * Events are published after the transaction commits (see withTransaction), to the screens connected to this server
 * process (`/api/live`). The app runs as one process, so an in-memory hub is enough. Presence ("who has which module
 * open") is kept here too, in memory, and expires on its own.
 */

export type ParticipantChange = 'created' | 'changed' | 'locked' | 'reopened' | 'discontinued' | 'photo';

export type LiveEvent =
  | { type: 'participant'; uid: string; module: number | null; kind: ParticipantChange; byId: string | null; by: string }
  | { type: 'account'; userId: string }
  | { type: 'presence'; uid: string; editors: Editor[] };

export interface Editor {
  userId: string;
  name: string;
  role: string;
  module: number;
}

/** A change waiting for its transaction to commit (who made it is filled in from the transaction). */
export type PendingEvent =
  | { type: 'participant'; uid: string; module?: number | null; kind: ParticipantChange }
  | { type: 'account'; userId: string };

type Listener = (e: LiveEvent) => void;

interface Hub {
  listeners: Set<Listener>;
  /** uid -> userId -> editor and when they last said so. */
  presence: Map<string, Map<string, Editor & { at: number }>>;
  names: Map<string, { name: string; at: number }>;
  sweeper?: ReturnType<typeof setInterval>;
}

// Kept on globalThis so the dev server's module reloads share one hub.
const g = globalThis as unknown as { __smarttbLive?: Hub };
const hub: Hub = (g.__smarttbLive ??= { listeners: new Set(), presence: new Map(), names: new Map() });

export const PRESENCE_TTL_MS = 45_000;

export function subscribe(fn: Listener): () => void {
  hub.listeners.add(fn);
  return () => {
    hub.listeners.delete(fn);
  };
}

function emit(e: LiveEvent) {
  for (const fn of hub.listeners) {
    try {
      fn(e);
    } catch {
      /* one broken connection must not stop the others */
    }
  }
}

async function nameOf(userId: string | null): Promise<string> {
  if (!userId) return '';
  const hit = hub.names.get(userId);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.name;
  const row = await reader.findOne<{ display_name: string }>('app_users', { _id: userId as never }, { projection: { display_name: 1 } }).catch(() => null);
  const name = row?.display_name ?? '';
  hub.names.set(userId, { name, at: Date.now() });
  return name;
}

const SPECIFIC: Record<ParticipantChange, number> = { changed: 0, photo: 1, created: 2, reopened: 3, locked: 3, discontinued: 4 };

/** Called by withTransaction once the transaction has committed. One event per participant (the most telling one). */
export async function publishCommitted(events: PendingEvent[], actor: string | null): Promise<void> {
  if (!events.length || !hub.listeners.size) return;
  const byUid = new Map<string, Extract<PendingEvent, { type: 'participant' }>>();
  const accounts = new Set<string>();
  for (const e of events) {
    if (e.type === 'account') {
      accounts.add(e.userId);
      continue;
    }
    const prev = byUid.get(e.uid);
    if (!prev || SPECIFIC[e.kind] > SPECIFIC[prev.kind] || (SPECIFIC[e.kind] === SPECIFIC[prev.kind] && e.module != null)) byUid.set(e.uid, e);
  }
  const by = await nameOf(actor);
  for (const e of byUid.values()) emit({ type: 'participant', uid: e.uid, module: e.module ?? null, kind: e.kind, byId: actor, by });
  for (const userId of accounts) emit({ type: 'account', userId });
}

// --- presence --------------------------------------------------------------------------------------------------

function editorsOf(uid: string): Editor[] {
  const now = Date.now();
  const map = hub.presence.get(uid);
  if (!map) return [];
  for (const [id, ed] of map) if (now - ed.at > PRESENCE_TTL_MS) map.delete(id);
  if (!map.size) hub.presence.delete(uid);
  return [...map.values()].map(({ userId, name, role, module }) => ({ userId, name, role, module }));
}

/** Someone has a module open for entry (sent every ~20 s while it is), or has left it (`module` null). */
export function setPresence(uid: string, user: { id: string; name: string; roleLabel: string }, module: number | null) {
  let map = hub.presence.get(uid);
  const before = JSON.stringify(editorsOf(uid));
  if (module === null) map?.delete(user.id);
  else {
    if (!map) hub.presence.set(uid, (map = new Map()));
    map.set(user.id, { userId: user.id, name: user.name, role: user.roleLabel, module, at: Date.now() });
  }
  const editors = editorsOf(uid);
  if (JSON.stringify(editors) !== before) emit({ type: 'presence', uid, editors });
  ensureSweeper();
}

/** Who has modules of this participant open right now. */
export function presenceOf(uid: string): Editor[] {
  return editorsOf(uid);
}

/** Every participant someone is working on, for a screen that has just connected. */
export function allPresence(): { uid: string; editors: Editor[] }[] {
  return [...hub.presence.keys()].map((uid) => ({ uid, editors: editorsOf(uid) })).filter((p) => p.editors.length);
}

/** Drops people whose screen stopped saying it is open (closed the lid, lost signal) and tells the others. */
function ensureSweeper() {
  if (hub.sweeper) return;
  hub.sweeper = setInterval(() => {
    for (const uid of [...hub.presence.keys()]) {
      const map = hub.presence.get(uid)!;
      const n = map.size;
      const editors = editorsOf(uid);
      if (editors.length !== n) emit({ type: 'presence', uid, editors });
    }
  }, 15_000);
  hub.sweeper.unref?.();
}
