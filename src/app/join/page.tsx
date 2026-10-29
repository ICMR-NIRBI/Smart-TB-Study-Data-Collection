'use client';

import { Suspense } from 'react';
import { JoinView } from '../../views/JoinView';

export default function JoinPage() {
  return (
    <Suspense>
      <JoinView />
    </Suspense>
  );
}
