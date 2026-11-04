import React, { useEffect, useRef, useState } from 'react';
import { CameraIcon, ExternalLinkIcon, Loader2Icon, PlusIcon, UploadIcon } from 'lucide-react';
import { Button } from '../../ui/Button';
import { UNAUTHORIZED_EVENT } from '../../../utils/api';
import { formatTimestamp } from '../../../utils/dates';
import { IMAGE_ID_PATTERN, PHOTOS_PER_KIND } from '../../../utils/sampling';

export interface PhotoInfo {
  id: string;
  timepoint: string;
  kind: 'blood' | 'plasma';
  /** 1-4: which of this kind's photos at the timepoint. */
  shot: number;
  imageId: string;
  bytes: number;
  uploadedBy: string;
  uploadedAt: string;
}

interface PhotoSlotProps {
  uid: string;
  timepoint: string;
  kind: 'blood' | 'plasma';
  /** The 4-digit image ID typed for this kind; every photo of it is filed under that ID. */
  imageId: string;
  /** The current photos of this kind at this timepoint (up to PHOTOS_PER_KIND, numbered by `shot`). */
  photos: PhotoInfo[];
  readOnly: boolean;
  onSaved: (photo: PhotoInfo) => void;
}

/** The server's limit (src/server/images.ts). Photos are sent exactly as the camera took them, never resized. */
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

type Stage = 'uploading' | 'saving';

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

/**
 * Up to PHOTOS_PER_KIND (4) photos of one kind (blood drop or plasma vial) at a timepoint, all under its image ID.
 * Four numbered tiles: tap one to choose it, then Take photo / Upload fills it (or replaces what is there). The first
 * empty tile is chosen to begin with, so taking photos one after another just fills 1, 2, 3, 4. All are optional.
 */
export function PhotoSlot({ uid, timepoint, kind, imageId, photos, readOnly, onSaved }: PhotoSlotProps) {
  const camera = useRef<HTMLInputElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<Stage>('uploading');
  const [sent, setSent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const what = kind === 'blood' ? 'blotting-paper blood photo' : 'plasma light-box photo';
  // A photo is always filed under its image ID, so the ID comes first.
  const idReady = IMAGE_ID_PATTERN.test(imageId);
  const byShot = new Map(photos.map((ph) => [ph.shot, ph]));
  const shots = Array.from({ length: PHOTOS_PER_KIND }, (_, i) => i + 1);
  const firstEmpty = shots.find((n) => !byShot.has(n)) ?? null;
  const [chosen, setChosen] = useState<number>(firstEmpty ?? 1);
  const [picked, setPicked] = useState(false);
  // Until someone taps a tile, keep pointing at the next empty one (also after each upload).
  useEffect(() => {
    if (!picked) setChosen(firstEmpty ?? 1);
  }, [firstEmpty, picked]);
  const current = byShot.get(chosen);

  const upload = async (pickedFile: File) => {
    const shot = chosen;
    setBusy(true);
    setError(null);
    setStage('uploading');
    setSent(0);
    try {
      if (pickedFile.size > MAX_UPLOAD_BYTES) throw new Error('The photo is too large (20 MB at most)');
      const form = new FormData();
      // The original camera file, byte for byte (the protocol asks for full-resolution JPEGs).
      form.append('file', pickedFile, pickedFile.name || 'photo.jpg');
      form.append('timepoint', timepoint);
      form.append('kind', kind);
      form.append('shot', String(shot));
      form.append('imageId', imageId);
      const res = await postWithProgress(`/api/participants/${encodeURIComponent(uid)}/images`, form, (fraction) => {
        setSent(fraction);
        if (fraction >= 1) setStage('saving');
      });
      const json = res.json;
      if (res.status === 401) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
      if (res.status < 200 || res.status >= 300 || !json.photo) throw new Error(json.error ?? `Upload failed (${res.status})`);
      setPicked(false); // move on to the next empty tile
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
    const f = e.target.files?.[0];
    if (f) void upload(f);
  };
  const spinner = <Loader2Icon className="h-4 w-4 animate-spin" aria-hidden="true" />;

  return (
    <div className="mt-2 min-w-0 space-y-2">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-ink-soft">
          Photos <span className="tabular-nums">{photos.length}/{PHOTOS_PER_KIND}</span>
        </span>
        {photos.length > 0 && <span className="text-ink-muted">optional</span>}
      </div>
      <div className="grid grid-cols-4 gap-2" role="group" aria-label={`${what}s, ${timepoint} h`}>
        {shots.map((n) => {
          const ph = byShot.get(n);
          const isChosen = !readOnly && n === chosen;
          const cls = `relative block aspect-square w-full overflow-hidden rounded-lg border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 ${
            isChosen ? 'border-brand-600 ring-2 ring-brand-600/30' : ph ? 'border-line' : 'border-dashed border-line-strong'
          } ${ph ? 'bg-canvas' : 'bg-white'}`;
          const inner = ph ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- a private, signed-in image; not for the image optimiser */}
              <img src={`/api/images/${ph.id}?size=thumb`} alt={`${what} ${n}, ${timepoint} h`} className="h-full w-full object-cover" />
              <span className="absolute bottom-0.5 left-0.5 rounded bg-ink/75 px-1 text-[10px] font-semibold tabular-nums text-white">{n}</span>
            </>
          ) : (
            <span className="flex h-full w-full flex-col items-center justify-center text-ink-muted">
              {!readOnly && <PlusIcon className="h-4 w-4" aria-hidden="true" />}
              <span className="text-[11px] font-semibold tabular-nums">{n}</span>
            </span>
          );
          // Read-only: a filled tile opens the photo; editing: a tile chooses which photo the buttons below fill.
          return readOnly ? (
            ph ? (
              <a key={n} href={`/api/images/${ph.id}`} target="_blank" rel="noopener" className={cls} aria-label={`Open ${what} ${n} full size`}>
                {inner}
              </a>
            ) : (
              <div key={n} className={cls} aria-label={`No ${what} ${n}`}>
                {inner}
              </div>
            )
          ) : (
            <button
              key={n}
              type="button"
              className={cls}
              aria-pressed={isChosen}
              aria-label={ph ? `Photo ${n}: choose to replace it` : `Photo ${n}: empty, choose to add it`}
              onClick={() => {
                setChosen(n);
                setPicked(true);
              }}
              disabled={busy}
            >
              {inner}
            </button>
          );
        })}
      </div>
      {!readOnly && (
        <p className="min-w-0 break-words text-xs text-ink-muted">
          {current ? (
            <>
              Photo {chosen}: {current.uploadedBy} · {formatTimestamp(current.uploadedAt)} ·{' '}
              <a href={`/api/images/${current.id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-0.5 font-medium text-brand-700 underline-offset-2 hover:underline">
                open <ExternalLinkIcon className="h-3 w-3" aria-hidden="true" />
              </a>
            </>
          ) : (
            `Photo ${chosen} is empty`
          )}
        </p>
      )}
      {busy && <UploadProgress stage={stage} fraction={sent} what={what} />}
      {!readOnly && !busy && !idReady && (
        <p className="text-xs text-warn-700">{photos.length ? 'Enter the 4-digit image ID above; the photos are filed under it.' : 'Enter the 4-digit image ID above to add photos.'}</p>
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
            aria-label={current ? `Retake ${what} ${chosen}` : `Take ${what} ${chosen}`}
          >
            {current ? `Retake ${chosen}` : `Take photo ${chosen}`}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="min-w-[8.5rem] flex-1"
            icon={busy ? spinner : <UploadIcon className="h-4 w-4" aria-hidden="true" />}
            onClick={() => file.current?.click()}
            disabled={busy || !idReady}
            aria-label={current ? `Replace ${what} ${chosen} from this device` : `Upload ${what} ${chosen} from this device`}
          >
            {current ? `Replace ${chosen}` : 'Upload'}
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

const STAGE_LABEL: Record<Stage, string> = { uploading: 'Uploading…', saving: 'Saving…' };

/** The bar under a photo while it goes up: the share sent, then saving on the server. */
function UploadProgress({ stage, fraction, what }: { stage: Stage; fraction: number; what: string }) {
  const percent = stage === 'uploading' ? Math.round(fraction * 100) : 100;
  const waiting = stage === 'saving';
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
          style={{ width: `${Math.max(percent, 4)}%` }}
        />
      </div>
    </div>
  );
}
