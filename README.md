# SMART-TB Study Data Collection

Electronic case report form (CRF) application for the SMART-TB pharmacokinetic study of first-line anti-tuberculosis drugs (HRZE).

- Study site: NRS Medical College & Hospital, Kolkata
- Laboratory: Dr. RMLIMS, Lucknow / ICMR-NIRBI

## Developer

Designed and developed by **Kalpojyoti Koch**, Project Research Scientist, Amity Centre for Artificial Intelligence, in collaboration with ICMR-NIRBI.

To cite this software, use the "Cite this repository" option on GitHub or see `CITATION.cff`.

## Technology

- Next.js 15 and React 19
- MongoDB 8.0 (a single-node replica set, with login required)
- Audit trail kept in the database, written in the same transaction as every change; contact details encrypted
- The database layer is in `src/server/mongo/`; `docs/MONGODB_MIGRATION_PLAN.md` explains the design

## Running locally

1. Copy `.env.example` to `.env.local` and fill in the values.
2. Install MongoDB Community 8.0 and start it once without login, as a replica set (any empty folder for the data):
   ```bash
   mongod --dbpath <data folder> --port 27018 --bind_ip 127.0.0.1 --replSet rs0
   ```
3. Create the replica set and the logins (the addresses are written to `.env.mongo.local`, never printed):
   ```bash
   npm install
   npm run db:init-replica-set -- --port 27018
   npm run db:bootstrap -- --port 27018        # administrator login
   ```
   Stop MongoDB, make a key file (`openssl rand -base64 756 > <data folder>/keyfile`), and start it again with login on:
   ```bash
   mongod --dbpath <data folder> --port 27018 --bind_ip 127.0.0.1 --replSet rs0 --auth --keyFile <data folder>/keyfile
   ```
   ```bash
   npm run db:setup -- --db smarttb_dev --port 27018    # app and owner logins, collections, indexes
   npm run db:reset                                    # local only: demo accounts and demo participants
   ```
4. Start the app:
   ```bash
   npm run dev
   ```
   Open http://localhost:3000.

Checks: `npm run db:check` (database set-up and the data layer), `npm run test:e2e` (the whole app through its API,
against a MongoDB test database; see `tests/e2e/run-all.mjs`).

## Deployment

See `deploy/README.md` for server setup, deployment, backups and the go-live checklist.

## Licence

Copyright (c) 2026 Amity Centre for Artificial Intelligence and ICMR-NIRBI. All rights reserved. See `LICENSE`.
