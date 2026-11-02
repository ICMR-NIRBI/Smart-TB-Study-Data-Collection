import React, { useRef, useState } from 'react';
import { CameraIcon, Loader2Icon } from 'lucide-react';
import { Button } from '../../ui/Button';
import { UNAUTHORIZED_EVENT } from '../../../utils/api';
import { formatTimestamp } from '../../../utils/dates';

export interface PhotoInfo {
  id: string;
  timepoint: string;
  kind: 'blood' | 'plasma';
  imageId: string;
  bytes: number;
  uploadedBy: string;
  uploadedAt: string;
}

interface PhotoSlotProps {
  uid: string;
  timepoint: string;
  kind: 'blood' | 'plasma';
  /** The 4-digit image ID typed for this photo, stored with it for cross-checking. */
  imageId: string;
  photo: PhotoInfo | undefined;
  readOnly: boolean;
  onSaved: (photo: PhotoInfo) => void;
}

const MAX_SIDE = 2048;

/**
 * Makes a phone photo small enough to upload quickly (longest side 2048 px, JPEG). Drawing it again also leaves out
 * the hidden details a camera adds, such as the location. Falls back to the original if the browser cannot read it.
 */
async function shrink(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    return blob ?? file;
  } catch {
    return file;
  }
}

/** Attach or replace the photo for one blood or plasma image of a timepoint. */
export function PhotoSlot({ uid, timepoint, kind, imageId, photo, readOnly, onSaved }: PhotoSlotProps) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const what = kind === 'blood' ? 'blotting-paper blood photo' : 'plasma light-box photo';

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', await shrink(file), 'photo.jpg');
      form.append('timepoint', timepoint);
      form.append('kind', kind);
      form.append('imageId', imageId);
      const res = await fetch(`/api/participants/${encodeURIComponent(uid)}/images`, { method: 'POST', body: form, credentials: 'same-origin' });
      const json = (await res.json().catch(() => ({}))) as { photo?: PhotoInfo; error?: string };
      if (res.status === 401) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
      if (!res.ok || !json.photo) throw new Error(json.error ?? `Upload failed (${res.status})`);
      onSaved(json.photo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex items-center gap-3">
        {photo ? (
          <a
            href={`/api/images/${photo.id}`}
            target="_blank"
            rel="noopener"
            className="block h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-line bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
            aria-label={`Open the ${what} full size`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- a private, signed-in image; not for the image optimiser */}
            <img src={`/api/images/${photo.id}`} alt={`${what}, ${timepoint} h`} className="h-full w-full object-cover" />
          </a>
        ) : null}
        <div className="min-w-0 flex-1 text-xs text-ink-muted">
          {photo ? (
            <>
              <p className="font-medium text-ok-700">Photo attached</p>
              <p className="truncate">
                {photo.uploadedBy} · {formatTimestamp(photo.uploadedAt)}
                {photo.imageId && photo.imageId !== imageId ? ` · filed under ID ${photo.imageId}` : ''}
              </p>
            </>
          ) : (
            <p>{readOnly ? 'No photo attached' : 'No photo yet'}</p>
          )}
        </div>
        {!readOnly && (
          <Button
            variant="secondary"
            icon={busy ? <Loader2Icon className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CameraIcon className="h-4 w-4" aria-hidden="true" />}
            onClick={() => input.current?.click()}
            disabled={busy}
            aria-label={photo ? `Replace the ${what}` : `Add the ${what}`}
          >
            {busy ? 'Uploading…' : photo ? 'Replace' : 'Add photo'}
          </Button>
        )}
        <input
          ref={input}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger-700">
          {error}
        </p>
      )}
    </div>
  );
}
