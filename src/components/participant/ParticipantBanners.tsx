import React from 'react';
import { Alert } from '../ui/Alert';
import { REASON_LABELS } from '../../data/options';
import { evaluateEligibility } from '../../utils/clinical';
import { formatDMY } from '../../utils/dates';
import { isIneligible, isRecordLocked } from '../../utils/gating';
import type { Participant } from '../../types/crf';

export function ParticipantBanners({ participant }: { participant: Participant }) {
  const ineligible = isIneligible(participant);
  const locked = isRecordLocked(participant);
  const m10 = participant.data.m10;
  const reason = m10.reason ? REASON_LABELS[m10.reason] : '';

  if (ineligible) {
    const result = evaluateEligibility(participant.data.m2);
    const failed = [...result.failedInclusion.map((c) => `Inclusion not met: ${c.label}`), ...result.positiveExclusion.map((c) => `Exclusion: ${c.label}`)];
    return (
      <Alert tone="danger" title="Ineligible – screen failure">
        <p>{failed.join(' · ')}</p>
        <p className="mt-1">{locked ? `Record closed ${formatDMY(m10.date)}.` : 'Modules 3–9 are locked. Complete Module 10 closeout.'}</p>
      </Alert>
    );
  }
  if (locked) {
    return m10.status === 'completed' ? (
      <Alert tone="ok" title="Study completed — record closed">
        2-month follow-up completed {formatDMY(m10.date)}. All modules are read-only.
      </Alert>
    ) : (
      <Alert tone="neutral" title="Discontinued — record closed">
        {reason} · {formatDMY(m10.date)}. All modules are read-only.
      </Alert>
    );
  }
  if (participant.discontinuationRequested) {
    return (
      <Alert tone="warn" title="Discontinuation in progress">
        {reason ? `${reason}. ` : ''}Remaining study modules are locked — complete Module 10 to close the record.
      </Alert>
    );
  }
  return null;
}
