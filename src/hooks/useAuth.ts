'use client';

import { useEffect, useState } from 'react';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export function useAuth() {
  const [status, setStatus] = useState<AuthStatus>('loading');

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const res = await fetch('/.auth/me', { cache: 'no-store' });
        if (!res.ok) {
          if (mounted) setStatus('unauthenticated');
          return;
        }
        const data = await res.json() as
          | Array<{ clientPrincipal?: Record<string, unknown> | null }>
          | { clientPrincipal?: Record<string, unknown> | null };

        const principal = Array.isArray(data)
          ? data?.[0]?.clientPrincipal
          : data?.clientPrincipal;

        if (mounted) {
          setStatus(principal && typeof principal === 'object' ? 'authenticated' : 'unauthenticated');
        }
      } catch {
        if (mounted) setStatus('unauthenticated');
      }
    })();

    return () => { mounted = false; };
  }, []);

  return status;
}
