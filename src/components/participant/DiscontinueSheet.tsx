import React, { useEffect, useState } from 'react';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { ChoiceField } from '../ui/ChoiceField';
import { DISCONTINUATION_REASONS } from '../../data/options';
import type { M10Reason } from '../../types/crf';

interface DiscontinueSheetProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: M10Reason) => void;
}

export function DiscontinueSheet({ open, onClose, onConfirm }: DiscontinueSheetProps) {
  const [reason, setReason] = useState<M10Reason>('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setReason('');
      setTouched(false);
    }
  }, [open]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Discontinue participant"
      description="Remaining study modules will lock and you'll go straight to Module 10 closeout."
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            className="flex-[1.6]"
            onClick={() => {
              setTouched(true);
              if (reason) onConfirm(reason);
            }}
          >
            Go to closeout
          </Button>
        </>
      }
    >
      <ChoiceField
        id="discontinue-reason"
        label="Reason"
        options={DISCONTINUATION_REASONS}
        value={reason === 'screen_failure' ? '' : reason}
        onChange={setReason}
        layout="stack"
        required
        error={touched && !reason ? 'Select a reason' : undefined}
      />
    </Sheet>
  );
}
