import React, { useEffect, useState } from 'react';
import { CheckIcon, CopyIcon } from 'lucide-react';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Alert';
import { formatTimestamp } from '../../utils/dates';
import type { SetupLink, StaffMember } from '../../types/staff';

interface SetupLinkSheetProps {
  member: StaffMember | null;
  link: SetupLink | null;
  onClose: () => void;
}

/** Shows a one-time setup link exactly once; it cannot be retrieved again after closing. */
export function SetupLinkSheet({ member, link, onClose }: SetupLinkSheetProps) {
  const [copied, setCopied] = useState(false);
  const url = link ? `${window.location.origin}/setup?token=${encodeURIComponent(link.token)}` : '';

  useEffect(() => setCopied(false), [link]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Sheet
      open={!!member && !!link}
      onClose={onClose}
      title="Setup link"
      description={member ? `Send this link to ${member.name} (${member.email}) so they can set their own password.` : undefined}
      footer={
        <Button className="flex-1" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="break-all rounded-xl border border-line bg-canvas p-3 font-mono text-xs text-ink" aria-label="Setup link">
          {url}
        </div>
        <Button
          variant="secondary"
          className="w-full"
          icon={copied ? <CheckIcon className="h-4 w-4" aria-hidden="true" /> : <CopyIcon className="h-4 w-4" aria-hidden="true" />}
          onClick={() => void copy()}
          data-autofocus
        >
          {copied ? 'Copied' : 'Copy link'}
        </Button>
        <Alert tone="warn" title="This link is shown only once">
          It works once and expires {link ? formatTimestamp(link.expiresAt) : ''}. Send it only to this person, through a private
          channel. If it is lost, issue a new one from their account.
        </Alert>
      </div>
    </Sheet>
  );
}
