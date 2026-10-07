import React from 'react';
import { getModuleDef } from '../../utils/gating';
import type { ModuleAccess, ModuleId } from '../../types/crf';

interface ModuleHeaderProps {
  moduleId: ModuleId;
  access: ModuleAccess;
  editing: boolean;
}

export function ModuleHeader({ moduleId, access, editing }: ModuleHeaderProps) {
  const def = getModuleDef(moduleId);
  const chip = editing
    ? { label: 'Editing — reason logged', cls: 'bg-warn-50 text-warn-700 ring-warn-200' }
    : access === 'complete'
      ? { label: 'Completed · locked', cls: 'bg-ok-50 text-ok-700 ring-ok-200' }
      : access === 'open'
        ? { label: 'Available anytime', cls: 'bg-brand-50 text-brand-700 ring-brand-200' }
        : { label: 'In progress', cls: 'bg-warn-50 text-warn-700 ring-warn-200' };

  return (
    <div className="px-4 pb-4 pt-5 lg:px-0">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-brand-700">Module {moduleId} of 10</p>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${chip.cls}`}>{chip.label}</span>
      </div>
      <h2 className="mt-1.5 text-xl font-semibold leading-snug text-ink sm:text-2xl">{def.title}</h2>
      <p className="mt-1 text-sm text-ink-muted">{def.timing}</p>
    </div>
  );
}
