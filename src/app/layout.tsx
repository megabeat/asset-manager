import type { Metadata } from "next";
import Link from "next/link";

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
    { href: "/profile", label: "프로파일" },
    { href: "/assets", label: "자산" },
    { href: "/incomes", label: "수입" },
    { href: "/expenses", label: "지출" },
    { href: "/liabilities", label: "부채" },
    { href: "/education", label: "교육" },
    { href: "/ai-advisor", label: "AI 상담" }
  ];

  return (
    <html lang="ko">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#fafafa" }}>
        <header
          style={{
            position: "sticky",
            top: 0,
            zIndex: 10,
            background: "#fff",
            borderBottom: "1px solid #ececec"
          }}
        >
          <div
            style={{
              maxWidth: 1160,
              margin: "0 auto",
              padding: "0.75rem 1rem",
              display: "flex",
              gap: "1rem",
              alignItems: "center",
              justifyContent: "space-between"
            }}
          >
            <Link href="/" style={{ fontWeight: 700, fontSize: "1.05rem", color: "#111", textDecoration: "none" }}>
              자산관리 앱
            </Link>
            <nav style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    padding: "0.35rem 0.6rem",
                    borderRadius: 6,
                    color: "#1d4f91",
                    textDecoration: "none",
                    fontSize: "0.9rem"
                  }}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>

        <main style={{ maxWidth: 1160, margin: "0 auto", padding: "1rem" }}>{children}</main>
      </body>
    </html>
  );
}
