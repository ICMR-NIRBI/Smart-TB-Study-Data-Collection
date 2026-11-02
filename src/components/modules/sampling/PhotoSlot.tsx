import React, { useRef, useState } from 'react';
import { CameraIcon, Loader2Icon, UploadIcon } from 'lucide-react';
import { Button } from '../../ui/Button';
import { UNAUTHORIZED_EVENT } from '../../../utils/api';
import { formatTimestamp } from '../../../utils/dates';
import { IMAGE_ID_PATTERN } from '../../../utils/sampling';

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

type Stage = 'preparing' | 'uploading' | 'saving';

/**
 * Sends the form and reports how much has gone up. fetch cannot report upload progress, so this uses XMLHttpRequest.
 * Resolves with the status and JSON body; rejects only when the request could not be made at all.
 */
function postWithProgress(url: string, form: FormData, onProgress: (fraction: number) => void): Promise<{ status: number; json: { photo?: PhotoInfo; error?: string } }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.withCredentials = true;
    xhr.timeout = 180_000;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let json = {};
      try {
        json = JSON.parse(xhr.responseText);
      } catch {
        /* not JSON: handled by the status */
      }
      resolve({ status: xhr.status, json });
    };
    xhr.onerror = () => reject(new Error('The photo could not be sent. Check the connection and try again.'));
    xhr.ontimeout = () => reject(new Error('The upload took too long. Check the connection and try again.'));
    xhr.send(form);
  });
}

/** Attach or replace the photo for one blood or plasma image of a timepoint. */
export function PhotoSlot({ uid, timepoint, kind, imageId, photo, readOnly, onSaved }: PhotoSlotProps) {
  const camera = useRef<HTMLInputElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<Stage>('preparing');
  const [sent, setSent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const what = kind === 'blood' ? 'blotting-paper blood photo' : 'plasma light-box photo';
  // A photo is always filed under its image ID, so the ID comes first.
  const idReady = IMAGE_ID_PATTERN.test(imageId);

  const upload = async (picked: File) => {
    setBusy(true);
    setError(null);
    setStage('preparing');
    setSent(0);
    try {
      const form = new FormData();
      form.append('file', await shrink(picked), 'photo.jpg');
      form.append('timepoint', timepoint);
      form.append('kind', kind);
      form.append('imageId', imageId);
      setStage('uploading');
      const res = await postWithProgress(`/api/participants/${encodeURIComponent(uid)}/images`, form, (fraction) => {
        setSent(fraction);
        if (fraction >= 1) setStage('saving');
      });
      const json = res.json;
      if (res.status === 401) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
      if (res.status < 200 || res.status >= 300 || !json.photo) throw new Error(json.error ?? `Upload failed (${res.status})`);
      onSaved(json.photo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
      if (camera.current) camera.current.value = '';
      if (file.current) file.current.value = '';
    }
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void upload(file);
  };
  const spinner = <Loader2Icon className="h-4 w-4 animate-spin" aria-hidden="true" />;

  return (
    <div className="mt-2 min-w-0 space-y-2">
      <div className="flex min-w-0 items-center gap-3">
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
              <p className="break-words">
                {photo.uploadedBy} · {formatTimestamp(photo.uploadedAt)}
              </p>
            </>
          ) : (
            // While the first photo goes up, the progress bar below says what is happening.
            !busy && <p>{readOnly ? 'No photo attached' : 'No photo yet'}</p>
          )}
        </div>
      </div>
      {busy && <UploadProgress stage={stage} fraction={sent} what={what} />}
      {!readOnly && !busy && !idReady && (
        <p className="text-xs text-warn-700">{photo ? 'Enter the 4-digit image ID above; the photo is filed under it.' : 'Enter the 4-digit image ID above to add the photo.'}</p>
      )}
      {!readOnly && (
        // Two ways in: the camera, or a picture already on the phone or computer. They wrap onto two lines on very
        // narrow screens instead of running off the edge.
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            className="min-w-[8.5rem] flex-1"
            icon={busy ? spinner : <CameraIcon className="h-4 w-4" aria-hidden="true" />}
            onClick={() => camera.current?.click()}
            disabled={busy || !idReady}
            aria-label={photo ? `Take a new ${what}` : `Take the ${what}`}
          >
            {photo ? 'Retake' : 'Take photo'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="min-w-[8.5rem] flex-1"
            icon={busy ? spinner : <UploadIcon className="h-4 w-4" aria-hidden="true" />}
            onClick={() => file.current?.click()}
            disabled={busy || !idReady}
            aria-label={photo ? `Upload a different ${what}` : `Upload the ${what} from this device`}
          >
            {photo ? 'Upload new' : 'Upload'}
          </Button>
        </div>
      )}
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" aria-hidden="true" tabIndex={-1} onChange={onPick} />
      <input ref={file} type="file" accept="image/jpeg,image/png,image/webp,image/*" className="hidden" aria-hidden="true" tabIndex={-1} onChange={onPick} />
      {error && (
        <p role="alert" className="text-sm text-danger-700">
          {error}
        </p>
      )}
    </div>
  );
}

const STAGE_LABEL: Record<Stage, string> = { preparing: 'Preparing photo…', uploading: 'Uploading…', saving: 'Saving…' };

/** The bar under a photo while it goes up: preparing (shrinking on the phone), the share sent, then saving on the server. */
function UploadProgress({ stage, fraction, what }: { stage: Stage; fraction: number; what: string }) {
  const percent = stage === 'uploading' ? Math.round(fraction * 100) : stage === 'saving' ? 100 : 0;
  const waiting = stage !== 'uploading';
  return (
    <div className="space-y-1" aria-live="polite">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-ink-soft">{STAGE_LABEL[stage]}</span>
        {stage === 'uploading' && <span className="tabular-nums text-ink-muted">{percent}%</span>}
      </div>
      <div
        role="progressbar"
        aria-label={`Uploading the ${what}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={waiting ? undefined : percent}
        aria-valuetext={waiting ? STAGE_LABEL[stage] : `${percent}%`}
        className="h-2 overflow-hidden rounded-full bg-line"
      >
        <div
          className={`h-full rounded-full bg-brand-600 transition-[width] duration-200 ease-out ${waiting ? 'animate-pulse' : ''}`}
          style={{ width: `${stage === 'preparing' ? 8 : percent}%` }}
        />
      </div>
    </div>
  );
}
