import React from 'react';
import Link from 'next/link';
import { ChevronRightIcon, LogOutIcon, ShieldCheckIcon, UsersIcon } from 'lucide-react';
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
}

export function UserSheet({ open, user, email, isAdmin, idleMinutes, onClose, onSignOut }: UserSheetProps) {
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
        {isAdmin && (
          <Link
            href="/admin"
            className="flex min-h-[52px] items-center gap-3 rounded-2xl border border-line px-4 text-sm font-semibold text-ink transition-colors duration-150 hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
          >
            <UsersIcon className="h-5 w-5 text-brand-600" aria-hidden="true" />
            <span className="flex-1">Manage staff accounts</span>
            <ChevronRightIcon className="h-4 w-4 text-ink-muted" aria-hidden="true" />
          </Link>
        )}
        <p className="flex items-start gap-2 text-sm text-ink-muted">
          <ShieldCheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
          You are signed out automatically after {idleMinutes} minutes of inactivity. Always sign out on shared ward devices.
        </p>
      </div>
    </Sheet>
  );
}
