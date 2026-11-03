'use client';

import { RequireAuth } from '../../components/auth/RequireAuth';
import { SiteBanner } from '../../components/system/SiteBanner';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <SiteBanner />
      {children}
    </RequireAuth>
  );
}
