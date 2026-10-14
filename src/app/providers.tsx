'use client';

import React, { useEffect, useState } from 'react';
import { MotionConfig } from 'framer-motion';
import { Toaster } from 'sonner';
import { CrfStoreProvider } from '../contexts/CrfStoreContext';
import { AuthProvider } from '../contexts/AuthContext';
import { LoadingScreen } from '../components/auth/LoadingScreen';

export function Providers({ children }: { children: React.ReactNode }) {
  // The session and CRF data are fetched in the browser, so render only after mount to avoid hydration mismatches.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <LoadingScreen />;

  return (
    <MotionConfig reducedMotion="user">
      <AuthProvider>
        <CrfStoreProvider>
          {children}
          <Toaster position="top-center" richColors closeButton />
        </CrfStoreProvider>
      </AuthProvider>
    </MotionConfig>
  );
}
