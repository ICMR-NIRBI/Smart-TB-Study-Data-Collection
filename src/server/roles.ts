import { randomBytes } from 'node:crypto';
import { ApiError } from './errors';
import { isDuplicateKey } from './mongo/client';
import type { Reads, Tx } from './mongo/tx';
import { ROLE_KEYS, ROLE_LABELS, ROLE_SUMMARY, isRoleKey, roleModules } from '../data/roles';
import { MODULES } from '../data/modules';
import type { ModuleId } from '../types/crf';
import type { RoleInfo } from '../types/roles';

interface RoleDoc {
  _id: string;
  label: string;
  description: string;
  builtin: boolean;
  modules: number[];
  created_by: string | null;
  created_at: Date;
  deleted_at: Date | null;
  deleted_by: string | null;
}

/** Only the PI and the data manager shape the list of roles. */
export function assertRoleManager(actor: { role: string }) {
  if (actor.role !== 'pi' && actor.role !== 'data_manager') throw new ApiError(403, 'Only the PI and the data manager can add or remove roles');
}

function summarise(modules: ModuleId[]): string {
  if (!modules.length) return 'Can view study data; does not enter any module';
  return `Enters ${modules.map((m) => `Module ${m}`).join(', ')}`;
}

/** Built-in roles first, then custom ones by name. Removed roles are left out. */
export async function listRoles(q: Reads): Promise<RoleInfo[]> {
  const custom = (await q.find<RoleDoc>('roles', { builtin: false, deleted_at: null })).sort((a, b) => a.label.toLowerCase().localeCompare(b.label.toLowerCase()));
  const held = new Map<string, number>();
  for (const u of await q.find<{ role: string }>('app_users', {}, { projection: { role: 1 } })) held.set(u.role, (held.get(u.role) ?? 0) + 1);
  const members = (key: string) => held.get(key) ?? 0;
  const builtIn = ROLE_KEYS.map<RoleInfo>((key) => ({
    key,
    label: ROLE_LABELS[key],
    description: ROLE_SUMMARY[key],
    builtin: true,
    modules: roleModules(key),
    members: members(key),
  }));
  return [
    ...builtIn,
    ...custom.map<RoleInfo>((r) => ({
      key: r._id,
      label: r.label,
      description: r.description || summarise(r.modules as ModuleId[]),
      builtin: false,
      modules: r.modules as ModuleId[],
      members: members(r._id),
    })),
  ];
}

/** Names of custom roles, removed ones included, so the history of an old account still reads properly. */
export async function customRoleLabels(q: Reads): Promise<Record<string, string>> {
  const rows = await q.find<RoleDoc>('roles', { builtin: false }, { projection: { label: 1 } });
  return Object.fromEntries(rows.map((r) => [r._id, r.label]));
}

/**
 * A role that exists and has not been removed. For a custom role this also takes that role's lock, so assigning it and
 * removing it at the same moment cannot both succeed (PostgreSQL's foreign key used to guarantee this).
 */
export async function cleanRole(tx: Tx, raw: unknown): Promise<string> {
  if (typeof raw === 'string' && isRoleKey(raw)) return raw;
  if (typeof raw === 'string') {
    await tx.lock(`role:${raw}`);
    if (await tx.findOne('roles', { _id: raw as never, deleted_at: null })) return raw;
  }
  throw new ApiError(400, 'Choose a valid role');
}

/** What a signed-in person's role allows: its label and the modules it may fill in. */
export async function roleAccess(q: Reads, key: string): Promise<{ label: string; modules: ModuleId[] }> {
  if (isRoleKey(key)) return { label: ROLE_LABELS[key], modules: roleModules(key) };
  const row = await q.findOne<RoleDoc>('roles', { _id: key as never }, { projection: { label: 1, modules: 1 } });
  return row ? { label: row.label, modules: row.modules as ModuleId[] } : { label: key, modules: [] };
}

function cleanModules(raw: unknown): ModuleId[] {
  if (!Array.isArray(raw)) throw new ApiError(400, 'Choose the modules this role fills in');
  const ids = new Set<number>();
  for (const m of raw) {
    if (!MODULES.some((d) => d.id === m)) throw new ApiError(400, 'Invalid module');
    ids.add(m as number);
  }
  return [...ids].sort((a, b) => a - b) as ModuleId[];
}

export async function createRole(tx: Tx, actor: { id: string; role: string }, body: Record<string, unknown>): Promise<RoleInfo> {
  assertRoleManager(actor);
  const label = typeof body.label === 'string' ? body.label.trim().replace(/\s+/g, ' ') : '';
  if (label.length < 2 || label.length > 40) throw new ApiError(400, 'Give the role a name of 2 to 40 characters');
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  if (description.length > 140) throw new ApiError(400, 'Keep the description under 140 characters');
  const modules = cleanModules(body.modules);

  // The five built-in names are reserved too.
  if (Object.values(ROLE_LABELS).some((l) => l.toLowerCase() === label.toLowerCase())) throw new ApiError(409, 'A role with this name already exists');
  const key = `custom_${randomBytes(5).toString('hex')}`;
  try {
    await tx.insertOne('roles', { _id: key, label, description, builtin: false, modules, created_by: actor.id, created_at: new Date(), deleted_at: null, deleted_by: null });
  } catch (err) {
    if (isDuplicateKey(err)) throw new ApiError(409, 'A role with this name already exists');
    throw err;
  }
  return { key, label, description: description || summarise(modules), builtin: false, modules, members: 0 };
}

/** Changes which modules a custom role fills in. Takes effect at the holders' next request. */
export async function updateRoleModules(tx: Tx, actor: { id: string; role: string }, key: string, raw: unknown): Promise<void> {
  assertRoleManager(actor);
  if (isRoleKey(key)) throw new ApiError(409, 'The built-in roles cannot be changed');
  const modules = cleanModules(raw);
  const updated = await tx.updateOne('roles', { _id: key as never, deleted_at: null }, { $set: { modules } });
  if (!updated) throw new ApiError(404, 'Role not found');
}

/** Removes a custom role. Refused while anyone still holds it, so nobody is left without a valid role. */
export async function deleteRole(tx: Tx, actor: { id: string; role: string }, key: string): Promise<void> {
  assertRoleManager(actor);
  if (isRoleKey(key)) throw new ApiError(409, 'The built-in roles cannot be removed');
  await tx.lock(`role:${key}`);
  const role = await tx.findOne<RoleDoc>('roles', { _id: key as never, deleted_at: null });
  if (!role) throw new ApiError(404, 'Role not found');
  const n = await tx.count('app_users', { role: key });
  if (n > 0) {
    throw new ApiError(409, `${n} ${n === 1 ? 'person has' : 'people have'} the role “${role.label}”. Move them to another role first.`);
  }
  await tx.updateOne('roles', { _id: key as never }, { $set: { deleted_at: new Date(), deleted_by: actor.id } });
}
