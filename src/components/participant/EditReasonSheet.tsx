import React, { useEffect, useState } from 'react';
import { MIN_EDIT_REASON_LENGTH } from '../../utils/accountRules';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { TextAreaField } from '../ui/TextAreaField';

interface EditReasonSheetProps {
  open: boolean;
  moduleId: number;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}

const MIN_LENGTH = MIN_EDIT_REASON_LENGTH;

export function EditReasonSheet({ open, moduleId, onClose, onConfirm }: EditReasonSheetProps) {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setReason('');
      setTouched(false);
    }
  }, [open]);

  const tooShort = reason.trim().length < MIN_LENGTH;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Edit Module ${moduleId}`}
      description="Changes to a locked module are recorded in the audit trail."
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="flex-[1.6]"
            onClick={() => {
              setTouched(true);
              if (!tooShort) onConfirm(reason.trim());
            }}
          >
            Unlock for editing
          </Button>
        </>
      }
    >
      <TextAreaField
        id="edit-reason"
        label="Reason for change"
        value={reason}
        onChange={setReason}
        required
        rows={3}
        placeholder="e.g. Transcription error in AST value, corrected from source lab report"
        error={touched && tooShort ? `Enter at least ${MIN_LENGTH} characters` : undefined}
      />
    </Sheet>
  );
}
