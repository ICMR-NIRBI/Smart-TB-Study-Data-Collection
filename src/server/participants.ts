import type { PoolClient } from 'pg';
import { canCompleteModule, canDiscontinue, canEnroll, canEnterModule, canReopenModule, canSeeContacts, type Actor } from '../data/roles';
import { evaluateEligibility } from '../utils/clinical';
import { getAccess, isIneligible, isRecordLocked, strictAccess } from '../utils/gating';
import { ALL_MODULE_IDS, createUid, emptyCrf, emptyMeta, moduleKey } from '../utils/participant';
import { validateModule } from '../utils/validation';
import type { CrfData, M10Reason, ModuleId, ModuleMeta, Participant } from '../types/crf';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export interface ActingUser extends Actor {
  id: string;
  name: string;
  roleLabel: string;
}

type Queryable = Pick<PoolClient, 'query'>;

const CONTACT_FIELDS = ['phone', 'address'] as const;

function encKey(): string {
  const key = process.env.CONTACT_ENC_KEY;
  if (!key || key.length < 32) throw new Error('CONTACT_ENC_KEY must be set (at least 32 characters) — see web/.env.example');
  return key;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

interface ModuleRow {
  participant_uid: string;
  module_id: number;
  data: Record<string, unknown>;
  completed: boolean;
  completed_by_name: string;
  completed_role: string;
  completed_at: Date | null;
  editing: boolean;
  draft_saved_at: Date | null;
}

/** Loads participants in the app's shape; phone and address are blanked unless `actor` may see them. */
export async function loadParticipants(q: Queryable, actor: Actor, uids?: string[]): Promise<Participant[]> {
  const filter = uids ?? null;
  // Sequential on purpose: `q` may be a single transaction client, which runs one query at a time.
  const ps = await q.query<{ uid: string; discontinuation_requested: boolean; created_at: Date; updated_at: Date }>(
    'select * from participants where ($1::text[] is null or uid = any($1)) order by updated_at desc',
    [filter],
  );
  const mods = await q.query<ModuleRow>('select * from crf_modules where ($1::text[] is null or participant_uid = any($1))', [filter]);
  const edits = await q.query<{ participant_uid: string; module_id: number; at: Date; by_name: string; role: string; reason: string }>(
    'select * from module_edit_reasons where ($1::text[] is null or participant_uid = any($1)) order by at',
    [filter],
  );
  const modByKey = new Map(mods.rows.map((m) => [`${m.participant_uid}|${m.module_id}`, m]));
  const editsByKey = new Map<string, ModuleMeta['edits']>();
  for (const e of edits.rows) {
    const k = `${e.participant_uid}|${e.module_id}`;
    editsByKey.set(k, [...(editsByKey.get(k) ?? []), { at: e.at.toISOString(), by: e.by_name, role: e.role, reason: e.reason }]);
  }

  const participants: Participant[] = ps.rows.map((row) => {
    const template = emptyCrf();
    const data = {} as CrfData;
    const meta = {} as Record<ModuleId, ModuleMeta>;
    ALL_MODULE_IDS.forEach((id) => {
      const key = moduleKey(id);
      const m = modByKey.get(`${row.uid}|${id}`);
      (data as unknown as Record<string, unknown>)[key] = { ...template[key], ...(m?.data ?? {}) };
      meta[id] = {
        ...emptyMeta(),
        completed: m?.completed ?? false,
        completedBy: m?.completed_by_name ?? '',
        completedRole: m?.completed_role ?? '',
        completedAt: m?.completed_at?.toISOString() ?? '',
        editing: m?.editing ?? false,
        draftSavedAt: m?.draft_saved_at?.toISOString() ?? '',
        edits: editsByKey.get(`${row.uid}|${id}`) ?? [],
      };
    });
    const showContacts = canSeeContacts(actor, meta[1]);
    return {
      uid: row.uid,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      discontinuationRequested: row.discontinuation_requested,
      data,
      meta,
      ...(showContacts ? {} : { contactsHidden: true }),
    };
  });

  // Decrypt phone and address only for the records this user may see; the rest stay blank (from the template).
  const visible = participants.filter((p) => !p.contactsHidden).map((p) => p.uid);
  if (visible.length) {
    const contacts = await q.query<{ participant_uid: string; phone: string | null; address: string | null }>(
      `select participant_uid, pgp_sym_decrypt(phone_enc, $2) as phone, pgp_sym_decrypt(address_enc, $2) as address
         from participant_contacts where participant_uid = any($1)`,
      [visible, encKey()],
    );
    const byUid = new Map(contacts.rows.map((c) => [c.participant_uid, c]));
    for (const p of participants) {
      const c = byUid.get(p.uid);
      if (c) p.data.m1 = { ...p.data.m1, phone: c.phone ?? '', address: c.address ?? '' };
    }
  }
  return participants;
}

/** Full record (contacts included) for server-side checks, with the participant row locked for this transaction. */
async function loadForUpdate(q: Queryable, uid: string): Promise<Participant> {
  const lock = await q.query('select uid from participants where uid = $1 for update', [uid]);
  if (!lock.rowCount) throw new ApiError(404, 'Participant not found');
  const [p] = await loadParticipants(q, { role: 'pi', isAdmin: true, delegations: [] }, [uid]);
  return p;
}

async function loadOne(q: Queryable, actor: Actor, uid: string): Promise<Participant> {
  const [p] = await loadParticipants(q, actor, [uid]);
  if (!p) throw new ApiError(404, 'Participant not found');
  return p;
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

async function writeContacts(q: Queryable, uid: string, userId: string | null, contacts: { phone?: string; address?: string }) {
  await q.query(
    `insert into participant_contacts (participant_uid, phone_enc, address_enc, updated_by)
       values ($1, pgp_sym_encrypt(coalesce($2, ''), $4), pgp_sym_encrypt(coalesce($3, ''), $4), $5)
     on conflict (participant_uid) do update set
       phone_enc   = case when $2::text is null then participant_contacts.phone_enc else excluded.phone_enc end,
       address_enc = case when $3::text is null then participant_contacts.address_enc else excluded.address_enc end,
       updated_at  = now(),
       updated_by  = excluded.updated_by`,
    [uid, contacts.phone ?? null, contacts.address ?? null, encKey(), userId],
  );
}

function stripContacts(m1: Record<string, unknown>) {
  const rest = { ...m1 };
  CONTACT_FIELDS.forEach((f) => delete rest[f]);
  return rest;
}

/** Inserts a complete participant record as-is (used by the seed script). */
export async function insertParticipant(q: Queryable, p: Participant, userIdsByName: Record<string, string>, createdBy: string | null) {
  await q.query(
    'insert into participants (uid, discontinuation_requested, created_at, created_by, updated_at) values ($1, $2, $3, $4, $5)',
    [p.uid, p.discontinuationRequested, p.createdAt, createdBy, p.updatedAt],
  );
  for (const id of ALL_MODULE_IDS) {
    const key = moduleKey(id);
    const m = p.meta[id];
    const data = id === 1 ? stripContacts(p.data.m1 as unknown as Record<string, unknown>) : p.data[key];
    await q.query(
      `insert into crf_modules (participant_uid, module_id, data, completed, completed_by, completed_by_name, completed_role,
                                completed_at, editing, draft_saved_at, updated_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        p.uid, id, JSON.stringify(data), m.completed, userIdsByName[m.completedBy] ?? null, m.completedBy, m.completedRole,
        m.completedAt || null, m.editing, m.draftSavedAt || null, createdBy,
      ],
    );
    for (const e of m.edits) {
      await q.query(
        'insert into module_edit_reasons (participant_uid, module_id, at, user_id, by_name, role, reason) values ($1, $2, $3, $4, $5, $6, $7)',
        [p.uid, id, e.at, userIdsByName[e.by] ?? null, e.by, e.role, e.reason],
      );
    }
  }
  await writeContacts(q, p.uid, createdBy, { phone: p.data.m1.phone, address: p.data.m1.address });
}

export async function createParticipant(q: Queryable, user: ActingUser): Promise<Participant> {
  if (!canEnroll(user)) throw new ApiError(403, 'Your role cannot enroll participants');
  const uid = createUid();
  const template = emptyCrf();
  await q.query('insert into participants (uid, created_by) values ($1, $2)', [uid, user.id]);
  for (const id of ALL_MODULE_IDS) {
    const key = moduleKey(id);
    const data = id === 1 ? stripContacts(template.m1 as unknown as Record<string, unknown>) : template[key];
    await q.query('insert into crf_modules (participant_uid, module_id, data, updated_by) values ($1, $2, $3, $4)', [
      uid, id, JSON.stringify(data), user.id,
    ]);
  }
  await writeContacts(q, uid, user.id, { phone: '', address: '' });
  return loadOne(q, user, uid);
}

/** Keeps only known fields whose value has the same shape as the empty CRF template. */
function sanitizePatch(id: ModuleId, patch: unknown): Record<string, unknown> {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new ApiError(400, 'Invalid update');
  const template = emptyCrf()[moduleKey(id)] as unknown as Record<string, unknown>;
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in template)) throw new ApiError(400, `Unknown field: ${k}`);
    const t = template[k];
    const sameShape = Array.isArray(t) ? Array.isArray(v) : typeof v === typeof t && (v === null) === (t === null);
    if (!sameShape) throw new ApiError(400, `Invalid value for ${k}`);
    clean[k] = v;
  }
  return clean;
}

function assertEditable(p: Participant, user: ActingUser, id: ModuleId) {
  const access = getAccess(p, id); // preview mode lets staff fill later modules ahead of time; locking stays strict
  const meta = p.meta[id];
  const open = access === 'current' || access === 'open' || (access === 'complete' && meta.editing);
  if (!open || (meta.completed && !meta.editing) || (isRecordLocked(p) && !(id === 10 && meta.editing))) {
    throw new ApiError(409, `Module ${id} is locked`);
  }
  if (!canEnterModule(user, id) && !(meta.editing && canReopenModule(user, id))) {
    throw new ApiError(403, `Your role cannot enter Module ${id}`);
  }
}

async function touch(q: Queryable, uid: string) {
  await q.query('update participants set updated_at = now() where uid = $1', [uid]);
}

export async function patchModule(q: Queryable, user: ActingUser, uid: string, id: ModuleId, rawPatch: unknown): Promise<void> {
  const p = await loadForUpdate(q, uid);
  assertEditable(p, user, id);
  const patch = sanitizePatch(id, rawPatch);

  if (id === 1) {
    const contacts: { phone?: string; address?: string } = {};
    CONTACT_FIELDS.forEach((f) => {
      if (f in patch) contacts[f] = String(patch[f]);
      delete patch[f];
    });
    if (Object.keys(contacts).length) await writeContacts(q, uid, user.id, contacts);
  }

  if (Object.keys(patch).length) {
    try {
      await q.query(
        `update crf_modules set data = data || $3::jsonb, updated_at = now(), updated_by = $4
          where participant_uid = $1 and module_id = $2`,
        [uid, id, JSON.stringify(patch), user.id],
      );
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw new ApiError(409, 'This Participant ID is already in use');
      throw err;
    }
  }
  await touch(q, uid);
}

export async function saveDraft(q: Queryable, user: ActingUser, uid: string, id: ModuleId): Promise<Participant> {
  const p = await loadForUpdate(q, uid);
  assertEditable(p, user, id);
  await q.query('update crf_modules set draft_saved_at = now(), updated_by = $3 where participant_uid = $1 and module_id = $2', [
    uid, id, user.id,
  ]);
  await touch(q, uid);
  return loadOne(q, user, uid);
}

export async function completeModule(q: Queryable, user: ActingUser, uid: string, id: ModuleId): Promise<Participant> {
  const p = await loadForUpdate(q, uid);
  const meta = p.meta[id];
  const access = strictAccess(p, id);
  if (!(access === 'current' || access === 'open' || (access === 'complete' && meta.editing))) {
    throw new ApiError(409, `Complete the earlier modules before locking Module ${id}`);
  }
  if (!canCompleteModule(user, id) && !(meta.editing && canReopenModule(user, id))) {
    throw new ApiError(403, id === 2 || id === 10 ? 'Only the PI can sign off this module' : `Your role cannot lock Module ${id}`);
  }
  const errors = validateModule(id, p);
  if (Object.keys(errors).length) throw new ApiError(422, 'Some fields need attention before locking', errors);

  await q.query(
    `update crf_modules set
        completed = true, editing = false,
        completed_by      = coalesce(completed_by, $3),
        completed_by_name = case when completed_by_name = '' then $4 else completed_by_name end,
        completed_role    = case when completed_role = '' then $5 else completed_role end,
        completed_at      = coalesce(completed_at, now()),
        updated_at = now(), updated_by = $3
      where participant_uid = $1 and module_id = $2`,
    [uid, id, user.id, user.name, user.roleLabel],
  );

  // A failed eligibility check closes the participant out as a screen failure (Module 2 data is unchanged by locking).
  if (id === 2 && evaluateEligibility(p.data.m2).eligible === false) {
    await q.query(
      `update crf_modules set data = data || '{"status": "discontinued", "reason": "screen_failure"}'::jsonb, updated_by = $2
        where participant_uid = $1 and module_id = 10`,
      [uid, user.id],
    );
  }
  await touch(q, uid);
  return loadOne(q, user, uid);
}

/** Reopens a locked module. The reason is stored and attached to every audited change in this transaction. */
export async function reopenModule(q: Queryable, user: ActingUser, uid: string, id: ModuleId, reasonRaw: unknown): Promise<Participant> {
  const reason = typeof reasonRaw === 'string' ? reasonRaw.trim() : '';
  if (!reason) throw new ApiError(400, 'A reason is required to edit a locked module');
  const p = await loadForUpdate(q, uid);
  if (!p.meta[id].completed) throw new ApiError(409, `Module ${id} is not locked`);
  if (isRecordLocked(p) && id !== 10) throw new ApiError(409, 'The record is closed');
  if (!canReopenModule(user, id)) throw new ApiError(403, `Your role cannot edit Module ${id}`);

  await q.query(
    'insert into module_edit_reasons (participant_uid, module_id, user_id, by_name, role, reason) values ($1, $2, $3, $4, $5, $6)',
    [uid, id, user.id, user.name, user.roleLabel, reason],
  );
  await q.query('update crf_modules set editing = true, updated_by = $3 where participant_uid = $1 and module_id = $2', [uid, id, user.id]);
  await touch(q, uid);
  return loadOne(q, user, uid);
}

const M10_REASONS: M10Reason[] = ['withdrawal', 'toxicity', 'resistance', 'ltfu', 'death', 'screen_failure'];

export async function discontinue(q: Queryable, user: ActingUser, uid: string, reasonRaw: unknown): Promise<Participant> {
  if (!canDiscontinue(user)) throw new ApiError(403, 'Your role cannot discontinue participants');
  const p = await loadForUpdate(q, uid);
  if (isRecordLocked(p) || isIneligible(p) || p.discontinuationRequested) throw new ApiError(409, 'This participant cannot be discontinued');
  const reason = M10_REASONS.includes(reasonRaw as M10Reason) ? (reasonRaw as M10Reason) : p.data.m10.reason;

  await q.query('update participants set discontinuation_requested = true where uid = $1', [uid]);
  await q.query(
    `update crf_modules set data = data || jsonb_build_object('status', 'discontinued', 'reason', $2::text), updated_by = $3
      where participant_uid = $1 and module_id = 10`,
    [uid, reason, user.id],
  );
  await touch(q, uid);
  return loadOne(q, user, uid);
}

/** The latest reopen reason for a module being edited, so audited field changes carry it. */
export async function currentEditReason(q: Queryable, uid: string, id: ModuleId): Promise<string | undefined> {
  const { rows } = await q.query<{ reason: string }>(
    `select r.reason from module_edit_reasons r
       join crf_modules m on m.participant_uid = r.participant_uid and m.module_id = r.module_id and m.editing
      where r.participant_uid = $1 and r.module_id = $2
      order by r.at desc limit 1`,
    [uid, id],
  );
  return rows[0]?.reason;
}
