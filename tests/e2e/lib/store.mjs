// Picks the database the tests look at directly: MongoDB, or PostgreSQL with E2E_DB=postgres (only for a reference run
// against an old checkout of the PostgreSQL version).
export async function openStore() {
  return (await import(process.env.E2E_DB === 'postgres' ? './store.postgres.mjs' : './store.mongo.mjs')).openStore();
}
