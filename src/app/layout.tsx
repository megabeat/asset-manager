import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "자산관리 앱",
  description: "개인 자산 및 지출 관리"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const navItems = [
    { href: "/", label: "홈" },
    { href: "/dashboard", label: "대시보드" },
    { href: "/assets", label: "자산" },
    { href: "/pensions", label: "연금관리" },
    { href: "/incomes", label: "수입" },
    { href: "/expenses", label: "지출" },
    { href: "/liabilities", label: "부채" },
    { href: "/education", label: "교육" },
    { href: "/ai-advisor", label: "AI 상담" },
    { href: "/profile", label: "설정" }
  ];

  return (
    <html lang="ko">
      <body>
        <header className="app-header">
          <div className="app-header-inner">
            <Link href="/" className="brand-link">
              자산관리 앱
            </Link>
            <nav className="nav-links">
              {navItems.map((item) => (
                <Link key={item.href} href={item.href} className="nav-link">
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>

        <main className="app-main">{children}</main>
      </body>
    </html>
  );
}
