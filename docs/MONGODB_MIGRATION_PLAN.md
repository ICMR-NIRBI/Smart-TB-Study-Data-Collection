# Moving SMART-TB from PostgreSQL to MongoDB

Status: plan only, nothing built yet. Decisions so far:
- MongoDB runs on the existing Azure VM, as a single-node replica set (needed for transactions).
- The app code is replaced in place, so the live site keeps running the current version until one planned switch-over.

## What must not get worse

1. Every change is still recorded with who, when and why, and nothing can skip the record.
2. The audit record cannot be edited or deleted by the app.
3. The rules the database enforces today still hold: one live email per account, one pending request per email, a role must exist before it is assigned, an account with records cannot be erased, multi-step changes happen all or nothing.
4. Encrypted hourly backups, and a restore that has been tried.
5. No data lost in the move.

## Design

Collections mirror the old PostgreSQL tables one to one, with the same names and the same field names: `app_users`, `module_delegations`, `sessions`, `login_attempts`, `account_setup_tokens`, `access_requests`, `roles`, `staff_invites`, `participants`, `crf_modules` (one document per participant and module), `participant_contacts` (kept apart so phone and address stay restricted), `module_edit_reasons`, `audit_log`, plus `locks`. `_id` holds the old primary key as a string (the same ids, so existing data and audit rows move across unchanged). This changed from the first sketch (modules inside the participant document) because it keeps every rewritten query close to the SQL it replaces, and the audit keys per module stay the same.

- **One write door.** Every change goes through `withTransaction`, whose `Tx` object makes the change and writes its audit entry in the same transaction (`src/server/mongo/tx.ts`). The app can only write through it; reads outside a transaction use `reader`. This replaces today's database triggers, including the way they list changes, hide password hashes and skip housekeeping fields.
- **Append-only.** The app logs in as a MongoDB user that may add to and read `audit_log` and `module_edit_reasons` but not change or delete them, and may not delete participants, modules or contacts (the same limits as the PostgreSQL grants).
- **Locks.** PostgreSQL's `select ... for update` becomes `tx.lock(name)`, used for rules that span documents such as "at least one administrator must remain". A test shows that without it two simultaneous deactivations would leave none.
- **Rules.** Unique indexes (email; live role name and one pending request per email, case-insensitive; participant id). Rules that were foreign keys (role exists, "has records") become checks inside the same transaction.
- **Server.** MongoDB listens on 127.0.0.1 only, with authentication on. Backups: `mongodump` then the same encryption and desktop pull as now.

## Phases

Each phase ends with passing tests and a one-line entry in `docs/MONGODB_STATUS.md`, so a new session starts from that file and does not re-read the code.

| # | Phase | Size |
|---|---|---|
| 0 | Prepare: move all test scripts into the repo (`tests/e2e`), recover or rewrite the three lost ones (roles, requests, temporary passwords), record a passing baseline on PostgreSQL, install MongoDB locally | half a session |
| 1 | Infrastructure: replica set, authentication, app and audit users, backup and restore scripts, tried on a scratch database | 1 |
| 2 | Foundation: new `db.ts`, `write()` with audit, indexes, set-up and migration scripts | 1 |
| 3 | Sign-in, sessions, roles | 1 |
| 4 | Staff accounts, invitations, access requests | 1 to 1.5 |
| 5 | Participants, modules, contacts, edit reasons (the largest) | 2 |
| 6 | Command-line scripts (set-up, create admin, temporary password, preflight), `OPERATIONS.md` | 1 |
| 7 | Data move script and a rehearsal on a copy of the live data | half |
| 8 | Switch-over and documents | 1 |

About 9 to 10 working sessions in all. Phases 3 to 5 are done one server file at a time, so each fits comfortably in a session.

## Keeping token use and the hourly limit low

- Tests are the contract. The existing end-to-end scripts check behaviour, not SQL, so after each file is rewritten I run only its script, and the full set once at the end of the phase. No browser screenshots; the dev server is started once per phase.
- One server file per step, always. Read it once in full, rewrite it, run its script, move on. No re-reading finished files.
- Search before reading: `grep` for the lines that matter, and read only those ranges of the large files (`participants.ts`, `staff.ts`).
- Routes and screens stay untouched. They call the same server functions with the same inputs and outputs, so the changes stay inside `src/server`, `scripts` and `db`.
- Short sessions per phase. I stop at each phase end, commit locally, and update the status file; you decide when to continue. A fresh session reads the status file and the plan, not the history.
- Batch the checks: one combined command per round (type check, lint, test), not one tool call per check.
- No speculative rewrites. Nothing is changed outside the listed phases.

## Switch-over (about 30 to 60 minutes)

1. Backup now (PostgreSQL dump plus the usual encrypted backup).
2. Stop the app. A short "back soon" page is shown if you want one.
3. Run the data move script. Check counts per table against PostgreSQL, and spot-check accounts and audit entries.
4. Deploy the MongoDB version. Health check, sign in as each role, open a module.
5. Keep PostgreSQL running, read-only, for 7 days.

**Going back:** redeploy the previous version, which still points at PostgreSQL. Anything entered after the switch would not be in PostgreSQL, so go back only in the first hours, or export the new entries first.

## Risks

- **Audit completeness** is the main risk. Mitigation: the one write door, the append-only user, and a test that every kind of change leaves exactly one audit entry.
- **Transactions** need the replica set. Mitigation: set up and tested in phase 1.
- **Doing it after real participant data exists** is harder. Doing it now, with no participants, is the cheapest time.

## Needs your approval along the way

- Installing MongoDB (a download from MongoDB's package source) on this computer and on the server.
- Which MongoDB version (I suggest the current 8.0 release).
- The switch-over window.
