'use client';

import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

function resolveInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';

  const saved = window.localStorage.getItem('theme');
  if (saved === 'light' || saved === 'dark') {
    return saved;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    const initialTheme = resolveInitialTheme();
    setTheme(initialTheme);
    document.documentElement.setAttribute('data-theme', initialTheme);
  }, []);

  const isDark = theme === 'dark';

  const onToggle = () => {
    const nextTheme: Theme = isDark ? 'light' : 'dark';
    setTheme(nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
    window.localStorage.setItem('theme', nextTheme);
  };

  return (
    <button
      type="button"
      onClick={onToggle}
      className="btn-subtle min-w-[92px]"
      aria-label="다크모드 전환"
      title="다크모드 전환"
    >
      {isDark ? '☀️ 라이트' : '🌙 다크'}
    </button>
  );
}
