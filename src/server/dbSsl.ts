import { readFileSync } from 'node:fs';
import type { ConnectionOptions } from 'node:tls';

/**
 * TLS settings for PostgreSQL connections, shared by the app and the db scripts.
 *   DATABASE_SSL_CA=/path/to/ca.pem  verify the server against this CA (managed databases such as E2E DBaaS)
 *   DATABASE_SSL=require             encrypt without verifying the certificate (only if no CA file is available)
 *   neither                          no TLS (local database on the same machine)
 */
export function dbSsl(): ConnectionOptions | undefined {
  const caPath = process.env.DATABASE_SSL_CA;
  if (caPath) return { ca: readFileSync(caPath, 'utf8'), rejectUnauthorized: true };
  if (process.env.DATABASE_SSL === 'require') return { rejectUnauthorized: false };
  return undefined;
}
