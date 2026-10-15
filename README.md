# SMART-TB Study Data Collection

Electronic case report form (CRF) application for the SMART-TB pharmacokinetic study of first-line anti-tuberculosis drugs (HRZE).

- Study site: NRS Medical College & Hospital, Kolkata
- Laboratory: Dr. RMLIMS, Lucknow / ICMR-NIRBI

## Developer

Designed and developed by **Kalpojyoti Koch**, Project Research Scientist, Amity Centre for Artificial Intelligence, in collaboration with ICMR-NIRBI.

To cite this software, use the "Cite this repository" option on GitHub or see `CITATION.cff`.

## Technology

- Next.js 15 and React 19
- PostgreSQL 13 or later, with pgcrypto
- Audit trail kept in the database; contact details encrypted

## Running locally

1. Copy `.env.example` to `.env.local` and fill in the values.
2. Set up the database:
   ```bash
   npm install
   npm run db:setup
   npm run db:migrate
   npm run db:reset     # local only: demo accounts and demo participants
   ```
3. Start the app:
   ```bash
   npm run dev
   ```
   Open http://localhost:3000.

## Deployment

See `deploy/README.md` for server setup, deployment, backups and the go-live checklist.

## Licence

Copyright (c) 2026 Amity Centre for Artificial Intelligence and ICMR-NIRBI. All rights reserved. See `LICENSE`.
