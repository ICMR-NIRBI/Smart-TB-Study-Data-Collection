'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!session) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [session, router, pathname]);

  if (!session) return <div className="min-h-screen bg-canvas" aria-busy="true" />;
  return <>{children}</>;
}
