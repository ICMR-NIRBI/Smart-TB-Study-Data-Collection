import { ApiError } from './errors';
import type { AuditChange } from './mongo/audit';
import { reader } from './mongo/tx';

/*
 * Searching the audit trail from System control: by participant (study ID), by staff account (email), and by date.
 * Read-only. The results can be downloaded as a CSV file for a monitor, an ethics query or an investigation.
 */

export interface AuditRow {
  at: string;
  who: string;
  what: string;
  record: string;
  changes: string;
  reason: string;
}

const TABLES: Record<string, string> = {
  app_users: 'Staff account',
  participants: 'Participant',
  crf_modules: 'Module data',
  participant_contacts: 'Contact details',
  crf_images: 'Photo',
  sessions: 'Sign-in',
  staff_invites: 'Staff invite',
  module_delegations: 'Module access',
  module_edit_reasons: 'Edit reason',
  roles: 'Role',
  access_requests: 'Access request',
  account_setup_tokens: 'Setup link',
  app_settings: 'Site settings',
  server_actions: 'Server action',
  maintenance: 'Maintenance',
};

const ACTIONS: Record<string, string> = { INSERT: 'added', UPDATE: 'changed', DELETE: 'removed' };

const escapeRegex = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A date typed on the page (YYYY-MM-DD) is a day in India. */
function day(raw: unknown, endOfDay: boolean): Date | undefined {
  if (typeof raw !== 'string' || !raw) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new ApiError(400, 'Dates must look like 2026-11-03');
  return new Date(`${raw}T${endOfDay ? '23:59:59.999' : '00:00:00'}+05:30`);
}
const short = (v: unknown) => {
  const t = v === null || v === undefined ? '—' : typeof v === 'string' ? v : JSON.stringify(v);
  return t.length > 80 ? `${t.slice(0, 77)}…` : t;
};

export async function searchAudit(input: Record<string, unknown>, max = 500): Promise<{ rows: AuditRow[]; truncated: boolean }> {
  const participant = typeof input.participant === 'string' ? input.participant.trim() : '';
  const account = typeof input.account === 'string' ? input.account.trim().toLowerCase() : '';
  const from = day(input.from, false);
  const to = day(input.to, true);
  const and: Record<string, unknown>[] = [];

  if (participant) {
    const byStudyId = await reader.find<{ participant_uid: string }>(
      'crf_modules',
      { module_id: 1, 'data.participantId': { $regex: `^${escapeRegex(participant)}$`, $options: 'i' } } as never,
      { projection: { participant_uid: 1 } },
    );
    const uids = [...new Set([...byStudyId.map((d) => d.participant_uid), ...((await reader.count('participants', { _id: participant as never })) ? [participant] : [])])];
    if (!uids.length) throw new ApiError(404, `No participant with the ID ${participant}`);
    const images = (await reader.find<{ _id: string }>('crf_images', { participant_uid: { $in: uids } }, { projection: { _id: 1 } })).map((d) => d._id);
    and.push({ $or: [{ row_key: { $in: [...uids, ...images] } }, { row_key: { $regex: `^(${uids.map(escapeRegex).join('|')}):` } }] });
  }
  if (account) {
    const user = await reader.findOne<{ _id: string }>('app_users', { email: account });
    if (!user) throw new ApiError(404, `No staff account with the email ${account}`);
    and.push({ $or: [{ user_id: user._id }, { row_key: user._id }] });
  }
  if (from || to) and.push({ at: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } });

  const docs = await reader.find<{ at: Date; user_id: string | null; table_name: string; row_key: string; action: string; changes: AuditChange[]; reason: string | null }>(
    'audit_log',
    and.length ? { $and: and } : {},
    { sort: { at: -1, _id: -1 }, limit: max + 1 },
  );
  const truncated = docs.length > max;
  const page = docs.slice(0, max);

  // Names for the people and participants the rows mention.
  const userIds = [...new Set(page.flatMap((d) => [d.user_id, d.table_name === 'app_users' || d.table_name === 'sessions' ? d.row_key : null]).filter((v): v is string => !!v))];
  const users = userIds.length ? await reader.find<{ _id: string; display_name: string; email: string }>('app_users', { _id: { $in: userIds } as never }) : [];
  const userName = (id: string | null) => {
    if (!id) return 'System';
    const u = users.find((x) => x._id === id);
    return u ? `${u.display_name} (${u.email})` : 'A removed account';
  };
  const uidsMentioned = [...new Set(page.map((d) => d.row_key.split(':')[0]).filter((k) => k.startsWith('p_') || k.startsWith('seed-')))];
  const studyIds = uidsMentioned.length
    ? await reader.find<{ participant_uid: string; data: { participantId?: string } }>('crf_modules', { module_id: 1, participant_uid: { $in: uidsMentioned } }, { projection: { participant_uid: 1, 'data.participantId': 1 } })
    : [];
  const studyId = (uid: string) => studyIds.find((s) => s.participant_uid === uid)?.data?.participantId || uid;

  const rows = page.map<AuditRow>((d) => {
    const [base, mod] = d.row_key.split(':');
    let record = d.row_key;
    if (d.table_name === 'crf_modules' && mod) record = `${studyId(base)} · Module ${mod}`;
    else if (['participants', 'participant_contacts'].includes(d.table_name)) record = studyId(base);
    else if (['app_users', 'sessions'].includes(d.table_name)) record = userName(d.row_key);
    return {
      at: d.at.toISOString(),
      who: userName(d.user_id),
      what: `${TABLES[d.table_name] ?? d.table_name} ${ACTIONS[d.action] ?? d.action.toLowerCase().replace(/_/g, ' ')}`,
      record,
      changes: (d.changes ?? []).map((c) => `${c.field}: ${short(c.old)} → ${short(c.new)}`).join('; '),
      reason: d.reason ?? '',
    };
  });
  return { rows, truncated };
}

/** The rows as a CSV file. Cells that a spreadsheet would run as a formula are made plain text. */
export function auditCsv(rows: AuditRow[]): string {
  const cell = (v: string) => {
    const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const head = ['Time (UTC)', 'Who', 'What', 'Record', 'Changes', 'Reason'];
  return [head, ...rows.map((r) => [r.at, r.who, r.what, r.record, r.changes, r.reason])].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
