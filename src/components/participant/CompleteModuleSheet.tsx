import React from 'react';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Alert';
import { getModuleDef } from '../../utils/gating';
import type { ModuleId, StaffUser } from '../../types/crf';

interface CompleteModuleSheetProps {
  open: boolean;
  moduleId: ModuleId;
  editing: boolean;
  user: StaffUser;
  willBeIneligible: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function CompleteModuleSheet({ open, moduleId, editing, user, willBeIneligible, onClose, onConfirm }: CompleteModuleSheetProps) {
  const def = getModuleDef(moduleId);
  const title = editing ? `Re-lock Module ${moduleId}?` : moduleId === 10 ? 'Close and lock this record?' : `Complete & lock Module ${moduleId}?`;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      description={def.title}
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-[1.6]" onClick={onConfirm} data-autofocus>
            {editing ? 'Save & re-lock' : moduleId === 10 ? 'Close record' : 'Complete & lock'}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm text-ink-soft">
        <p>
          {moduleId === 10
            ? 'Every module in this CRF will become read-only. This cannot be undone from the device.'
            : 'The module becomes read-only. Later changes require a logged reason.'}
          {!editing && moduleId < 8 && ' The next module will unlock.'}
        </p>
        {willBeIneligible && (
          <Alert tone="danger" title="Participant will be marked ineligible">
            Modules 3–9 will be locked and the participant routed to Module 10 closeout as a screen failure.
          </Alert>
        )}
        <div className="rounded-xl bg-canvas px-4 py-3">
          <p className="text-xs font-medium text-ink-muted">Signing as</p>
          <p className="font-semibold text-ink">
            {user.name} <span className="font-normal text-ink-muted">· {user.role}</span>
          </p>
        </div>
      </div>
    </Sheet>
  );
}
