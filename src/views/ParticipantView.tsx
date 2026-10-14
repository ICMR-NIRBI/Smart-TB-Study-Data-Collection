import React from 'react';
import Link from 'next/link';
import { SearchXIcon } from 'lucide-react';
import { LoadingScreen } from '../components/auth/LoadingScreen';
import { ParticipantTopBar } from '../components/participant/ParticipantTopBar';
import { ModuleStepper } from '../components/participant/ModuleStepper';
import { ParticipantBanners } from '../components/participant/ParticipantBanners';
import { VisitWindowChips } from '../components/participant/VisitWindowChips';
import { ModuleHeader } from '../components/participant/ModuleHeader';
import { ModuleRenderer } from '../components/participant/ModuleRenderer';
import { ModuleFooterMeta } from '../components/participant/ModuleFooterMeta';
import { ModuleActionBar } from '../components/participant/ModuleActionBar';
import { CompleteModuleSheet } from '../components/participant/CompleteModuleSheet';
import { EditReasonSheet } from '../components/participant/EditReasonSheet';
import { DiscontinueSheet } from '../components/participant/DiscontinueSheet';
import { useParticipantView } from '../hooks/useParticipantView';
import { completedCount, getCurrentModule, getStatus } from '../utils/gating';

export function ParticipantView({ uid }: { uid: string }) {
  const view = useParticipantView(uid);
  const { participant } = view;

  if (!participant && view.loading) {
    return <LoadingScreen message="Loading participant record…" />;
  }

  if (!participant || !view.meta) {
    return (
      <main className="flex min-h-screen w-full flex-col items-center justify-center gap-3 bg-canvas px-6 text-center">
        <SearchXIcon className="h-10 w-10 text-ink-muted" aria-hidden="true" />
        <h1 className="text-lg font-semibold text-ink">Participant not found</h1>
        <p className="max-w-sm text-sm text-ink-muted">This record does not exist, or the link is incomplete. Open the participant from the dashboard.</p>
        <Link href="/" className="mt-2 flex min-h-[48px] items-center rounded-xl bg-brand-600 px-5 font-semibold text-white hover:bg-brand-700">
          Back to dashboard
        </Link>
      </main>
    );
  }

  const status = getStatus(participant);
  const canDiscontinue = view.canDiscontinue && !view.recordLocked && !view.ineligible && !participant.discontinuationRequested;
  const canReportAe = !view.recordLocked && !view.ineligible;

  return (
    <div className="min-h-screen w-full bg-canvas">
      <ParticipantTopBar
        participantId={participant.data.m1.participantId}
        status={status}
        progress={completedCount(participant)}
        canReportAe={canReportAe}
        canDiscontinue={canDiscontinue}
        onReportAe={() => view.selectModule(9)}
        onDiscontinue={() => view.setSheet('discontinue')}
      />
      <div className="sticky top-14 z-20 border-b border-line bg-white lg:hidden">
        <ModuleStepper participant={participant} selected={view.selected} onSelect={view.selectModule} orientation="horizontal" />
      </div>

      <div className="mx-auto flex max-w-6xl gap-8 lg:px-6">
        <aside className="hidden w-72 shrink-0 lg:block">
          <div className="sticky top-14 max-h-[calc(100vh-3.5rem)] overflow-y-auto py-6">
            <ModuleStepper participant={participant} selected={view.selected} onSelect={view.selectModule} orientation="vertical" />
          </div>
        </aside>

        <main className="min-w-0 flex-1 lg:max-w-3xl">
          <div className="space-y-3 px-4 pt-4 lg:px-0 lg:pt-6">
            <ParticipantBanners participant={participant} />
            <VisitWindowChips startDate={participant.data.m4.startDate} />
          </div>
          <ModuleHeader moduleId={view.selected} access={view.access} editing={view.editing} previewOnly={view.previewOnly} />
          <div key={view.selected} className="px-4 pb-8 lg:px-0">
            <ModuleRenderer
              participant={participant}
              moduleId={view.selected}
              readOnly={view.readOnly}
              errors={view.visibleErrors}
              onUpdate={view.onUpdate}
              onOpenModule={view.selectModule}
              onDiscontinue={view.confirmDiscontinue}
            />
            <ModuleFooterMeta meta={view.meta} />
          </div>
          <ModuleActionBar
            moduleId={view.selected}
            access={view.access}
            editing={view.editing}
            recordLocked={view.recordLocked}
            errorCount={view.errorCount}
            attempted={view.isAttempted}
            previewOnly={view.previewOnly}
            canEnter={view.canEnter}
            canComplete={view.canComplete}
            canReopen={view.canReopen}
            roleLabel={view.user.role}
            saving={view.saving}
            busy={view.busy}
            currentModule={getCurrentModule(participant)}
            onPrev={view.prevModule ? () => view.selectModule(view.prevModule!) : undefined}
            onNext={view.nextModule ? () => view.selectModule(view.nextModule!) : undefined}
            onSaveDraft={view.saveDraft}
            onComplete={view.requestComplete}
            onEdit={() => view.setSheet('edit')}
          />
        </main>
      </div>

      <CompleteModuleSheet
        open={view.sheet === 'complete'}
        moduleId={view.selected}
        editing={view.editing}
        user={view.user}
        willBeIneligible={view.willBeIneligible}
        onClose={() => view.setSheet(null)}
        onConfirm={view.confirmComplete}
      />
      <EditReasonSheet open={view.sheet === 'edit'} moduleId={view.selected} onClose={() => view.setSheet(null)} onConfirm={view.confirmEdit} />
      <DiscontinueSheet open={view.sheet === 'discontinue'} onClose={() => view.setSheet(null)} onConfirm={view.confirmDiscontinue} />
    </div>
  );
}
