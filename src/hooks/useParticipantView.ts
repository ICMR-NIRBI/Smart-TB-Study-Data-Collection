import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { useCrfStore } from '../contexts/CrfStoreContext';
import { evaluateEligibility } from '../utils/clinical';
import { getAccess, getCurrentModule, isIneligible, isPreviewOnly, isRecordLocked } from '../utils/gating';
import { validateModule } from '../utils/validation';
import type { CrfData, M10Reason, ModuleId, ModuleKey } from '../types/crf';

export type SheetKind = 'complete' | 'edit' | 'discontinue' | null;

function isModuleId(n: number): n is ModuleId {
  return Number.isInteger(n) && n >= 1 && n <= 10;
}

export function useParticipantView(uid: string) {
  const store = useCrfStore();
  const { updateModuleData, completeModule, saveDraft: storeSaveDraft, requestEdit, discontinue } = store;
  const participant = store.participants.find((p) => p.uid === uid);
  const router = useRouter();
  const params = useSearchParams();
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [attempted, setAttempted] = useState<Partial<Record<ModuleId, boolean>>>({});

  const setModuleParam = useCallback(
    (id: ModuleId | null) => {
      const base = `/p/${encodeURIComponent(uid)}`;
      router.replace(id === null ? base : `${base}?m=${id}`, { scroll: false });
    },
    [router, uid],
  );

  const current: ModuleId = participant ? getCurrentModule(participant) : 1;
  const requested = Number(params.get('m'));
  const selected: ModuleId =
    participant && isModuleId(requested) && getAccess(participant, requested) !== 'locked' ? requested : current;
  const access = participant ? getAccess(participant, selected) : 'locked';
  const meta = participant?.meta[selected];
  const editing = !!meta?.editing;
  const recordLocked = participant ? isRecordLocked(participant) : false;
  const previewOnly = participant ? isPreviewOnly(participant, selected) : false;
  const readOnly = access === 'locked' || (access === 'complete' && !editing) || (previewOnly && recordLocked);

  const errors = useMemo(() => (participant ? validateModule(selected, participant) : {}), [participant, selected]);
  const errorCount = Object.keys(errors).length;
  const isAttempted = !!attempted[selected];
  const visibleErrors = isAttempted ? errors : {};

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [selected]);

  const selectModule = useCallback((id: ModuleId) => setModuleParam(id), [setModuleParam]);
  const prevModule = selected > 1 ? ((selected - 1) as ModuleId) : null;
  const nextModule = selected < 10 ? ((selected + 1) as ModuleId) : null;

  const requestComplete = () => {
    if (errorCount > 0) {
      setAttempted((a) => ({ ...a, [selected]: true }));
      toast.error(`${errorCount} ${errorCount === 1 ? 'field needs' : 'fields need'} attention before locking`);
      window.setTimeout(() => {
        document.querySelector('[data-field-error="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 260);
      return;
    }
    setSheet('complete');
  };

  const confirmComplete = () => {
    const wasEditing = editing;
    completeModule(uid, selected);
    setSheet(null);
    toast.success(wasEditing ? `Module ${selected} re-locked` : selected === 10 ? 'Record closed and locked' : `Module ${selected} completed & locked`);
    if (!wasEditing && selected !== 9) setModuleParam(null);
  };

  const saveDraft = () => {
    storeSaveDraft(uid, selected);
    toast.success('Draft saved on this device');
  };

  const confirmEdit = (reason: string) => {
    requestEdit(uid, selected, reason);
    setSheet(null);
    toast('Module unlocked for editing — reason logged');
  };

  const confirmDiscontinue = (reason: M10Reason) => {
    discontinue(uid, reason);
    setSheet(null);
    setModuleParam(10);
    toast.warning('Participant discontinued — complete Module 10 closeout');
  };

  const onUpdate = useCallback(
    <K extends ModuleKey>(key: K, patch: Partial<CrfData[K]>) => updateModuleData(uid, key, patch),
    [updateModuleData, uid],
  );

  const willBeIneligible = !!participant && selected === 2 && evaluateEligibility(participant.data.m2).eligible === false;
  const ineligible = participant ? isIneligible(participant) : false;

  return {
    participant,
    user: store.user,
    selected,
    access,
    meta,
    editing,
    readOnly,
    previewOnly,
    prevModule,
    nextModule,
    recordLocked,
    ineligible,
    errorCount,
    isAttempted,
    visibleErrors,
    sheet,
    setSheet,
    selectModule,
    requestComplete,
    confirmComplete,
    saveDraft,
    confirmEdit,
    confirmDiscontinue,
    onUpdate,
    willBeIneligible,
  };
}
