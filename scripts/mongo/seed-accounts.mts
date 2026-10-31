/*
 * LOCAL DEVELOPMENT ONLY. Adds the five demo/test accounts, and the demo participants if there are none yet, to the
 * MongoDB database. Safe to run again. Never runs against a database that is not on this computer.
 *   node --import tsx scripts/mongo/seed-accounts.mts      (npm run db:seed)
 */
import './loadenv';
import { closeClient } from '../../src/server/mongo/client';
import { requireLocalDatabase, seedDev } from './seed';

requireLocalDatabase('seed-accounts');
const { accounts, participants } = await seedDev();
await closeClient();
console.log(`Added ${accounts} of 5 accounts (the rest were already there) and ${participants} demo participants.`);
