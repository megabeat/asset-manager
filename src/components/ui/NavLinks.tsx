'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

type NavItem = { href: string; label: string };

const navItems: NavItem[] = [
  { href: '/', label: '홈' },
  { href: '/dashboard', label: '대시보드' },
  { href: '/assets', label: '자산' },
  { href: '/pensions', label: '연금관리' },
  { href: '/goal-funds', label: '목적자금' },
  { href: '/incomes', label: '수입' },
  { href: '/expenses', label: '지출' },
  { href: '/liabilities', label: '부채' },
  { href: '/education', label: '자산시뮬레이션' },
  { href: '/ai-advisor', label: 'AI 상담' },
  { href: '/profile', label: '설정' },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(href + '/');
}

export function NavLinks() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="nav-hamburger"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="메뉴 열기/닫기"
        aria-expanded={open}
      >
        <span className={`hamburger-bar ${open ? 'hamburger-open' : ''}`} />
      </button>

      <nav className={`nav-links ${open ? 'nav-open' : ''}`}>
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-link ${isActive(pathname, item.href) ? 'nav-active' : ''}`}
            aria-current={isActive(pathname, item.href) ? 'page' : undefined}
            onClick={() => setOpen(false)}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
