'use client';

import React, { useEffect, useState } from 'react';
import { MotionConfig } from 'framer-motion';
import { Toaster } from 'sonner';
import { CrfStoreProvider } from '../contexts/CrfStoreContext';
import { AuthProvider } from '../contexts/AuthContext';

export function Providers({ children }: { children: React.ReactNode }) {
  // Session and CRF data live in browser storage, so render only after mount to avoid hydration mismatches.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="min-h-screen bg-canvas" aria-busy="true" />;

  return (
    <MotionConfig reducedMotion="user">
      <CrfStoreProvider>
        <AuthProvider>
          {children}
          <Toaster position="top-center" richColors closeButton />
        </AuthProvider>
      </CrfStoreProvider>
    </MotionConfig>
  );
}
