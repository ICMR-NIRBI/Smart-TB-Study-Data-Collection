/*
 * Creates the MongoDB logins. Run once per database, in two steps.
 *
 *   1. With the server started WITHOUT --auth (localhost only):
 *        node --import tsx scripts/mongo/setup-auth.mts --bootstrap --env .env.local --port 27018
 *      makes the administrator login and stores its address in the env file as MONGO_ADMIN_URI.
 *   2. After restarting with --auth and a key file:
 *        node --import tsx scripts/mongo/setup-auth.mts --env .env.local --db smarttb_dev
 *      makes (or updates) the two working logins and stores MONGODB_URI and MONGODB_OWNER_URI in the env file.
 *
 * Passwords are generated and written only to the env file; they are never printed.
 *
 *   smarttb_app    what the running app uses. May read and write the app's collections, may only ADD to the audit
 *                  trail (insert and find), and cannot create collections, indexes or touch any other database.
 *   smarttb_owner  for set-up, migrations, backup and restore. Never used by the running app.
 */
import './loadenv';
import { MongoClient } from 'mongodb';
import { ALL_COLLECTIONS, SPECS, ensureSchema } from '../../src/server/mongo/schema';
import { newPassword, readEnvFile, setEnvValue } from './envfile';

const args = process.argv.slice(2);
const flag = (name: string, fallback?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? fallback) : fallback;
};
const envPath = flag('env', process.env.SMARTTB_MONGO_ENV ?? '.env.mongo.local')!;
const port = flag('port', '27018')!;
const dbName = flag('db', 'smarttb')!;
const env = readEnvFile(envPath);

const APP_ROLE = 'smarttbApp';

async function bootstrap() {
  const password = newPassword();
  const client = new MongoClient(`mongodb://127.0.0.1:${port}/?directConnection=true`);
  await client.connect();
  try {
    await client.db('admin').command({ createUser: 'smarttb_root', pwd: password, roles: [{ role: 'root', db: 'admin' }] });
  } finally {
    await client.close();
  }
  setEnvValue(envPath, 'MONGO_ADMIN_URI', `mongodb://smarttb_root:${password}@127.0.0.1:${port}/admin?replicaSet=rs0&authSource=admin`);
  console.log(`Administrator login created; its address is stored in ${envPath} as MONGO_ADMIN_URI.`);
}

async function upsertUser(admin: import('mongodb').Db, user: string, password: string, roles: unknown[]) {
  const exists = (await admin.command({ usersInfo: { user, db: 'admin' } })).users.length > 0;
  await admin.command(exists ? { updateUser: user, pwd: password, roles } : { createUser: user, pwd: password, roles });
}

async function setup() {
  const adminUri = env.MONGO_ADMIN_URI;
  if (!adminUri) throw new Error(`MONGO_ADMIN_URI is missing from ${envPath}. Run the --bootstrap step first.`);
  const client = new MongoClient(adminUri);
  await client.connect();
  try {
    const admin = client.db('admin');

    // The app's role lists its collections one by one, each with the actions the schema allows: privileges can only
    // be added, never taken away, so a whole-database grant could not leave the audit trail append-only.
    const privileges = SPECS.map((spec) => ({ resource: { db: dbName, collection: spec.name }, actions: spec.privileges }));
    const roleSpec = { privileges, roles: [] as unknown[] };
    const roleExists = (await admin.command({ rolesInfo: APP_ROLE })).roles.length > 0;
    await admin.command(roleExists ? { updateRole: APP_ROLE, ...roleSpec } : { createRole: APP_ROLE, ...roleSpec });

    const appPassword = newPassword();
    const ownerPassword = newPassword();
    await upsertUser(admin, 'smarttb_app', appPassword, [{ role: APP_ROLE, db: 'admin' }]);
    await upsertUser(admin, 'smarttb_owner', ownerPassword, [{ role: 'dbOwner', db: dbName }]);

    // Collections, indexes and lock documents, so the app login never has to create anything.
    await ensureSchema(client.db(dbName));

    const base = (user: string, password: string) =>
      `mongodb://${user}:${password}@127.0.0.1:${port}/${dbName}?replicaSet=rs0&authSource=admin`;
    setEnvValue(envPath, 'MONGODB_URI', base('smarttb_app', appPassword));
    setEnvValue(envPath, 'MONGODB_OWNER_URI', base('smarttb_owner', ownerPassword));
    setEnvValue(envPath, 'MONGODB_DB', dbName);
    console.log(`Logins ready for database "${dbName}"; addresses stored in ${envPath} (MONGODB_URI, MONGODB_OWNER_URI, MONGODB_DB).`);
    console.log(`Collections: ${ALL_COLLECTIONS.length} (audit trail append-only for the app login).`);
  } finally {
    await client.close();
  }
}

await (args.includes('--bootstrap') ? bootstrap() : setup());
