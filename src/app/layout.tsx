import type { Metadata } from "next";
import Link from "next/link";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { AppLogo } from "@/components/ui/AppLogo";
import { NavLinks } from "@/components/ui/NavLinks";
import "./globals.css";

export const metadata: Metadata = {
  title: "자산관리 앱",
  description: "개인 자산 및 지출 관리"
};

const themeScript = `(function(){try{var t=localStorage.getItem('theme');if(!t){t=matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'}document.documentElement.setAttribute('data-theme',t)}catch(e){}})()`;

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <header className="app-header">
          <div className="app-header-inner">
            <Link href="/" className="brand-link">
              <AppLogo />
            </Link>
            <NavLinks />
            <ThemeToggle />
          </div>
        </header>

        <main className="app-main">{children}</main>
      </body>
    </html>
  );
}
