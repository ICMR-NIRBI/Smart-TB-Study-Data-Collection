import React, { useEffect, useRef, useState } from 'react';
import { EraserIcon, PenLineIcon } from 'lucide-react';
import { FormField } from './FormField';

interface SignaturePadProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  error?: string;
  required?: boolean;
}

export function SignaturePad({ id, label, value, onChange, readOnly, error, required }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [mode, setMode] = useState<'image' | 'pad'>(value ? 'image' : 'pad');
  const showImage = readOnly || (mode === 'image' && !!value);

  useEffect(() => {
    if (showImage) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f1d24';
  }, [showImage]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + 0.1, p.y + 0.1);
    ctx.stroke();
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };

  const onUp = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const canvas = canvasRef.current;
    if (canvas) onChange(canvas.toDataURL('image/png'));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    onChange('');
    setMode('pad');
  };

  const signedView = value.startsWith('typed:') ? (
    <span className="font-serif text-2xl italic text-ink">{value.slice(6)}</span>
  ) : value ? (
    // eslint-disable-next-line @next/next/no-img-element -- data URL signature, not an optimisable asset
    <img src={value} alt={`${label} — captured signature`} className="h-full max-h-28 w-auto object-contain" />
  ) : (
    <span className="text-sm text-ink-muted">Not signed</span>
  );

  return (
    <FormField label={label} labelId={`${id}-label`} messageId={`${id}-msg`} required={required} error={error}>
      {showImage ? (
        <div className="flex min-h-[120px] items-center justify-between gap-3 rounded-xl border border-line bg-canvas px-4 py-3">
          <div className="flex min-h-[96px] flex-1 items-center">{signedView}</div>
          {!readOnly && (
            <button
              type="button"
              onClick={clear}
              className="flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-ink-soft transition-colors duration-150 hover:bg-white"
            >
              <EraserIcon className="h-4 w-4" aria-hidden="true" />
              Re-sign
            </button>
          )}
        </div>
      ) : (
        <div className={`relative rounded-xl border bg-white ${error ? 'border-danger-600' : 'border-line-strong'}`}>
          <canvas
            ref={canvasRef}
            aria-labelledby={`${id}-label`}
            role="img"
            className="block h-36 w-full cursor-crosshair touch-none rounded-xl"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          />
          <div className="pointer-events-none absolute inset-x-4 bottom-8 border-b border-dashed border-line-strong" aria-hidden="true" />
          <div className="flex items-center justify-between border-t border-line px-3 py-1.5">
            <span className="flex items-center gap-1.5 text-xs text-ink-muted">
              <PenLineIcon className="h-3.5 w-3.5" aria-hidden="true" />
              Sign with finger or stylus
            </span>
            <button
              type="button"
              onClick={clear}
              disabled={!value}
              className="min-h-[40px] rounded-lg px-3 text-sm font-medium text-ink-soft transition-colors duration-150 hover:bg-canvas disabled:opacity-40"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </FormField>
  );
}
