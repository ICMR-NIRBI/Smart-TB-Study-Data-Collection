// The only place the end-to-end tests touch the database directly. Rows come back with the field names below
// (snake_case, as the tests were first written), whatever database is underneath, so moving to another
// database means rewriting this file and nothing else.
import { createRequire } from 'node:module';
import { hashPassword } from './hash.mjs';

const pg = createRequire(import.meta.url)('pg');

export async function openStore() {
  const db = new pg.Client({ connectionString: process.env.DATABASE_OWNER_URL });
  await db.connect();
  const one = async (sql, args) => (await db.query(sql, args)).rows[0];
  const many = async (sql, args) => (await db.query(sql, args)).rows;

  return {
    /** { id, email, display_name, role, is_admin, active, must_change_password, password_hash } or undefined */
    user: (email) => one('select * from app_users where email = $1', [email]),
    userExists: async (id) => (await db.query('select 1 from app_users where id = $1', [id])).rowCount > 0,
    participantsCreatedBy: async (userId) => (await one('select count(*)::int n from participants where created_by = $1', [userId])).n,
    /** Makes `targetEmail`'s record say it was last changed by `userId`, so that `userId` has a record in the study. */
    markWorkedBy: async (userId, targetEmail) => {
      await db.query('select set_config($1, $2, false)', ['app.user_id', userId]);
      await db.query('update app_users set updated_by = $1 where id = (select id from app_users where email = $2)', [userId, targetEmail]);
    },
    /** Every audit entry for one record: [{ action, reason, changes }] oldest first; `changes` is a JSON string. */
    audit: (table, key) => many('select action, reason, changes::text as changes from audit_log where table_name = $1 and row_key = $2 order by id', [table, key]),
    /** Access requests for an email, oldest first: { id, status, password_hash, decision_role, decision_reason, user_id, ... } */
    requests: (email) => many('select * from access_requests where lower(email) = $1 order by created_at', [email]),
    expireRequestById: (id) => db.query("update access_requests set expires_at = now() - interval '1 day' where id = $1", [id]),
    expireRequestsByEmail: (email) => db.query("update access_requests set expires_at = now() - interval '1 day' where lower(email) = $1", [email]),
    /** { user_id } of an invitation. */
    invite: (id) => one('select user_id from staff_invites where id = $1', [id]),
    deleteUser: (id) => db.query('delete from app_users where id = $1', [id]).catch(() => {}),
    deleteSessionsOfUser: (id) => db.query('delete from sessions where user_id = $1', [id]),
    deleteSessionsOfUsersLike: (emailPattern) => db.query('delete from sessions where user_id in (select id from app_users where email like $1)', [emailPattern]),

    // --- accounts, sessions and sign-in counters, for the sign-in suites
    createUser: async ({ email, name = 'Test Person', role, isAdmin = false, password, mustChange = false }) =>
      (await one(
        'insert into app_users (email, display_name, role, is_admin, password_hash, must_change_password) values ($1, $2, $3, $4, $5, $6) returning id',
        [email, name, role, isAdmin, password ? hashPassword(password) : null, mustChange],
      )).id,
    setUserField: async (email, field, value) => {
      if (!['active', 'must_change_password', 'role'].includes(field)) throw new Error(`setUserField: ${field} not allowed`);
      await db.query(`update app_users set ${field} = $2 where email = $1`, [email, value]);
    },
    loginAttempt: (email) => one('select fails, locked_until from login_attempts where email = $1', [email]),
    clearAttempts: (email) => db.query('delete from login_attempts where email = $1', [email]),
    /** Makes every session of the user look as if it was last used `lastActiveMinutes` ago and started `createdHours` ago. */
    ageSessions: (userId, { lastActiveMinutes = 0, createdHours = 0 }) =>
      db.query(
        "update sessions set last_active_at = now() - ($2 || ' minutes')::interval, created_at = now() - ($3 || ' hours')::interval where user_id = $1",
        [userId, String(lastActiveMinutes), String(createdHours)],
      ),
    sessionCount: async (userId) => (await one('select count(*)::int n from sessions where user_id = $1', [userId])).n,
    /** `expiresAt` is a YYYY-MM-DD date or null for no end date. */
    addDelegation: (userId, moduleId, expiresAt) =>
      db.query("insert into module_delegations (user_id, module_id, reason, expires_at) values ($1, $2, 'test', $3)", [userId, moduleId, expiresAt]),
    /** The encrypted phone and address exactly as stored, as Buffers (for checking nothing readable is kept). */
    contactRaw: async (uid) => {
      const row = await one('select phone_enc, address_enc from participant_contacts where participant_uid = $1', [uid]);
      return row ? { phone: row.phone_enc, address: row.address_enc } : undefined;
    },
    /** The `data` stored for one module (contacts are not in it). */
    moduleData: async (uid, moduleId) => (await one('select data from crf_modules where participant_uid = $1 and module_id = $2', [uid, moduleId]))?.data,
    close: () => db.end(),
  };
}
