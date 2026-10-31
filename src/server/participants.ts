import type { Binary } from 'mongodb';
import { canCompleteModule, canDiscontinue, canEnroll, canEnterModule, canReopenModule, canSeeContacts, type Actor } from '../data/roles';
import { evaluateEligibility } from '../utils/clinical';
import { getAccess, isIneligible, isRecordLocked, strictAccess } from '../utils/gating';
import { ALL_MODULE_IDS, createUid, emptyCrf, emptyMeta, moduleKey } from '../utils/participant';
import { validateModule } from '../utils/validation';
import { MIN_EDIT_REASON_LENGTH } from '../utils/accountRules';
import type { CrfData, M10Reason, ModuleId, ModuleMeta, Participant } from '../types/crf';
import { decryptContact, encryptContact } from './contactCrypto';
import { isDuplicateKey } from './mongo/client';
import type { Reads, Tx } from './mongo/tx';

import { ApiError } from './errors';
export { ApiError };

export interface ActingUser extends Actor {
  id: string;
  name: string;
  roleLabel: string;
}

const CONTACT_FIELDS = ['phone', 'address'] as const;

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

interface ParticipantDoc {
  _id: string;
  discontinuation_requested: boolean;
  created_at: Date;
  created_by: string | null;
  updated_at: Date;
}

interface ModuleDoc {
  _id: string;
  participant_uid: string;
  module_id: number;
  data: Record<string, unknown>;
  completed: boolean;
  completed_by: string | null;
  completed_by_name: string;
  completed_role: string;
  completed_at: Date | null;
  editing: boolean;
  draft_saved_at: Date | null;
  updated_at: Date;
  updated_by: string | null;
}

interface EditDoc {
  participant_uid: string;
  module_id: number;
  at: Date;
  by_name: string;
  role: string;
  reason: string;
}

interface ContactDoc {
  _id: string;
  phone_enc: Binary | null;
  address_enc: Binary | null;
}

/** Loads participants in the app's shape; phone and address are blanked unless `actor` may see them. */
export async function loadParticipants(q: Reads, actor: Actor, uids?: string[]): Promise<Participant[]> {
  const byUid = uids ? { _id: { $in: uids } as never } : {};
  const ofUid = uids ? { participant_uid: { $in: uids } } : {};
  const ps = await q.find<ParticipantDoc>('participants', byUid, { sort: { updated_at: -1 } });
  const mods = await q.find<ModuleDoc>('crf_modules', ofUid);
  const edits = await q.find<EditDoc>('module_edit_reasons', ofUid, { sort: { at: 1, _id: 1 } });
  const modByKey = new Map(mods.map((m) => [`${m.participant_uid}|${m.module_id}`, m]));
  const editsByKey = new Map<string, ModuleMeta['edits']>();
  for (const e of edits) {
    const k = `${e.participant_uid}|${e.module_id}`;
    editsByKey.set(k, [...(editsByKey.get(k) ?? []), { at: e.at.toISOString(), by: e.by_name, role: e.role, reason: e.reason }]);
  }

  const participants: Participant[] = ps.map((row) => {
    const template = emptyCrf();
    const data = {} as CrfData;
    const meta = {} as Record<ModuleId, ModuleMeta>;
    ALL_MODULE_IDS.forEach((id) => {
      const key = moduleKey(id);
      const m = modByKey.get(`${row._id}|${id}`);
      (data as unknown as Record<string, unknown>)[key] = { ...template[key], ...(m?.data ?? {}) };
      meta[id] = {
        ...emptyMeta(),
        completed: m?.completed ?? false,
        completedBy: m?.completed_by_name ?? '',
        completedRole: m?.completed_role ?? '',
        completedAt: m?.completed_at?.toISOString() ?? '',
        editing: m?.editing ?? false,
        draftSavedAt: m?.draft_saved_at?.toISOString() ?? '',
        edits: editsByKey.get(`${row._id}|${id}`) ?? [],
      };
    });
    const showContacts = canSeeContacts(actor, meta[1]);
    return {
      uid: row._id,
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
    const contacts = new Map((await q.find<ContactDoc>('participant_contacts', { _id: { $in: visible } as never })).map((c) => [c._id, c]));
    for (const p of participants) {
      const c = contacts.get(p.uid);
      if (c) p.data.m1 = { ...p.data.m1, phone: decryptContact(c.phone_enc, p.uid, 'phone'), address: decryptContact(c.address_enc, p.uid, 'address') };
    }
  }
  return participants;
}

/** Full record (contacts included) for server-side checks, with this participant locked for the transaction. */
async function loadForUpdate(tx: Tx, uid: string): Promise<Participant> {
  await tx.lock(`participant:${uid}`);
  if (!(await tx.findOne('participants', { _id: uid as never }, { projection: { _id: 1 } }))) throw new ApiError(404, 'Participant not found');
  const [p] = await loadParticipants(tx, { role: 'pi', isAdmin: true, delegations: [] }, [uid]);
  return p;
}

async function loadOne(q: Reads, actor: Actor, uid: string): Promise<Participant> {
  const [p] = await loadParticipants(q, actor, [uid]);
  if (!p) throw new ApiError(404, 'Participant not found');
  return p;
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/** Stores phone and/or address (encrypted). A field that is not given keeps its stored value. */
async function writeContacts(tx: Tx, uid: string, userId: string | null, contacts: { phone?: string; address?: string }) {
  const now = new Date();
  const existing = await tx.findOne('participant_contacts', { _id: uid as never }, { projection: { _id: 1 } });
  if (!existing) {
    await tx.insertOne('participant_contacts', {
      _id: uid,
      participant_uid: uid,
      phone_enc: encryptContact(contacts.phone ?? '', uid, 'phone'),
      address_enc: encryptContact(contacts.address ?? '', uid, 'address'),
      updated_at: now,
      updated_by: userId,
    });
    return;
  }
  const set: Record<string, unknown> = { updated_at: now, updated_by: userId };
  if (contacts.phone !== undefined) set.phone_enc = encryptContact(contacts.phone, uid, 'phone');
  if (contacts.address !== undefined) set.address_enc = encryptContact(contacts.address, uid, 'address');
  await tx.updateOne('participant_contacts', { _id: uid as never }, { $set: set });
}

function stripContacts(m1: Record<string, unknown>) {
  const rest = { ...m1 };
  CONTACT_FIELDS.forEach((f) => delete rest[f]);
  return rest;
}

/** A module document as stored when nothing has been entered yet. */
function newModuleDoc(uid: string, id: ModuleId, data: unknown, userId: string | null, now: Date) {
  return {
    _id: `${uid}:${id}`,
    participant_uid: uid,
    module_id: id,
    data,
    completed: false,
    completed_by: null,
    completed_by_name: '',
    completed_role: '',
    completed_at: null,
    editing: false,
    draft_saved_at: null,
    updated_at: now,
    updated_by: userId,
  };
}

/** Inserts a complete participant record as-is (used by the seed script). */
export async function insertParticipant(tx: Tx, p: Participant, userIdsByName: Record<string, string>, createdBy: string | null) {
  await tx.insertOne('participants', {
    _id: p.uid,
    discontinuation_requested: p.discontinuationRequested,
    created_at: new Date(p.createdAt),
    created_by: createdBy,
    updated_at: new Date(p.updatedAt),
  });
  for (const id of ALL_MODULE_IDS) {
    const key = moduleKey(id);
    const m = p.meta[id];
    const data = id === 1 ? stripContacts(p.data.m1 as unknown as Record<string, unknown>) : p.data[key];
    await tx.insertOne('crf_modules', {
      ...newModuleDoc(p.uid, id, data, createdBy, new Date(p.updatedAt)),
      completed: m.completed,
      completed_by: userIdsByName[m.completedBy] ?? null,
      completed_by_name: m.completedBy,
      completed_role: m.completedRole,
      completed_at: m.completedAt ? new Date(m.completedAt) : null,
      editing: m.editing,
      draft_saved_at: m.draftSavedAt ? new Date(m.draftSavedAt) : null,
    });
    for (const e of m.edits) {
      await tx.insertOne('module_edit_reasons', { participant_uid: p.uid, module_id: id, at: new Date(e.at), user_id: userIdsByName[e.by] ?? null, by_name: e.by, role: e.role, reason: e.reason });
    }
  }
  await writeContacts(tx, p.uid, createdBy, { phone: p.data.m1.phone, address: p.data.m1.address });
}

export async function createParticipant(tx: Tx, user: ActingUser): Promise<Participant> {
  if (!canEnroll(user)) throw new ApiError(403, 'Your role cannot enroll participants');
  const uid = createUid();
  const template = emptyCrf();
  const now = new Date();
  await tx.insertOne('participants', { _id: uid, discontinuation_requested: false, created_at: now, created_by: user.id, updated_at: now });
  for (const id of ALL_MODULE_IDS) {
    const key = moduleKey(id);
    const data = id === 1 ? stripContacts(template.m1 as unknown as Record<string, unknown>) : template[key];
    await tx.insertOne('crf_modules', newModuleDoc(uid, id, data, user.id, now));
  }
  await writeContacts(tx, uid, user.id, { phone: '', address: '' });
  return loadOne(tx, user, uid);
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

async function touch(tx: Tx, uid: string) {
  await tx.updateOne('participants', { _id: uid as never }, { $set: { updated_at: new Date() } });
}

const moduleId = (uid: string, id: ModuleId) => `${uid}:${id}` as never;

export async function patchModule(tx: Tx, user: ActingUser, uid: string, id: ModuleId, rawPatch: unknown): Promise<void> {
  const p = await loadForUpdate(tx, uid);
  assertEditable(p, user, id);
  const patch = sanitizePatch(id, rawPatch);

  if (id === 1) {
    const contacts: { phone?: string; address?: string } = {};
    CONTACT_FIELDS.forEach((f) => {
      if (f in patch) contacts[f] = String(patch[f]);
      delete patch[f];
    });
    if (Object.keys(contacts).length) await writeContacts(tx, uid, user.id, contacts);
  }

  if (Object.keys(patch).length) {
    const set: Record<string, unknown> = { updated_at: new Date(), updated_by: user.id };
    for (const [k, v] of Object.entries(patch)) set[`data.${k}`] = v;
    try {
      await tx.updateOne('crf_modules', { _id: moduleId(uid, id) }, { $set: set });
    } catch (err) {
      if (isDuplicateKey(err)) throw new ApiError(409, 'This Participant ID is already in use');
      throw err;
    }
  }
  await touch(tx, uid);
}

export async function saveDraft(tx: Tx, user: ActingUser, uid: string, id: ModuleId): Promise<Participant> {
  const p = await loadForUpdate(tx, uid);
  assertEditable(p, user, id);
  await tx.updateOne('crf_modules', { _id: moduleId(uid, id) }, { $set: { draft_saved_at: new Date(), updated_by: user.id } });
  await touch(tx, uid);
  return loadOne(tx, user, uid);
}

export async function completeModule(tx: Tx, user: ActingUser, uid: string, id: ModuleId): Promise<Participant> {
  const p = await loadForUpdate(tx, uid);
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

  // Who locked it first stays on record: later re-locks after a correction do not replace the name.
  const mod = await tx.findOne<ModuleDoc>('crf_modules', { _id: moduleId(uid, id) });
  const now = new Date();
  await tx.updateOne(
    'crf_modules',
    { _id: moduleId(uid, id) },
    {
      $set: {
        completed: true,
        editing: false,
        completed_by: mod?.completed_by ?? user.id,
        completed_by_name: mod?.completed_by_name || user.name,
        completed_role: mod?.completed_role || user.roleLabel,
        completed_at: mod?.completed_at ?? now,
        updated_at: now,
        updated_by: user.id,
      },
    },
  );

  // A failed eligibility check closes the participant out as a screen failure (Module 2 data is unchanged by locking).
  if (id === 2 && evaluateEligibility(p.data.m2).eligible === false) {
    await tx.updateOne('crf_modules', { _id: moduleId(uid, 10) }, { $set: { 'data.status': 'discontinued', 'data.reason': 'screen_failure', updated_by: user.id } });
  }
  await touch(tx, uid);
  return loadOne(tx, user, uid);
}

/** Reopens a locked module. The reason is stored and attached to every audited change in this transaction. */
export async function reopenModule(tx: Tx, user: ActingUser, uid: string, id: ModuleId, reasonRaw: unknown): Promise<Participant> {
  const reason = typeof reasonRaw === 'string' ? reasonRaw.trim() : '';
  if (reason.length < MIN_EDIT_REASON_LENGTH) throw new ApiError(400, `Give a reason of at least ${MIN_EDIT_REASON_LENGTH} characters to edit a locked module`);
  const p = await loadForUpdate(tx, uid);
  if (!p.meta[id].completed) throw new ApiError(409, `Module ${id} is not locked`);
  if (isRecordLocked(p) && id !== 10) throw new ApiError(409, 'The record is closed');
  if (!canReopenModule(user, id)) throw new ApiError(403, `Your role cannot edit Module ${id}`);

  await tx.insertOne('module_edit_reasons', { participant_uid: uid, module_id: id, at: new Date(), user_id: user.id, by_name: user.name, role: user.roleLabel, reason });
  await tx.updateOne('crf_modules', { _id: moduleId(uid, id) }, { $set: { editing: true, updated_by: user.id } });
  await touch(tx, uid);
  return loadOne(tx, user, uid);
}

const M10_REASONS: M10Reason[] = ['withdrawal', 'toxicity', 'resistance', 'ltfu', 'death', 'screen_failure'];

export async function discontinue(tx: Tx, user: ActingUser, uid: string, reasonRaw: unknown): Promise<Participant> {
  if (!canDiscontinue(user)) throw new ApiError(403, 'Your role cannot discontinue participants');
  const p = await loadForUpdate(tx, uid);
  if (isRecordLocked(p) || isIneligible(p) || p.discontinuationRequested) throw new ApiError(409, 'This participant cannot be discontinued');
  const reason = M10_REASONS.includes(reasonRaw as M10Reason) ? (reasonRaw as M10Reason) : p.data.m10.reason;

  await tx.updateOne('participants', { _id: uid as never }, { $set: { discontinuation_requested: true } });
  await tx.updateOne('crf_modules', { _id: moduleId(uid, 10) }, { $set: { 'data.status': 'discontinued', 'data.reason': reason, updated_by: user.id } });
  await touch(tx, uid);
  return loadOne(tx, user, uid);
}

/** The latest reopen reason for a module being edited, so audited field changes carry it. */
export async function currentEditReason(tx: Tx, uid: string, id: ModuleId): Promise<string | undefined> {
  const mod = await tx.findOne<ModuleDoc>('crf_modules', { _id: moduleId(uid, id) }, { projection: { editing: 1 } });
  if (!mod?.editing) return undefined;
  const [latest] = await tx.find<EditDoc>('module_edit_reasons', { participant_uid: uid, module_id: id }, { sort: { at: -1, _id: -1 }, limit: 1 });
  return latest?.reason;
}
