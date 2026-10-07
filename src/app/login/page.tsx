'use client';

import { Suspense } from 'react';
import { LoginView } from '../../views/LoginView';

export default function LoginPage() {
  return (
    <Suspense>
      <LoginView />
    </Suspense>
  );
}
