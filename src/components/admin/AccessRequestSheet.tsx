import React, { useEffect, useState } from 'react';
import { CheckIcon, XIcon } from 'lucide-react';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { ChoiceField } from '../ui/ChoiceField';
import { TextAreaField } from '../ui/TextAreaField';
import { Alert } from '../ui/Alert';
import type { RoleKey } from '../../data/roles';
import type { RoleInfo } from '../../types/roles';
import { api } from '../../utils/api';
import { MIN_ADMIN_REASON_LENGTH as MIN_REASON } from '../../utils/accountRules';
import { formatTimestamp } from '../../utils/dates';
import type { AccessRequest } from '../../types/accessRequests';

const roleOptions = (roles: RoleInfo[]) => roles.map((r) => ({ value: r.key, label: r.label, description: r.description }));

interface AccessRequestSheetProps {
  request: AccessRequest | null;
  roles: RoleInfo[];
  onClose: () => void;
  /** Called after the PI approves or rejects, so the lists can reload. */
  onDecided: (request: AccessRequest, outcome: 'approved' | 'rejected') => void;
}

export function AccessRequestSheet({ request, roles, onClose, onDecided }: AccessRequestSheetProps) {
  const [role, setRole] = useState<RoleKey>('research_officer');
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = request?.id;

  useEffect(() => {
    if (!request) return;
    setRole(request.requestedRole);
    setRejecting(false);
    setReason('');
    setTouched(false);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!request) return <Sheet open={false} onClose={onClose} title="" />;

  const pending = request.status === 'pending';
  const labelOf = (key: string) => roles.find((r) => r.key === key)?.label ?? key;
  const decide = async (action: 'approve' | 'reject') => {
    setTouched(true);
    if (busy || (action === 'reject' && reason.trim().length < MIN_REASON)) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/requests/${request.id}`, { method: 'POST', body: action === 'approve' ? { action, role } : { action, reason } });
      onDecided(request, action === 'approve' ? 'approved' : 'rejected');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the decision');
    } finally {
      setBusy(false);
    }
  };

  const details = (
    <dl className="space-y-3 rounded-2xl border border-line p-4 text-sm">
      <div>
        <dt className="text-ink-muted">Asked for</dt>
        <dd className="font-medium text-ink">{labelOf(request.requestedRole)}</dd>
      </div>
      <div>
        <dt className="text-ink-muted">What they wrote</dt>
        <dd className="whitespace-pre-wrap text-ink">{request.note}</dd>
      </div>
      <div>
        <dt className="text-ink-muted">Sent</dt>
        <dd className="text-ink">{formatTimestamp(request.createdAt)}</dd>
      </div>
      {pending && (
        <div>
          <dt className="text-ink-muted">Expires</dt>
          <dd className="text-ink">{formatTimestamp(request.expiresAt)}</dd>
        </div>
      )}
    </dl>
  );

  if (!pending) {
    return (
      <Sheet
        open
        onClose={onClose}
        title={request.name}
        description={request.email}
        footer={
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Close
          </Button>
        }
      >
        <div className="space-y-4">
          {details}
          <Alert tone={request.status === 'approved' ? 'ok' : 'neutral'} title={{ approved: 'Approved', rejected: 'Rejected', expired: 'Expired', pending: '' }[request.status]}>
            {request.status === 'approved' && `${request.decidedBy} approved this as ${request.decisionRole ? labelOf(request.decisionRole) : 'staff'} on ${formatTimestamp(request.decidedAt)}.`}
            {request.status === 'rejected' && `${request.decidedBy} rejected this on ${formatTimestamp(request.decidedAt)}: “${request.decisionReason}”`}
            {request.status === 'expired' && 'It was not reviewed in time. The person can send a new request.'}
          </Alert>
        </div>
      </Sheet>
    );
  }

  if (rejecting) {
    return (
      <Sheet
        open
        onClose={() => setRejecting(false)}
        title="Reject request"
        description={`${request.name} · ${request.email}`}
        footer={
          <>
            <Button variant="secondary" className="flex-1" onClick={() => setRejecting(false)} disabled={busy}>
              Back
            </Button>
            <Button variant="danger" className="flex-[1.6]" onClick={() => void decide('reject')} disabled={busy}>
              {busy ? 'Saving…' : 'Reject request'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error && <Alert tone="danger" title={error} />}
          <p className="text-sm text-ink-soft">No account is created and the password they chose is discarded. Your reason is kept in the audit trail.</p>
          <TextAreaField
            id="reject-reason"
            label="Reason"
            value={reason}
            onChange={setReason}
            required
            rows={3}
            error={touched && reason.trim().length < MIN_REASON ? `Enter at least ${MIN_REASON} characters` : undefined}
          />
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={request.name}
      description={request.email}
      footer={
        <>
          <Button variant="danger-outline" className="flex-1" icon={<XIcon className="h-4 w-4" aria-hidden="true" />} onClick={() => setRejecting(true)} disabled={busy}>
            Reject
          </Button>
          <Button className="flex-[1.6]" icon={<CheckIcon className="h-4 w-4" aria-hidden="true" />} onClick={() => void decide('approve')} disabled={busy}>
            {busy ? 'Saving…' : 'Approve'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {error && <Alert tone="danger" title={error} />}
        {details}
        <ChoiceField
          id="approve-role"
          label="Role to give"
          options={roleOptions(roles)}
          value={role}
          onChange={setRole}
          layout="stack"
          hint="They can sign in straight away, with the password they chose. Admin rights and extra modules are set afterwards on their staff page."
        />
      </div>
    </Sheet>
  );
}
