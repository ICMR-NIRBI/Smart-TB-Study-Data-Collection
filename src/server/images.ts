import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ApiError } from './errors';
import type { Reads, Tx } from './mongo/tx';
import { assertModuleEditable, type ActingUser } from './participants';
import { TIMEPOINTS } from '../data/timepoints';

/*
 * Module 5 photographs: the blood drop on blotting paper and the plasma vial against the light box, one of each per
 * blood timepoint (18 per participant, as the CRF counts them). The picture files are kept on disk, outside the
 * database (they would make every hourly database backup large); the database keeps a record of each one. Files are
 * named by their content (SHA-256), never changed and never deleted: a replaced photo stays on record.
 * Backups: deploy/backup.sh archives new photos every hour, separately from the database dump.
 */

export const PHOTO_KINDS = ['blood', 'plasma'] as const;
export type PhotoKind = (typeof PHOTO_KINDS)[number];
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

export interface PhotoInfo {
  id: string;
  timepoint: string;
  kind: PhotoKind;
  imageId: string;
  bytes: number;
  uploadedBy: string;
  uploadedAt: string;
}

interface ImageDoc {
  _id: string;
  participant_uid: string;
  module_id: number;
  timepoint: string;
  kind: PhotoKind;
  image_id: string;
  file: string;
  sha256: string;
  mime: string;
  bytes: number;
  uploaded_by: string;
  uploaded_by_name: string;
  uploaded_at: Date;
  replaced_at: Date | null;
  replaced_by: string | null;
}

export const uploadDir = () => process.env.SMARTTB_UPLOAD_DIR ?? join(process.cwd(), '.uploads');

/** The picture type from its first bytes (not from the name or what the browser says). */
function detectType(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}

const toInfo = (d: ImageDoc): PhotoInfo => ({
  id: d._id,
  timepoint: d.timepoint,
  kind: d.kind,
  imageId: d.image_id,
  bytes: d.bytes,
  uploadedBy: d.uploaded_by_name,
  uploadedAt: d.uploaded_at.toISOString(),
});

/** The current photo for each timepoint and kind (replaced ones are left out). */
export async function listPhotos(q: Reads, uid: string): Promise<PhotoInfo[]> {
  const docs = await q.find<ImageDoc>('crf_images', { participant_uid: uid, replaced_at: null }, { sort: { timepoint: 1, kind: 1 } });
  return docs.map(toInfo);
}

/**
 * Attaches a photo to a timepoint. Allowed only to someone who may fill in Module 5 while it is open (the same rule as
 * typing in it). A photo already there is kept on record as replaced.
 */
export async function savePhoto(
  tx: Tx,
  user: ActingUser,
  uid: string,
  input: { timepoint: unknown; kind: unknown; imageId: unknown; bytes: Buffer },
): Promise<PhotoInfo> {
  const timepoint = typeof input.timepoint === 'string' ? input.timepoint : '';
  if (!TIMEPOINTS.some((t) => t.key === timepoint && !t.salivaOnly)) throw new ApiError(400, 'Choose a blood sampling timepoint');
  const kind = PHOTO_KINDS.find((k) => k === input.kind);
  if (!kind) throw new ApiError(400, 'Say whether this is the blood or the plasma photo');
  const imageId = typeof input.imageId === 'string' && /^\d{0,4}$/.test(input.imageId) ? input.imageId : '';
  if (!input.bytes.length) throw new ApiError(400, 'The photo is empty');
  if (input.bytes.length > MAX_PHOTO_BYTES) throw new ApiError(413, 'The photo is too large (8 MB at most)');
  const type = detectType(input.bytes);
  if (!type) throw new ApiError(400, 'This is not a JPEG, PNG or WebP picture');

  await assertModuleEditable(tx, user, uid, 5);

  const sha256 = createHash('sha256').update(input.bytes).digest('hex');
  const file = `${uid}/${sha256}.${type.ext}`;
  const dir = join(uploadDir(), uid);
  await mkdir(dir, { recursive: true });
  // Written under a temporary name and then renamed, so a half-written file is never seen. The name is the content's
  // fingerprint, so writing it again (a retried transaction, the same photo twice) is harmless.
  const tmp = join(dir, `${sha256}.${randomUUID()}.tmp`);
  await writeFile(tmp, input.bytes, { mode: 0o640 });
  await rename(tmp, join(uploadDir(), file));

  const now = new Date();
  await tx.updateMany('crf_images', { participant_uid: uid, timepoint, kind, replaced_at: null }, { $set: { replaced_at: now, replaced_by: user.id } });
  const doc: ImageDoc = {
    _id: randomUUID(),
    participant_uid: uid,
    module_id: 5,
    timepoint,
    kind,
    image_id: imageId,
    file,
    sha256,
    mime: type.mime,
    bytes: input.bytes.length,
    uploaded_by: user.id,
    uploaded_by_name: user.name,
    uploaded_at: now,
    replaced_at: null,
    replaced_by: null,
  };
  await tx.insertOne('crf_images', doc);
  return toInfo(doc);
}

/** A stored photo's bytes, for showing it to someone signed in. */
export async function readPhoto(q: Reads, id: string): Promise<{ bytes: Buffer; mime: string; name: string }> {
  const doc = await q.findOne<ImageDoc>('crf_images', { _id: id as never });
  if (!doc) throw new ApiError(404, 'Photo not found');
  try {
    const bytes = await readFile(join(uploadDir(), doc.file));
    return { bytes, mime: doc.mime, name: `${doc.participant_uid}-${doc.timepoint}h-${doc.kind}.${doc.file.split('.').pop()}` };
  } catch {
    throw new ApiError(404, 'The photo file is missing on the server. Restore it from the photo backups.');
  }
}
