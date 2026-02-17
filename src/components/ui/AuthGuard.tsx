'use client';

import { ReactNode } from 'react';
import { useAuth, AuthStatus } from '@/hooks/useAuth';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export function LoginPrompt() {
  return (
    <div className="py-4">
      <div className="mx-auto grid w-full max-w-[860px] gap-5">
        <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_10px_24px_rgba(15,23,42,0.045)]">
          <h1 className="text-lg font-bold">로그인이 필요합니다</h1>
          <p className="helper-text mt-2 leading-relaxed">
            이 페이지를 사용하려면 먼저 로그인해 주세요.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a href="/.auth/login/aad" className="btn-primary no-underline">
              Microsoft 로그인
            </a>
            <a href="/.auth/login/github" className="btn-danger-outline no-underline">
              GitHub 로그인
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}

interface AuthGuardProps {
  children: ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const status: AuthStatus = useAuth();

  if (status === 'loading') {
    return <LoadingSpinner />;
  }

  if (status === 'unauthenticated') {
    return <LoginPrompt />;
  }

  return <>{children}</>;
}
