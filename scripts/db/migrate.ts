/** Applies pending migrations. Run: npm run db:migrate */
import { connect, migrate, requireEnv } from './lib';

async function main() {
  const client = await connect(requireEnv('DATABASE_OWNER_URL'));
  const applied = await migrate(client);
  await client.end();
  console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date.');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
