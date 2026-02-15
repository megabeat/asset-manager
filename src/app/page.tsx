import Link from 'next/link';

export default function Home() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>자산관리 앱</h1>
      <nav style={{ marginTop: '2rem' }}>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          <li style={{ marginBottom: '1rem' }}>
            <Link href="/dashboard" style={{ fontSize: '1.2rem', color: '#0070f3' }}>
              📊 대시보드
            </Link>
          </li>
          <li style={{ marginBottom: '1rem' }}>
            <Link href="/profile" style={{ fontSize: '1.2rem', color: '#0070f3' }}>
              👤 프로파일
            </Link>
          </li>
          <li style={{ marginBottom: '1rem' }}>
            <Link href="/assets" style={{ fontSize: '1.2rem', color: '#0070f3' }}>
              💰 자산 관리
            </Link>
          </li>
          <li style={{ marginBottom: '1rem' }}>
            <Link href="/expenses" style={{ fontSize: '1.2rem', color: '#0070f3' }}>
              💳 지출 관리
            </Link>
          </li>
          <li style={{ marginBottom: '1rem' }}>
            <Link href="/education" style={{ fontSize: '1.2rem', color: '#0070f3' }}>
              🎓 교육비 시뮬레이션
            </Link>
          </li>
          <li style={{ marginBottom: '1rem' }}>
            <Link href="/ai-advisor" style={{ fontSize: '1.2rem', color: '#0070f3' }}>
              🤖 AI 상담
            </Link>
          </li>
        </ul>
      </nav>
    </div>
  );
}
