import React, { useRef } from 'react';
import type { SegmentOption, SegmentTone } from '../../types/ui';

interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T | '';
  onChange: (value: T) => void;
  readOnly?: boolean;
  invalid?: boolean;
  labelledBy?: string;
  describedBy?: string;
  layout?: 'row' | 'stack';
  columns?: number;
}

const SELECTED: Record<SegmentTone, string> = {
  brand: 'border-brand-600 bg-brand-600 text-white',
  ok: 'border-ok-600 bg-ok-600 text-white',
  warn: 'border-warn-600 bg-warn-600 text-white',
  danger: 'border-danger-600 bg-danger-600 text-white',
};

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  readOnly,
  invalid,
  labelledBy,
  describedBy,
  layout = 'row',
  columns,
}: SegmentedControlProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const cols = layout === 'stack' ? 1 : columns ?? Math.min(options.length, 4);
  const selectedIndex = options.findIndex((o) => o.value === value);
  const firstEnabled = options.findIndex((o) => !o.disabled);

  const handleKey = (e: React.KeyboardEvent, index: number) => {
    if (readOnly) return;
    const forward = e.key === 'ArrowRight' || e.key === 'ArrowDown';
    const back = e.key === 'ArrowLeft' || e.key === 'ArrowUp';
    if (!forward && !back) return;
    e.preventDefault();
    let next = index;
    for (let i = 0; i < options.length; i++) {
      next = (next + (forward ? 1 : -1) + options.length) % options.length;
      if (!options[next].disabled) break;
    }
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      aria-readonly={readOnly || undefined}
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {options.map((opt, i) => {
        const selected = opt.value === value;
        const tabbable = selected || (selectedIndex === -1 && i === firstEnabled);
        const inactive = opt.disabled || (readOnly && !selected);
        const tone = selected
          ? SELECTED[opt.tone ?? 'brand']
          : inactive
            ? 'border-line bg-white text-ink-muted'
            : invalid
              ? 'border-danger-600 bg-white text-ink hover:bg-danger-50'
              : 'border-line-strong bg-white text-ink hover:border-brand-500 hover:bg-brand-50';
        return (
          <button
            key={opt.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={readOnly ? (selected ? 0 : -1) : tabbable ? 0 : -1}
            disabled={inactive}
            onClick={() => !readOnly && onChange(opt.value)}
            onKeyDown={(e) => handleKey(e, i)}
            className={`flex min-h-[48px] items-center gap-3 rounded-xl border px-3 py-2 text-sm font-medium transition-[background-color,border-color,color] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 ${
              layout === 'stack' ? 'justify-start text-left' : 'justify-center text-center'
            } ${tone} ${inactive ? 'cursor-not-allowed opacity-50' : ''} ${readOnly ? 'cursor-default' : ''}`}
          >
            {layout === 'stack' && (
              <span
                aria-hidden="true"
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${selected ? 'border-white' : 'border-line-strong'}`}
              >
                {selected && <span className="h-2 w-2 rounded-full bg-white" />}
              </span>
            )}
            {layout === 'stack' ? (
              <span className="flex flex-col">
                <span>{opt.label}</span>
                {opt.description && (
                  <span className={`text-xs font-normal ${selected ? 'text-white/90' : 'text-ink-muted'}`}>{opt.description}</span>
                )}
              </span>
            ) : (
              opt.label
            )}
          </button>
        );
      })}
    </div>
  );
}
