import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "자산관리 앱",
  description: "개인 자산 및 지출 관리"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
