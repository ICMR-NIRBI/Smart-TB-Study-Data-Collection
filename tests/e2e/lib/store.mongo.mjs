// MongoDB version of the test database adapter. Same methods, same field names as store.postgres.mjs, so the suites
// do not know which database they are looking at. Uses the owner login (it may read everything and tidy up).
import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { hashPassword } from './hash.mjs';

const withId = (doc) => (doc ? { ...doc, id: doc._id } : undefined);
const longAgo = () => new Date(Date.now() - 24 * 3600 * 1000);
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** An SQL LIKE pattern (only % is used) as a regular expression. */
const likeToRegex = (pattern) => new RegExp('^' + pattern.split('%').map(escapeRegex).join('.*') + '$');

export async function openStore() {
  const client = new MongoClient(process.env.MONGODB_OWNER_URI);
  await client.connect();
  const db = client.db(process.env.MONGODB_DB);
  const col = (name) => db.collection(name);

  return {
    user: async (email) => withId(await col('app_users').findOne({ email })),
    userExists: async (id) => (await col('app_users').countDocuments({ _id: id })) > 0,
    participantsCreatedBy: (userId) => col('participants').countDocuments({ created_by: userId }),
    markWorkedBy: async (userId, targetEmail) => {
      await col('app_users').updateOne({ email: targetEmail }, { $set: { updated_by: userId } });
    },
    audit: async (table, key) =>
      (await col('audit_log').find({ table_name: table, row_key: key }).sort({ _id: 1 }).toArray()).map((r) => ({
        action: r.action,
        reason: r.reason,
        changes: JSON.stringify(r.changes),
      })),
    requests: async (email) => (await col('access_requests').find({ email: email.toLowerCase() }).sort({ created_at: 1 }).toArray()).map(withId),
    expireRequestById: (id) => col('access_requests').updateOne({ _id: id }, { $set: { expires_at: longAgo() } }),
    expireRequestsByEmail: (email) => col('access_requests').updateMany({ email: email.toLowerCase() }, { $set: { expires_at: longAgo() } }),
    invite: async (id) => (await col('staff_invites').findOne({ _id: id })) ?? undefined,
    deleteUser: (id) => col('app_users').deleteOne({ _id: id }).catch(() => {}),
    deleteSessionsOfUser: (id) => col('sessions').deleteMany({ user_id: id }),
    deleteSessionsOfUsersLike: async (emailPattern) => {
      const ids = (await col('app_users').find({ email: likeToRegex(emailPattern) }, { projection: { _id: 1 } }).toArray()).map((u) => u._id);
      return col('sessions').deleteMany({ user_id: { $in: ids } });
    },

    // --- accounts, sessions and sign-in counters, for the sign-in suites
    createUser: async ({ email, name = 'Test Person', role, isAdmin = false, password, mustChange = false }) => {
      const id = randomUUID();
      const now = new Date();
      await col('app_users').insertOne({
        _id: id, email, display_name: name, role, is_admin: isAdmin, password_hash: password ? hashPassword(password) : null,
        external_uid: null, active: true, must_change_password: mustChange, last_sign_in_at: null, created_at: now, updated_at: now, updated_by: null,
      });
      return id;
    },
    setUserField: async (email, field, value) => {
      if (!['active', 'must_change_password', 'role'].includes(field)) throw new Error(`setUserField: ${field} not allowed`);
      await col('app_users').updateOne({ email }, { $set: { [field]: value } });
    },
    loginAttempt: async (email) => (await col('login_attempts').findOne({ _id: email })) ?? undefined,
    clearAttempts: (email) => col('login_attempts').deleteMany({ _id: email }),
    /** Makes every session of the user look as if it was last used `lastActiveMinutes` ago and started `createdHours` ago. */
    ageSessions: (userId, { lastActiveMinutes = 0, createdHours = 0 }) =>
      col('sessions').updateMany(
        { user_id: userId },
        { $set: { last_active_at: new Date(Date.now() - lastActiveMinutes * 60000), created_at: new Date(Date.now() - createdHours * 3600000) } },
      ),
    sessionCount: (userId) => col('sessions').countDocuments({ user_id: userId }),
    /** `expiresAt` is a YYYY-MM-DD date or null for no end date. */
    addDelegation: (userId, moduleId, expiresAt) =>
      col('module_delegations').insertOne({ _id: `${userId}:${moduleId}`, user_id: userId, module_id: moduleId, reason: 'test', expires_at: expiresAt, granted_by: null, granted_at: new Date() }),
    /** The encrypted phone and address exactly as stored, as Buffers (for checking nothing readable is kept). */
    contactRaw: async (uid) => {
      const row = await col('participant_contacts').findOne({ _id: uid });
      return row ? { phone: Buffer.from(row.phone_enc.buffer), address: Buffer.from(row.address_enc.buffer) } : undefined;
    },
    /** The `data` stored for one module (contacts are not in it). */
    moduleData: async (uid, moduleId) => (await col('crf_modules').findOne({ _id: `${uid}:${moduleId}` }))?.data,
    close: () => client.close(),
  };
}
