import { randomBytes } from 'node:crypto';
import type { PoolClient } from 'pg';
import { ApiError } from './participants';
import { ROLE_KEYS, ROLE_LABELS, ROLE_SUMMARY, isRoleKey, roleModules } from '../data/roles';
import { MODULES } from '../data/modules';
import type { ModuleId } from '../types/crf';
import type { RoleInfo } from '../types/roles';

type Queryable = Pick<PoolClient, 'query'>;

/** Only the PI and the data manager shape the list of roles. */
export function assertRoleManager(actor: { role: string }) {
  if (actor.role !== 'pi' && actor.role !== 'data_manager') throw new ApiError(403, 'Only the PI and the data manager can add or remove roles');
}

function summarise(modules: ModuleId[]): string {
  if (!modules.length) return 'Can view study data; does not enter any module';
  return `Enters ${modules.map((m) => `Module ${m}`).join(', ')}`;
}

/** Built-in roles first, then custom ones by name. Removed roles are left out. */
export async function listRoles(q: Queryable): Promise<RoleInfo[]> {
  const custom = await q.query<{ key: string; label: string; description: string; modules: number[] }>(
    'select key, label, description, modules from roles where deleted_at is null and not builtin order by lower(label)',
  );
  const counts = await q.query<{ role: string; n: number }>('select role, count(*)::int as n from app_users group by role');
  const members = (key: string) => counts.rows.find((c) => c.role === key)?.n ?? 0;
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
    ...custom.rows.map<RoleInfo>((r) => ({
      key: r.key,
      label: r.label,
      description: r.description || summarise(r.modules as ModuleId[]),
      builtin: false,
      modules: r.modules as ModuleId[],
      members: members(r.key),
    })),
  ];
}

/** Names of custom roles, removed ones included, so the history of an old account still reads properly. */
export async function customRoleLabels(q: Queryable): Promise<Record<string, string>> {
  const { rows } = await q.query<{ key: string; label: string }>('select key, label from roles where not builtin');
  return Object.fromEntries(rows.map((r) => [r.key, r.label]));
}

/** A role that exists and has not been removed. */
export async function cleanRole(q: Queryable, raw: unknown): Promise<string> {
  if (typeof raw === 'string' && isRoleKey(raw)) return raw;
  if (typeof raw === 'string') {
    const { rowCount } = await q.query('select 1 from roles where key = $1 and deleted_at is null', [raw]);
    if (rowCount) return raw;
  }
  throw new ApiError(400, 'Choose a valid role');
}

/** What a signed-in person's role allows: its label and the modules it may fill in. */
export async function roleAccess(q: Queryable, key: string): Promise<{ label: string; modules: ModuleId[] }> {
  if (isRoleKey(key)) return { label: ROLE_LABELS[key], modules: roleModules(key) };
  const { rows } = await q.query<{ label: string; modules: number[] }>('select label, modules from roles where key = $1', [key]);
  return rows[0] ? { label: rows[0].label, modules: rows[0].modules as ModuleId[] } : { label: key, modules: [] };
}

export async function createRole(q: Queryable, actor: { id: string; role: string }, body: Record<string, unknown>): Promise<RoleInfo> {
  assertRoleManager(actor);
  const label = typeof body.label === 'string' ? body.label.trim().replace(/\s+/g, ' ') : '';
  if (label.length < 2 || label.length > 40) throw new ApiError(400, 'Give the role a name of 2 to 40 characters');
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  if (description.length > 140) throw new ApiError(400, 'Keep the description under 140 characters');
  if (!Array.isArray(body.modules)) throw new ApiError(400, 'Choose the modules this role fills in');
  const ids = new Set<number>();
  for (const m of body.modules) {
    if (!MODULES.some((d) => d.id === m)) throw new ApiError(400, 'Invalid module');
    ids.add(m as number);
  }
  const modules = [...ids].sort((a, b) => a - b);

  // The five built-in names are reserved too.
  if (Object.values(ROLE_LABELS).some((l) => l.toLowerCase() === label.toLowerCase())) throw new ApiError(409, 'A role with this name already exists');
  const key = `custom_${randomBytes(5).toString('hex')}`;
  try {
    await q.query('insert into roles (key, label, description, modules, created_by) values ($1, $2, $3, $4, $5)', [key, label, description, modules, actor.id]);
  } catch (err) {
    if ((err as { code?: string }).code === '23505') throw new ApiError(409, 'A role with this name already exists');
    throw err;
  }
  return { key, label, description: description || summarise(modules as ModuleId[]), builtin: false, modules: modules as ModuleId[], members: 0 };
}

/** Changes which modules a custom role fills in. Takes effect at the holders' next request. */
export async function updateRoleModules(q: Queryable, actor: { id: string; role: string }, key: string, raw: unknown): Promise<void> {
  assertRoleManager(actor);
  if (isRoleKey(key)) throw new ApiError(409, 'The built-in roles cannot be changed');
  if (!Array.isArray(raw)) throw new ApiError(400, 'Choose the modules this role fills in');
  const ids = new Set<number>();
  for (const m of raw) {
    if (!MODULES.some((d) => d.id === m)) throw new ApiError(400, 'Invalid module');
    ids.add(m as number);
  }
  const { rowCount } = await q.query('update roles set modules = $2 where key = $1 and deleted_at is null', [key, [...ids].sort((a, b) => a - b)]);
  if (!rowCount) throw new ApiError(404, 'Role not found');
}

/** Removes a custom role. Refused while anyone still holds it, so nobody is left without a valid role. */
export async function deleteRole(q: Queryable, actor: { id: string; role: string }, key: string): Promise<void> {
  assertRoleManager(actor);
  if (isRoleKey(key)) throw new ApiError(409, 'The built-in roles cannot be removed');
  const { rows } = await q.query<{ label: string }>('select label from roles where key = $1 and deleted_at is null for update', [key]);
  if (!rows[0]) throw new ApiError(404, 'Role not found');
  const held = await q.query<{ n: number }>('select count(*)::int as n from app_users where role = $1', [key]);
  const n = held.rows[0].n;
  if (n > 0) {
    throw new ApiError(409, `${n} ${n === 1 ? 'person has' : 'people have'} the role “${rows[0].label}”. Move them to another role first.`);
  }
  await q.query('update roles set deleted_at = now(), deleted_by = $2 where key = $1', [key, actor.id]);
}
