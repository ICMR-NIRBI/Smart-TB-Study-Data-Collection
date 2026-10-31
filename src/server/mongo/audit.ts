import { isDeepStrictEqual } from 'node:util';
import type { Document } from 'mongodb';
import type { AuditSpec } from './schema';

/** One field that changed. `old` is null when the field was new, `new` is null when it was removed. */
export interface AuditChange {
  field: string;
  old: unknown;
  new: unknown;
}

const orNull = (v: unknown) => (v === undefined ? null : v);

/** The same, as an object keyed by field name, for code that looks changes up by name. */
export function changesToObject(changes: AuditChange[]): Record<string, { old: unknown; new: unknown }> {
  return Object.fromEntries(changes.map((c) => [c.field, { old: c.old, new: c.new }]));
}

/**
 * What changed between two versions of a document, as the old audit trigger worked it out:
 * housekeeping fields are skipped, secret fields (password hashes) never appear but their change is recorded as
 * `password_changed`, and changes inside `data` are listed one by one as `data.<field>`. Nothing changed: an empty list.
 */
export function diffForAudit(spec: AuditSpec, before: Document | null, after: Document | null): AuditChange[] {
  const noise = new Set(spec.noise ?? []);
  const secret = new Set(spec.secret ?? []);
  const keyed = spec.keyFields.length === 1 && spec.keyFields[0] === '_id';
  const out: AuditChange[] = [];

  const o = { ...(before ?? {}) };
  const n = { ...(after ?? {}) };
  // The primary key is shown as `id` when it is the only key (a two-part key already appears as its two fields).
  if (keyed) {
    if ('_id' in o) o.id = o._id;
    if ('_id' in n) n.id = n._id;
  }
  delete o._id;
  delete n._id;

  let secretChanged = false;
  for (const s of secret) {
    if (!isDeepStrictEqual(orNull(o[s]), orNull(n[s]))) secretChanged = true;
    delete o[s];
    delete n[s];
  }

  const oData = (spec.expandData ? o.data : undefined) as Document | undefined;
  const nData = (spec.expandData ? n.data : undefined) as Document | undefined;
  if (spec.expandData) {
    delete o.data;
    delete n.data;
  }

  for (const key of new Set([...Object.keys(o), ...Object.keys(n)])) {
    if (noise.has(key)) continue;
    if (!isDeepStrictEqual(orNull(o[key]), orNull(n[key]))) out.push({ field: key, old: orNull(o[key]), new: orNull(n[key]) });
  }
  if (secretChanged) out.push({ field: 'password_changed', old: null, new: true });
  if (spec.expandData) {
    for (const key of new Set([...Object.keys(oData ?? {}), ...Object.keys(nData ?? {})])) {
      if (!isDeepStrictEqual(orNull(oData?.[key]), orNull(nData?.[key]))) out.push({ field: `data.${key}`, old: orNull(oData?.[key]), new: orNull(nData?.[key]) });
    }
  }
  return out;
}

/** The audit row key for a document: its key fields joined with ":". */
export function auditKey(spec: AuditSpec, doc: Document): string {
  return spec.keyFields.map((f) => String(doc[f] ?? '')).join(':');
}
