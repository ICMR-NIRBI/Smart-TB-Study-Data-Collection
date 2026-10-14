'use client';

import { Suspense } from 'react';
import { SetupView } from '../../views/SetupView';

export default function SetupPage() {
  return (
    <Suspense>
      <SetupView />
    </Suspense>
  );
}
