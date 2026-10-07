import React from 'react';
import { LogOutIcon, ShieldCheckIcon } from 'lucide-react';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import type { StaffUser } from '../../types/crf';

interface UserSheetProps {
  open: boolean;
  user: StaffUser;
  email: string;
  isAdmin: boolean;
  idleMinutes: number;
  onClose: () => void;
  onSignOut: () => void;
  onResetDemo: () => void;
}

export function UserSheet({ open, user, email, isAdmin, idleMinutes, onClose, onSignOut, onResetDemo }: UserSheetProps) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Your account"
      description="Your name and role are stamped on every module you complete."
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Close
          </Button>
          <Button variant="danger-outline" className="flex-1" icon={<LogOutIcon className="h-4 w-4" aria-hidden="true" />} onClick={onSignOut}>
            Sign out
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-line p-4">
          <p className="font-semibold text-ink">{user.name}</p>
          <p className="text-sm text-ink-soft">
            {user.role}
            {isAdmin && <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">Admin</span>}
          </p>
          <p className="mt-1 truncate text-sm text-ink-muted">{email}</p>
        </div>
        <p className="flex items-start gap-2 text-sm text-ink-muted">
          <ShieldCheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
          You are signed out automatically after {idleMinutes} minutes of inactivity. Always sign out on shared ward devices.
        </p>
        <div className="border-t border-line pt-4">
          <button
            type="button"
            onClick={onResetDemo}
            className="min-h-[44px] text-sm font-medium text-danger-700 underline-offset-2 hover:underline"
          >
            Reset demo data on this device
          </button>
        </div>
      </div>
    </Sheet>
  );
}
