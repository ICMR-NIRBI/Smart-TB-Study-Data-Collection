'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { ParticipantView } from '../../../../views/ParticipantView';

export default function ParticipantPage() {
  const { uid } = useParams<{ uid: string }>();
  return (
    <Suspense>
      <ParticipantView uid={decodeURIComponent(uid)} />
    </Suspense>
  );
}
