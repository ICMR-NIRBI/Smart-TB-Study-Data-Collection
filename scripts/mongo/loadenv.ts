/*
 * Imported first by every command-line script. Fills in process.env from env files, so the same command works on a
 * developer's computer and on the server without shell tricks (the MongoDB addresses contain "&", so these files must
 * never be loaded with `source`).
 *
 *   SMARTTB_ENV_FILES   comma-separated file list. Default: .env.local,.env.mongo.local (relative to where you run).
 *                       On the server: /opt/smarttb/.env,/opt/smarttb/.env.mongo
 *
 * Variables already set in the real environment win over the files; between files, later ones win.
 */
import { existsSync, readFileSync } from 'node:fs';

export function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || line.trimStart().startsWith('#')) continue;
    let value = m[2];
    if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) value = value.slice(1, -1);
    out[m[1]] = value;
  }
  return out;
}

const files = (process.env.SMARTTB_ENV_FILES ?? '.env.local,.env.mongo.local').split(',').map((f) => f.trim()).filter(Boolean);
const merged: Record<string, string> = {};
for (const file of files) if (existsSync(file)) Object.assign(merged, parseEnv(readFileSync(file, 'utf8')));
for (const [key, value] of Object.entries(merged)) if (!(key in process.env)) process.env[key] = value;
