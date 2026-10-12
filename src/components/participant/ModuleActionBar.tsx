import React from 'react';
import { ChevronLeftIcon, ChevronRightIcon, EyeIcon, LockIcon, PencilIcon, SaveIcon } from 'lucide-react';
import { Button } from '../ui/Button';
import { PREVIEW_MODE } from '../../data/previewMode';
import type { ModuleAccess, ModuleId } from '../../types/crf';

interface ModuleActionBarProps {
  moduleId: ModuleId;
  access: ModuleAccess;
  editing: boolean;
  recordLocked: boolean;
  errorCount: number;
  attempted: boolean;
  /** Module is reachable only because preview mode lifted its lock. */
  previewOnly?: boolean;
  currentModule?: ModuleId;
  onPrev?: () => void;
  onNext?: () => void;
  onSaveDraft: () => void;
  onComplete: () => void;
  onEdit: () => void;
}

function PreviewNav({ moduleId, onPrev, onNext }: Pick<ModuleActionBarProps, 'moduleId' | 'onPrev' | 'onNext'>) {
  if (!PREVIEW_MODE) return null;
  const btn =
    'flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-sm font-semibold text-brand-700 transition-colors duration-150 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 disabled:cursor-not-allowed disabled:text-lock-300 disabled:hover:bg-transparent';
  return (
    <div className="mb-2 flex items-center justify-between gap-2 border-b border-line pb-2">
      <button type="button" className={btn} onClick={onPrev} disabled={!onPrev}>
        <ChevronLeftIcon className="h-4 w-4" aria-hidden="true" />
        {moduleId > 1 ? `Module ${moduleId - 1}` : 'Previous'}
      </button>
      <span className="flex items-center gap-1 text-xs font-medium text-ink-muted">
        <EyeIcon className="h-3.5 w-3.5" aria-hidden="true" />
        Preview mode
      </span>
      <button type="button" className={btn} onClick={onNext} disabled={!onNext}>
        {moduleId < 10 ? `Module ${moduleId + 1}` : 'Next'}
        <ChevronRightIcon className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

export function ModuleActionBar({
  moduleId,
  access,
  editing,
  recordLocked,
  errorCount,
  attempted,
  previewOnly,
  currentModule,
  onPrev,
  onNext,
  onSaveDraft,
  onComplete,
  onEdit,
}: ModuleActionBarProps) {
  const wrapper = 'sticky bottom-0 z-20 border-t border-line bg-white px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:px-0';
  const nav = <PreviewNav moduleId={moduleId} onPrev={onPrev} onNext={onNext} />;

  if (access === 'complete' && !editing) {
    return (
      <div className={wrapper}>
        {nav}
        <div className="flex items-center gap-3">
          <p className="flex min-w-0 flex-1 items-center gap-2 text-sm text-ink-muted">
            <LockIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{recordLocked ? 'Record closed · read-only' : 'Completed · read-only'}</span>
          </p>
          {!recordLocked && (
            <Button variant="secondary" icon={<PencilIcon className="h-4 w-4" aria-hidden="true" />} onClick={onEdit}>
              Edit (reason required)
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (previewOnly) {
    return (
      <div className={wrapper}>
        {nav}
        <p className="flex items-center gap-2 py-1 text-sm text-ink-muted">
          <LockIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
          {recordLocked
            ? 'Preview only — record closed, read-only'
            : `Preview only${currentModule ? ` — complete Module ${currentModule} first to lock this one` : ''}`}
        </p>
      </div>
    );
  }

  const primaryLabel = editing ? 'Save & re-lock' : moduleId === 10 ? 'Close & lock record' : 'Complete & lock module';

  return (
    <div className={wrapper}>
      {nav}
      {attempted && errorCount > 0 && (
        <p className="mb-2 text-sm font-medium text-danger-700" role="status">
          {errorCount} {errorCount === 1 ? 'field needs' : 'fields need'} attention before locking
        </p>
      )}
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" icon={<SaveIcon className="hidden h-4 w-4 sm:block" aria-hidden="true" />} onClick={onSaveDraft}>
          Save draft
        </Button>
        <Button className="flex-[1.6]" icon={<LockIcon className="hidden h-4 w-4 sm:block" aria-hidden="true" />} onClick={onComplete}>
          {primaryLabel}
        </Button>
      </div>
    </div>
  );
}
