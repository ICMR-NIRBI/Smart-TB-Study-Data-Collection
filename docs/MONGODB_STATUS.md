# MongoDB migration: status

Read this and `MONGODB_MIGRATION_PLAN.md` at the start of a session. Do not re-read the whole history.

**DONE: the live site runs on MongoDB since 2026-10-31 (commit a3fb6e5).** See "Phase 8" below for what remains (removing PostgreSQL after the 7-day fallback period).

## Phase 0: prepare (complete)

Done
- All end-to-end suites now live in `tests/e2e` (they were scratch files before). Run them with `npm run test:e2e`, or only some with `npm run test:e2e -- roles invites`. The runner starts its own server on port 3100 with production-style module gating, runs each suite, and stops the server. It refuses to run against anything but localhost.
- Every direct database call in the tests now goes through `tests/e2e/lib/store.mjs`. Moving to MongoDB means rewriting that one file for the tests; no suite changes.
- Baseline on PostgreSQL, recorded 2026-10-30: **6 suites, 158 checks, all passing** (delete 17, invites 32, requests 37, roles 36, temporary passwords 25, view-all 11).
- Local MongoDB 8.0.34 installed (portable, no service) in `C:\Users\lenovo\mongodb-local`. The download matched MongoDB's published size and checksum. To remove it, delete that folder.
- It runs as a single-node replica set `rs0` on 127.0.0.1:27018. At the end of phase 0 it had no login; phase 1 (below) turned the login on and changed the start command. The replica set is initiated and stays so in the data folder.
- Verified on it: a transaction across two collections commits; a failed one rolls back completely; a second account with the same email in another case is refused (case-insensitive unique index).
- No Mongo shell is installed. Scripts use the `mongodb` Node driver.

## Phase 1: infrastructure (complete, locally and on the server)

Done, locally
- MongoDB on this computer now runs with login required and a key file. Start command (adds `--auth --keyFile`):
  `C:\Users\lenovo\mongodb-local\mongodb-win32-x86_64-windows-8.0.34\bin\mongod.exe --dbpath C:\Users\lenovo\mongodb-local\data --port 27018 --bind_ip 127.0.0.1 --replSet rs0 --auth --keyFile C:\Users\lenovo\mongodb-local\keyfile --logpath C:\Users\lenovo\mongodb-local\mongod.log --logappend`
- Logins and the database `smarttb_dev` were set up with `scripts/mongo/setup-auth.mts` (two steps, see the comment at its top). The addresses are in `.env.mongo.local` (ignored by git): `MONGO_ADMIN_URI`, `MONGODB_URI` (the app), `MONGODB_OWNER_URI` (set-up, migrations, backup, restore), `MONGODB_DB`. Passwords are never printed. The PostgreSQL `.env.local` is untouched.
- The app login may read and write the working collections and may only add to and read `auditLog`: it cannot change or delete an audit entry, drop collections, create collections or indexes, or reach another database. The collection list is in `src/server/mongo/collections.ts`; a new collection means adding it there and re-running the set-up script.
- Backup and restore use the Node driver only (`scripts/mongo/dump.ts`, `backup.mts`, `restore.mts`). Same encryption and file name (`smarttb-<time>.dump.enc`) as the PostgreSQL backup, so the desktop pull task needs no change. The data is read in one snapshot. Wrong passphrase writes nothing; restoring into a database that has data is refused unless `--replace`.
- `node --env-file=.env.mongo.local --import tsx scripts/mongo/check-infra.mts`: **31 checks, all passing** (permissions, audit append-only, transactions, backup and restore round trip with exact values and indexes). Also tried by hand: encrypted backup and restore through the command line, right and wrong passphrase.
- Scripts that use top-level `await` must be `.mts` (the project is CommonJS).
- `mongodb` and `bson` added as dependencies.

Server MongoDB (done 2026-10-30)
- Installed on the Azure VM: `mongodb-org-server` 8.0.34 from repo.mongodb.org (apt, held with `apt-mark hold`), service `mongod` enabled and running. Listens on 127.0.0.1:27017 only (not reachable from outside, checked). Replica set `rs0`, login and key file (`/etc/mongodb-keyfile`) on, 1 GB cache cap. Config: `/etc/mongod.conf`. Memory about 220 MB idle.
- Kernel problem and how it was handled: the VM runs Linux 7.0.0-azure. MongoDB 8.0.34 refuses to start there when the package's `GLIBC_TUNABLES=glibc.pthread.rseq=0` is set (SERVER-121912, closed "gone away", no fix version). Fix in use: the drop-in `/etc/systemd/system/mongod.service.d/rseq.conf` with `UnsetEnvironment=GLIBC_TUNABLES`. It then starts and logs one warning: glibc rseq is not supported by tcmalloc-google, with performance implications. This is an unsupported combination, accepted because the data is small. Keep watching: re-test after any MongoDB or kernel update (the package is held, so MongoDB does not update by itself; kernel updates may). MongoDB 8.2.12 also starts on this kernel (tested in a temporary folder, deleted) and could replace 8.0.34 if problems appear. MongoDB 7.0 has no Ubuntu 24.04 repository.
- Logins and database `smarttb` created through an SSH tunnel with the same scripts as locally. The addresses are in `/opt/smarttb/.env.mongo` (owner smarttb, mode 600): MONGO_ADMIN_URI, MONGODB_URI (app), MONGODB_OWNER_URI, MONGODB_DB. No copy of them is left on the dev computer. The app does not use them yet.
- `check-infra.mts` run against the server through the tunnel: **31 checks, all passing**, no crashes or restarts afterwards. PostgreSQL, the app and Caddy untouched and healthy.
- To run scripts against the server again: `ssh -N -L 27017:127.0.0.1:27017 azureuser@135.235.138.35` (local port 27017 must be free), then use the addresses from the server file. The replica-set address is 127.0.0.1:27017, so the tunnel must use that same local port.

Still to do for the server: switch `deploy/backup.sh` to the MongoDB backup at cut-over time (phase 8, not before); add `MONGODB_*` to the app's environment at cut-over.

Next: phase 2 (foundation: `db.ts`, the one write function with audit, indexes, `tests/e2e/lib/store.mjs` for MongoDB).

## Phase 2: foundation (complete, locally)

Built (all in `src/server/mongo/`)
- `schema.ts`: the single list of collections (`SPECS`): who may do what to each, what is audited, and the indexes. `ensureSchema(db)` creates collections, indexes and lock documents; safe to repeat. `specOf(name)`.
- `client.ts`: one connection pool (`getClient`, `getDb`, `closeClient`) and `isDuplicateKey(err)` (the old PostgreSQL 23505, MongoDB code 11000).
- `tx.ts`: `withTransaction({ userId, reason }, async (tx) => ...)`. `tx` has `findOne/find/count`, `insertOne/updateOne/updateMany/deleteOne/deleteMany` (audited collections get their audit entry in the same transaction), `record()` for events such as SIGN_IN or SETUP_LINK, `setActor/setReason` (the old `app.user_id` and `app.reason`), and `lock(name)`. `reader` has read-only `findOne/find/count` for use outside a transaction. The callback can run more than once if MongoDB retries a conflict, so keep outside effects out of it.
- `audit.ts`: works out what changed. Audit documents: `{ _id, at, user_id, table_name, row_key, action, changes: [{field, old, new}], reason }`. `changes` is a list (not an object), because `data.<field>` names contain a dot; use `changesToObject()` to look fields up by name. Password hashes never appear; a change shows as `password_changed`.
- Scripts: `scripts/mongo/migrate.mts` (apply the schema), `setup-auth.mts` now builds the app login from `SPECS` and applies the schema, `check-foundation.mts` (31 checks), `check-infra.mts` (37 checks).
- `tests/e2e/lib/store.mjs` picks the test database adapter: PostgreSQL by default, `E2E_DB=mongo` for `store.mongo.mjs` (written, not yet exercised by the suites).

Design choices to remember
- Documents keep the PostgreSQL field names (`display_name`, `is_admin`, `password_hash`, `created_at`, ...). `_id` is the old primary key as a string. Server code maps `_id` to `id` when it returns rows to the routes, so the routes and screens do not change.
- Dates are `Date` objects. Defaults that PostgreSQL filled in (`created_at`, `active`, ...) must now be set by the code that inserts.
- Roles keep `deleted_at: null` when live (the unique role name index depends on it).
- Rules that were foreign keys (a role must exist, an account with records cannot be erased) become checks inside the transaction.
- Rules that span documents ("at least one administrator") need `tx.lock('admins')`; locks are created by `ensureSchema`.

Verified (local MongoDB): 31 foundation checks and 37 infrastructure checks pass; the PostgreSQL end-to-end baseline is unchanged at 158 checks.

Server note: the server's database `smarttb` was set up in phase 1 with the old collection names (`users`, ...), all empty. Before the cut-over, re-run `setup-auth.mts` on the server (updates the app login to the new list and applies the schema) and drop the old empty collections.

Next: phase 3 (sign-in, sessions, roles: `src/server/auth.ts`, `roles.ts`, `passwords.ts` unchanged, `http.ts` unchanged, run `e2e-roles` and the sign-in parts).

## Phase 3: sign-in, sessions, roles (complete)

Converted to MongoDB: `src/server/auth.ts`, `src/server/roles.ts`; routes `api/auth/*` and `api/admin/roles/*` (they use `withTransaction`/`reader` from `server/mongo/tx`). `ApiError` now lives in `src/server/errors.ts` (`participants.ts` still re-exports it, so unconverted files keep working). `passwords.ts` and `http.ts` unchanged.

Behaviour kept exactly: failed sign-ins are counted in their own committed transaction (so the count survives the failed request); lockout 5 tries / 5 minutes; same messages; session idle 15 min and 12 h maximum, touched at most once a minute; password change ends other sessions and writes both the UPDATE (as `password_changed`) and a `PASSWORD_CHANGED` audit entry; sign-in and sign-out are audit entries on `sessions` keyed by the user id.

Things that changed shape (remember in phase 4/5)
- Delegation end dates (`module_delegations.expires_at`) are stored as `YYYY-MM-DD` strings (UTC date), or null. A delegation's `_id` is `userId:moduleId`.
- `cleanRole(tx, raw)` now needs a transaction and takes a per-role lock (`role:<key>`) for custom roles; `deleteRole` takes the same lock, so a role can never be removed and given to someone at once (tested at library level, 4 rounds, both orders).
- `listRoles`, `customRoleLabels`, `roleAccess` take `Reads` (a transaction or `reader`).
- Every session touch or expiry is a small transaction.

Tests (all pass on both databases)
- New database-neutral suites: `tests/e2e/e2e-auth.mjs` (52 checks) and `tests/e2e/e2e-roles-core.mjs` (38 checks). They create their own accounts through the adapter (`createUser`, `setUserField`, `ageSessions`, `addDelegation`, ...), so they do not depend on the staff code. Both were first run against the deployed PostgreSQL code (a temporary checkout of commit 38b173f) and passed 52/52 and 38/38, then against MongoDB with identical results.
- `check-foundation.mts` is now 33 checks (adds the role race), `check-infra.mts` 37.
- Run on MongoDB: start mongod (command above), `node --env-file=.env.mongo.local --import tsx scripts/mongo/migrate.mts` once, `node --env-file=.env.local --env-file=.env.mongo.local --import tsx scripts/mongo/seed-accounts.mts` once, then `E2E_DB=mongo node tests/e2e/run-all.mjs auth roles-core`.
- To get a PostgreSQL reference result for a suite again: `git worktree add --detach .pg-ref HEAD` inside `web` (it must be inside the project so Node finds `node_modules`; `H:` is exFAT, so no junctions), copy `.env.local` and `tests` into it, run `node tests/e2e/run-all.mjs <suite>` there, then remove it. An empty `.pg-ref` folder may remain if a process holds it; delete it after a restart.

Expected type errors until phase 4: `staff.ts`, `invites.ts`, `accessRequests.ts` (they still use PostgreSQL and call the converted `roles.ts`). They are the phase 4 worklist.

The old PostgreSQL end-to-end suites (delete, invites, requests, roles, temp, view-all) cannot run on this working tree any more (sign-in is on MongoDB). They run on MongoDB once phases 4 and 5 are done.

Next: phase 4 (staff, invitations, access requests, setup links): `staff.ts`, `invites.ts`, `accessRequests.ts` and their routes (`api/admin/staff*`, `api/admin/invites*`, `api/admin/requests*`, `api/join`, `api/setup`, `api/access-requests`), then run e2e-delete, e2e-invites, e2e-requests, e2e-roles, e2e-temp on MongoDB.

## Phase 4: staff, invitations, access requests, setup links (complete)

Converted: `src/server/staff.ts`, `invites.ts`, `accessRequests.ts` and the routes `api/admin/staff*`, `api/admin/invites*`, `api/admin/requests*`, `api/join`, `api/setup`, `api/access-requests`.

How PostgreSQL behaviour was reproduced
- Foreign keys: `deleteStaff` checks every place an account can be referenced (`hasRecords`: participants, CRF modules, edit reasons, contacts, delegations/setup links/accounts/requests/roles/invitations it made) and refuses with the same message. What used to cascade (sessions, setup links, delegations; request and invitation keep their record with the link nulled) is now done by hand in the same transaction. The app login therefore needs 'remove' on `account_setup_tokens` (added to the schema).
- `select ... for update`: `lockUser` is `tx.lock('user:<id>')`; "at least one administrator" uses `tx.lock('admins')`; role assignment/removal share `role:<key>`.
- One-use links: an invitation is claimed with a conditional update that matches only an unused link (first write of `acceptInvite`); a setup link the same way in `completeSetup`. A refused attempt rolls the claim back, so it does not use the link up.
- Duplicate emails: inserts that hit the unique index throw `isDuplicateKey`; that aborts the whole transaction, so code that wants to carry on instead pre-checks (access requests). Two identical requests at the same instant: the second fails on the unique index and the route treats that as "already recorded" (`isAlreadyRecorded`).
- `newUserDoc()` in `staff.ts` builds a complete account document (all defaults); use it for every new account.
- Audit: staff history reads `audit_log` through `changesToObject`. Existing PostgreSQL audit rows have `changes` as an object; the data move (phase 7) must convert them to the list form `[{field, old, new}]`.

Tests (all on MongoDB, all passing): auth 52, roles-core 38, roles 36, delete 17, invites 32, requests 37, temp 25, plus the new `e2e-concurrency.mjs` 10 (five people using one invitation at once; the same access request six times at once; approve vs reject at once; a setup link used four times at once; two changes to one account at once). The five older suites equal their PostgreSQL baseline counts. Not yet covered: `e2e-view-all` (needs participants, phase 5) and the "has records" refusal for participants/modules (the delete suite uses a marker record until participants exist).

Remaining type errors: `scripts/db/create-admin.ts` and `scripts/db/set-temp-password.ts` (they call `applyTemporaryPassword` with a PostgreSQL client; phase 6).

Server note: the schema changed again (`account_setup_tokens` may be removed from). Re-run `setup-auth.mts` on the server before the cut-over, as already noted.

Next: phase 5 (participants, CRF modules, contacts, edit reasons: `participants.ts`, `api/participants*`, and the seed data), then run `e2e-view-all` and add participant checks to the delete suite.

## Phase 5: participants, CRF modules, contacts, edit reasons (complete)

Converted: `src/server/participants.ts` (all of it, including `insertParticipant` for the seed), `src/server/contactCrypto.ts` (new), routes `api/participants*` and `api/health` (now pings MongoDB). No file under `src/` imports PostgreSQL any more except the unused `server/db.ts` and `server/dbSsl.ts` (delete them at cut-over).

Design
- Documents mirror the old rows: `participants` (`_id` = uid), `crf_modules` (`_id` = `uid:moduleId`, `data` object, `completed_by` id plus `completed_by_name`/`completed_role` as text), `module_edit_reasons` (append-only, auto `_id`), `participant_contacts` (`_id` = uid).
- Field edits are `$set` of `data.<field>` (shallow merge, as `data || patch` was), so the audit lists `data.<field>` entries. Module 1's `data` never holds phone or address.
- Contact details: AES-256-GCM in Node (`contactCrypto.ts`), key derived from `CONTACT_ENC_KEY` with scrypt, each value bound to its participant and field (`uid:phone`, `uid:address`) and stored as Binary (version byte, nonce, tag, ciphertext). This replaces pgcrypto, so **existing PostgreSQL contact values must be decrypted with `pgp_sym_decrypt` and re-encrypted in the data move (phase 7)**; the same `CONTACT_ENC_KEY` is used.
- Per-participant lock `participant:<uid>` replaces `select ... for update` (every write path takes it first). Two simultaneous locks of the same module: one wins, the other gets 409. Two simultaneous reopens: both succeed and each keeps its reason (same as PostgreSQL; found by the reference run).
- Who locked a module first stays on record on re-lock (`completed_by*` only set when empty), as before.
- A duplicate participant id (unique partial index on module 1) becomes a 409 "already in use".

Tests (MongoDB): new `tests/e2e/e2e-participants.mjs` (59 checks: enrolment rules, contact visibility per role, encryption at rest and in the audit trail, role and sequence rules, drafts, locking with validation, reopening with reasons carried into the audit, PI-only sign-off, screen failure, discontinuation, simultaneous edits). It was first run against the deployed PostgreSQL code and passed 59/59 (after correcting one expectation), then on MongoDB 59/59. `e2e-view-all` 11 and `e2e-delete` 17 pass (the delete suite now uses a real participant record). **Full MongoDB run: all 10 suites, 319 checks.** `scripts/mongo/check-seed.mts` (8 checks) shows the 4 demo participants round-trip exactly in a scratch database; `seed-accounts.mts` now also seeds them when there are none.

Remaining type errors: `scripts/db/create-admin.ts`, `reset.ts`, `set-temp-password.ts` (phase 6).

Next: phase 6 (command-line scripts: set-up of a first admin, temporary password, preflight, reset; `OPERATIONS.md`; deploy files that mention PostgreSQL such as `deploy/backup.sh`, `server-setup.sh`, `env.production.example`, `deploy.sh` migrations step).

## Phase 6: command-line scripts, deploy files, documents (complete)

State: type check has **zero errors**, lint is clean, `npm run db:check` (37 + 33) and `npm run test:e2e` (10 suites, 319 checks, MongoDB by default now) pass.

New or changed
- `scripts/db/` (PostgreSQL) is deleted. Replacements in `scripts/mongo/`, each with an `npm run db:*` name: `bootstrap`, `setup` (logins, collections, indexes), `migrate`, `seed`, `reset` (local only), `preflight` (15 checks, changes nothing, verified to fail when something is wrong), `create-admin`, `set-temp-password`, `backup`, `restore` (`--replace`, `--into <db>`, `--admin`), `counts`, `drop-scratch` (only names starting `restore_`), `init-replica-set`, `check` (infra + foundation).
- `scripts/mongo/loadenv.ts`: every script loads its env files itself (`SMARTTB_ENV_FILES`, default `.env.local,.env.mongo.local`; on the server `/opt/smarttb/.env,/opt/smarttb/.env.mongo`). Needed because the MongoDB addresses contain `&`: **never `source` the Mongo env file in bash** (this bit once already); systemd's `EnvironmentFile` and Node read it fine. `npm run dev` loads `.env.mongo.local` through `--env-file-if-exists`.
- `deploy/backup.sh`: dumps with `scripts/mongo/backup.mts`, encrypts with the same openssl line and file name (so the desktop pull task is unchanged), then decrypts and `gzip -t`s the file before keeping it; a failed or partial run leaves no file. Paths overridable (`SMARTTB_APP_DIR`, `SMARTTB_ENV_FILE`, `SMARTTB_MONGO_ENV_FILE`, `SMARTTB_BACKUP_DIR`) and trial-run locally: backup, restore into a scratch database, all 14 collections equal, indexes back, a document identical, wrong passphrase writes nothing.
- New `deploy/mongo-setup.sh` (install 8.0 from MongoDB's package source, hold it, key file, `mongod.conf`, the kernel rseq workaround drop-in) and `deploy/mongo-init.sh` (replica set, administrator login, switch login on, app/owner logins, schema; refuses to run twice). They reproduce the manual steps done on the live server; **not yet run on a fresh machine** (syntax-checked with `bash -n`; the individual commands, including the replica-set initiation on a throwaway mongod, were exercised).
- `deploy/deploy.sh` (reads both env files for scripts, migrates only if `.env.mongo` exists), `server-setup.sh` (no PostgreSQL), `smarttb.service` (second `EnvironmentFile`, after `mongod`), `env.production.example`, new `env.mongo.example`, `.env.example`, `README.md`, `deploy/README.md`, `deploy/OPERATIONS.md` (no PostgreSQL mentioned; test restore, full restore, rebuild and secrets rewritten).

Still PostgreSQL, kept on purpose until phase 7/8: `src/server/db.ts`, `src/server/dbSsl.ts`, `db/migrations/*.sql`, the `pg` package, `tests/e2e/lib/store.postgres.mjs` (reference runs with `E2E_DB=postgres`), `deploy/pull-backups.ps1` is unchanged (file name pattern kept).

**Before the cut-over, rehearse on the server and only then keep the sentence at the top of OPERATIONS.md ("Every command was tried on this server")**: the monthly test restore, the full restore, `db:counts`, `db:create-admin`, `db:setup`, the backup service, and `mongo-setup.sh`/`mongo-init.sh` on a spare machine if one can be had. Where a command could not be tried, say so in the guide.

CUT-OVER CHECKLIST (input for phase 8; the live server today runs the committed PostgreSQL build `38b173f`)
1. Announce a window; stop the desktop pull task only if it would clash (it does not).
2. Backup now: `sudo systemctl start smarttb-backup` (PostgreSQL) plus a `pg_dump` kept aside as the fallback.
3. Stop `smarttb`.
4. Server MongoDB (already installed, held, rseq drop-in, login on, replica set): re-run `db:setup` (new collection names and the extra `remove` on `account_setup_tokens`); drop the old empty collections from phase 1 (`users`, `sessions`, `loginAttempts`, `roles`, `staffInvites`, `accessRequests`, `setupTokens`, `delegations`, `participants`, `participantContacts`, `editReasons`, `auditLog`: all empty); run `db:migrate`.
5. Run the data move (phase 7 script) from PostgreSQL into MongoDB; compare counts; spot-check.
6. Install the new `smarttb.service` (second `EnvironmentFile=/opt/smarttb/.env.mongo`) and the new backup script (`sudo install -m 755 deploy/backup.sh /usr/local/bin/smarttb-backup`), `daemon-reload`.
7. Deploy the MongoDB commit (`deploy.sh`), check `/api/health`, sign in as each role, run `db:preflight`, take a first MongoDB backup and test-restore it.
8. Leave PostgreSQL running read-only for 7 days, then stop it (`systemctl disable --now postgresql`), keep the last `pg_dump` offline, and remove `src/server/db.ts`, `dbSsl.ts`, `db/migrations`, the `pg` package and `store.postgres.mjs`.
9. Update `OPERATIONS.md` section 1 if anything differs, and the offline copies.

Next: phase 7 (the data move: `scripts/mongo/move-from-postgres.mts`, reading PostgreSQL through `pg` with `pgp_sym_decrypt`, re-encrypting contacts, converting audit rows to the list form, counts and spot checks; rehearse on a copy of the live data).

## Phase 7: the data move (complete locally; server rehearsal not yet done)

`scripts/mongo/move-from-postgres.mts` (`npm run db:move`): reads PostgreSQL in one `repeatable read read only` snapshot (changes nothing there), maps every table to its collection (old primary key becomes `_id`, same field names), decrypts contacts with `pgp_sym_decrypt` and re-encrypts them with `contactCrypto.ts` (same `CONTACT_ENC_KEY`), converts audit `changes` objects to the list form, writes with the owner login, reads everything back and compares field for field, and records a `DATA_MOVE` audit entry. Refuses a non-empty target; `--wipe-target` (rehearsals only, refuses the name `smarttb`); `--dry-run` writes nothing. Sessions and failed-login counters are not moved (everyone signs in again). Audit entries naming a deleted account are moved as they are and only reported (that is how account deletion is meant to work).

`scripts/mongo/check-moved.mts` (`npm run db:check-moved`): reads every record back through the app's own functions (participants as PI and as a PK scientist, staff, every staff history, roles, invitations) and checks references. Use it right after the cut-over move.

Rehearsal on the local PostgreSQL test data (74 accounts, 24 participants, 240 modules, 24 encrypted contacts, 876 audit entries, 49 requests, 38 roles, 18 invitations):
- move: all 11 tables written and read back **identical**; cross-checks pass (ten modules each, a contact record each, no orphan modules).
- **Same-screens comparison**: signed in to the deployed PostgreSQL build (commit 38b173f, temporary checkout) and to the MongoDB build on the moved copy, and saved what each shows. Participants (PI view and PK-scientist view, all modules, decrypted contacts, edit history), roles, requests, invitations and all 158 staff-history lines are **identical**. The staff list was identical person for person; only people with exactly the same name could appear in a different order, which PostgreSQL never fixed either. Ties are now broken by email in `listStaff`.
- `check-moved`: 7/7. Then the full end-to-end run on top of the moved data: 10 suites, 319 checks, all pass.

Server rehearsal (done 2026-10-31, with approval): the uncommitted code (no env files) was unpacked in `/tmp/smarttb-rehearsal` as user smarttb and `npm ci`'d there; the live app in `/opt/smarttb/app` was not touched. The move ran from the **live PostgreSQL** (read-only) into a scratch MongoDB database `restore_rehearsal` with the administrator login: dry run clean, then 5 accounts, 9 setup links, 6 roles and 106 audit entries written and read back identical (16 audit entries name deleted accounts, as expected); `check-moved` 7/7 (33 staff-history lines). Then, on the server, a backup of that database with the real `BACKUP_PASSPHRASE` decrypted and tested whole, and the OPERATIONS.md monthly test-restore commands worked as written (`db:restore --admin --into restore_test`, `db:counts --admin --db`, `db:drop-scratch`). Both scratch databases, the backup file and the temporary folder were removed; smarttb, postgresql, mongod and caddy stayed active and healthy throughout.

Commands from OPERATIONS.md now tried on the server: the monthly test restore (all of it). Still to try there at the cut-over: `deploy/backup.sh` itself (installed as `/usr/local/bin/smarttb-backup`), the full restore with `--replace`, `db:counts` against the live database, `db:create-admin`, `db:setup` (password rotation).

Phase 7 is complete. Next: phase 8, the cut-over (checklist above), in an agreed window.

## Phase 8: cut-over (done 2026-10-31, about 10:05 to 10:10 UTC)

1. Final PostgreSQL backups: the usual hourly file (`smarttb-20261031T100522Z.dump.enc`) and an encrypted full dump kept aside as the fallback, `/opt/smarttb/backups/pg-final-20261031T100545Z.dump.enc` (checked readable with `pg_restore --list`; its name is not picked up by the desktop pull or the 72-copy clean-up).
2. App stopped.
3. From a temporary copy of the committed code: `db:setup` (logins refreshed with new random passwords, schema applied), the old phase-1 collections dropped (all empty except three test markers left by the phase-1 checks, `tag: chk16762`, inspected and dropped), `db:migrate`, **the move** (5 accounts, 9 setup links, 6 roles, 106 audit entries; all read back identical), `db:check-moved` 7/7.
4. New `smarttb.service` (reads `/opt/smarttb/.env.mongo`) and new backup script installed; the old ones kept as `/root/smarttb.service.pg-version` and `/root/smarttb-backup.pg-version`; the server's deploy folder replaced by the new one (old one at `/home/azureuser/deploy.pg-version`; its deploy.sh still had the PostgreSQL migrate step).
5. Deployed a3fb6e5 with the new deploy.sh: build, schema, restart, health check OK.
6. Live checks: `db:preflight` all passed; counts as expected (plus the DATA_MOVE audit entry); the new hourly backup ran, verified itself, and test-restored (128 documents) with the OPERATIONS.md commands; a sign-in attempt through the public address answered from MongoDB; `/api/health` ok.
7. PostgreSQL kept running as the way back, set read-only (`ALTER DATABASE smarttb SET default_transaction_read_only = on`).

Everyone has to sign in again (sessions were not moved). Passwords are unchanged.

Way back, if needed in the first days: stop smarttb, reinstall `/root/smarttb.service.pg-version` and `/root/smarttb-backup.pg-version`, `ALTER DATABASE smarttb RESET default_transaction_read_only`, deploy commit 38b173f with `/home/azureuser/deploy.pg-version/deploy.sh 38b173f`. Anything entered in MongoDB since the switch would have to be re-entered.

Left to do after 7 days (around 2026-11-07), if all is well: `systemctl disable --now postgresql`; keep the `pg-final` dump offline; remove `src/server/db.ts`, `src/server/dbSsl.ts`, `db/migrations`, the `pg` package, `tests/e2e/lib/store.postgres.mjs`, `scripts/mongo/move-from-postgres.mts`; remove the PostgreSQL lines (`DATABASE_URL`, `DATABASE_OWNER_URL`) from `/opt/smarttb/.env`; delete `/root/*.pg-version` and `/home/azureuser/deploy.pg-version`.

## Rules for later phases

- The routes and screens do not change. All changes stay in `src/server`, `scripts`, `db` and `tests/e2e/lib/store.mjs`.
- One server file at a time: rewrite it, run only its suite, then move on. Full run once at the end of each phase.
- Every write goes through one function that also writes the audit entry in the same transaction.
- The app's MongoDB user may add to `auditLog` but never change or delete it.
