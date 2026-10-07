import React from 'react';
import { LockIcon, PencilIcon, SaveIcon } from 'lucide-react';
import { Button } from '../ui/Button';
import type { ModuleAccess, ModuleId } from '../../types/crf';

interface ModuleActionBarProps {
  moduleId: ModuleId;
  access: ModuleAccess;
  editing: boolean;
  recordLocked: boolean;
  errorCount: number;
  attempted: boolean;
  onSaveDraft: () => void;
  onComplete: () => void;
  onEdit: () => void;
}

export function ModuleActionBar({ moduleId, access, editing, recordLocked, errorCount, attempted, onSaveDraft, onComplete, onEdit }: ModuleActionBarProps) {
  const wrapper = 'sticky bottom-0 z-20 border-t border-line bg-white px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:px-0';

  if (access === 'complete' && !editing) {
    return (
      <div className={wrapper}>
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

  const primaryLabel = editing ? 'Save & re-lock' : moduleId === 10 ? 'Close & lock record' : 'Complete & lock module';

  return (
    <div className={wrapper}>
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
