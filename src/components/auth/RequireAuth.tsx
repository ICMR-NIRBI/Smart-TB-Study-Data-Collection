'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { LoadingScreen } from './LoadingScreen';

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !session) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [session, loading, router, pathname]);

  if (!session) return <LoadingScreen message={loading ? 'Checking your session…' : 'Redirecting to log in…'} />;
  return <>{children}</>;
}
