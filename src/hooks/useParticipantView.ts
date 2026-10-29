import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { useCrfStore } from '../contexts/CrfStoreContext';
import { canCompleteModule, canDiscontinue, canEnterModule, canReopenModule } from '../data/roles';
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
  const { actor, updateModuleData, completeModule, saveDraft: storeSaveDraft, requestEdit, discontinue } = store;
  const participant = store.participants.find((p) => p.uid === uid);
  const router = useRouter();
  const params = useSearchParams();
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [attempted, setAttempted] = useState<Partial<Record<ModuleId, boolean>>>({});
  const [busy, setBusy] = useState(false);

  const setModuleParam = useCallback(
    (id: ModuleId | null) => {
      const base = `/p/${encodeURIComponent(uid)}`;
      router.replace(id === null ? base : `${base}?m=${id}`, { scroll: false });
    },
    [router, uid],
  );

  const current: ModuleId = participant ? getCurrentModule(participant) : 1;
  const requested = Number(params.get('m'));
  // Every role can open every module to read it; what a role may fill in is decided separately (canEnter) and by the server.
  const selected: ModuleId = participant && isModuleId(requested) ? requested : current;
  const access = participant ? getAccess(participant, selected) : 'locked';
  const meta = participant?.meta[selected];
  const editing = !!meta?.editing;
  const recordLocked = participant ? isRecordLocked(participant) : false;
  const previewOnly = participant ? isPreviewOnly(participant, selected) : false;
  const canReopen = canReopenModule(actor, selected);
  const canEnter = canEnterModule(actor, selected) || (editing && canReopen);
  const canComplete = canCompleteModule(actor, selected) || (editing && canReopen);
  const readOnly = access === 'locked' || (access === 'complete' && !editing) || (previewOnly && recordLocked) || !canEnter;

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

  const confirmComplete = async () => {
    if (busy) return;
    const wasEditing = editing;
    setBusy(true);
    const result = await completeModule(uid, selected);
    setBusy(false);
    setSheet(null);
    if (!result.ok) {
      if (result.details) setAttempted((a) => ({ ...a, [selected]: true }));
      toast.error(result.error);
      return;
    }
    toast.success(wasEditing ? `Module ${selected} re-locked` : selected === 10 ? 'Record closed and locked' : `Module ${selected} completed & locked`);
    if (!wasEditing && selected !== 9) setModuleParam(null);
  };

  const saveDraft = async () => {
    const result = await storeSaveDraft(uid, selected);
    if (result.ok) toast.success('Draft saved');
    else toast.error(result.error);
  };

  const confirmEdit = async (reason: string) => {
    if (busy) return;
    setBusy(true);
    const result = await requestEdit(uid, selected, reason);
    setBusy(false);
    setSheet(null);
    if (result.ok) toast('Module unlocked for editing — reason logged');
    else toast.error(result.error);
  };

  const confirmDiscontinue = async (reason: M10Reason) => {
    if (busy) return;
    setBusy(true);
    const result = await discontinue(uid, reason);
    setBusy(false);
    setSheet(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
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
    loading: store.loading,
    saving: store.saving,
    user: store.user,
    canEnter,
    canComplete,
    canReopen,
    canDiscontinue: canDiscontinue(actor),
    busy,
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
