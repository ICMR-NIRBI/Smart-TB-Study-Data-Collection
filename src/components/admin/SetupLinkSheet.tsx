import React, { useEffect, useState } from 'react';
import { CheckIcon, CopyIcon } from 'lucide-react';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Alert';
import { copyText } from '../../utils/clipboard';
import { formatTimestamp } from '../../utils/dates';
import type { StaffInvite } from '../../types/invites';
import type { SetupLink, StaffMember } from '../../types/staff';

interface SetupLinkSheetProps {
  /** An existing account the link belongs to (password setup or reset). */
  member: StaffMember | null;
  /** Or a role invitation: the person fills in their own details at the link. */
  invite: StaffInvite | null;
  link: SetupLink | null;
  onClose: () => void;
}

/** Shows a one-time setup link exactly once; it cannot be retrieved again after closing. */
export function SetupLinkSheet({ member, invite, link, onClose }: SetupLinkSheetProps) {
  const [copied, setCopied] = useState(false);
  const url = link ? `${window.location.origin}${invite ? '/join' : '/setup'}?token=${encodeURIComponent(link.token)}` : '';

  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setCopied(false);
    setFailed(false);
  }, [link]);

  const copy = async () => {
    const ok = await copyText(url);
    setCopied(ok);
    setFailed(!ok);
  };

  return (
    <Sheet
      open={(!!member || !!invite) && !!link}
      onClose={onClose}
      title={invite ? 'Invitation link' : 'Setup link'}
      description={
        invite
          ? `Send this link to the new ${invite.roleLabel}. They type their own name, email and password.`
          : member
            ? `Send this link to ${member.name} (${member.email}) so they can set their own password.`
            : undefined
      }
      footer={
        <Button className="flex-1" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="select-all break-all rounded-xl border border-line bg-canvas p-3 font-mono text-xs text-ink" aria-label="Setup link">
          {url}
        </div>
        {failed && <Alert tone="danger" title="Could not copy automatically. Press and hold the link above, then choose Copy." />}
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
          channel. If it is lost, {invite ? 'withdraw it and make a new one.' : 'issue a new one from their account.'}
        </Alert>
      </div>
    </Sheet>
  );
}
