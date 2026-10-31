import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { Binary } from 'mongodb';

/*
 * Participants' phone numbers and addresses are stored encrypted (AES-256-GCM) and only decrypted for people who may
 * see them. The key is derived from CONTACT_ENC_KEY. Each value is bound to its participant and field, so a value
 * copied onto another record does not decrypt. Stored as: 1 version byte, 12 byte nonce, 16 byte tag, ciphertext.
 * (This replaces PostgreSQL's pgcrypto; the data move re-encrypts existing values.)
 */

const VERSION = 1;
let derived: { source: string; key: Buffer } | null = null;

function key(): Buffer {
  const source = process.env.CONTACT_ENC_KEY;
  if (!source || source.length < 32) throw new Error('CONTACT_ENC_KEY must be set (at least 32 characters) — see web/.env.example');
  if (!derived || derived.source !== source) derived = { source, key: scryptSync(source, 'smarttb-contact-key-v1', 32) };
  return derived.key;
}

const aad = (uid: string, field: string) => Buffer.from(`${uid}:${field}`);

export function encryptContact(text: string, uid: string, field: string): Binary {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), nonce);
  cipher.setAAD(aad(uid, field));
  const body = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return new Binary(Buffer.concat([Buffer.from([VERSION]), nonce, cipher.getAuthTag(), body]));
}

export function decryptContact(stored: Binary | Buffer | null | undefined, uid: string, field: string): string {
  if (!stored) return '';
  const raw = stored instanceof Binary ? Buffer.from(stored.buffer) : Buffer.from(stored);
  if (raw[0] !== VERSION) throw new Error('Unknown contact encryption version');
  const decipher = createDecipheriv('aes-256-gcm', key(), raw.subarray(1, 13));
  decipher.setAAD(aad(uid, field));
  decipher.setAuthTag(raw.subarray(13, 29));
  return Buffer.concat([decipher.update(raw.subarray(29)), decipher.final()]).toString('utf8');
}
