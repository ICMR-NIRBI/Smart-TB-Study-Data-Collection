import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { parseEnv } from './loadenv';

/** Reads KEY=value lines from an env file (missing file = empty; surrounding quotes are removed). */
export function readEnvFile(path: string): Record<string, string> {
  return existsSync(path) ? parseEnv(readFileSync(path, 'utf8')) : {};
}

/** Sets KEY=value in an env file, replacing an existing line. Values are never printed. */
export function setEnvValue(path: string, key: string, value: string): void {
  const text = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const lines = text.split(/\r?\n/);
  const at = lines.findIndex((l) => l.startsWith(`${key}=`));
  if (at >= 0) lines[at] = `${key}=${value}`;
  else {
    while (lines.length && lines[lines.length - 1] === '') lines.pop();
    lines.push(`${key}=${value}`, '');
  }
  writeFileSync(path, lines.join('\n'));
}

/** A password made of letters and digits only, so it can sit in a connection address unescaped. */
export const newPassword = () => randomBytes(24).toString('hex');
