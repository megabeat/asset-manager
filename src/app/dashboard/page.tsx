'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

type Summary = {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  monthlyFixedExpense: number;
};

export default function DashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getDashboardSummary().then((result) => {
      if (result.data) {
        setSummary(result.data);
      }
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <div style={{ padding: '2rem' }}>로딩 중...</div>;
  }

  if (!summary) {
    return <div style={{ padding: '2rem' }}>데이터를 불러올 수 없습니다.</div>;
  }

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>대시보드</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '2rem' }}>
        <div style={{ padding: '1.5rem', border: '1px solid #ddd', borderRadius: '8px' }}>
          <h3 style={{ margin: 0, fontSize: '0.9rem', color: '#666' }}>총 자산</h3>
          <p style={{ margin: '0.5rem 0 0', fontSize: '1.5rem', fontWeight: 'bold' }}>
            {summary.totalAssets.toLocaleString()}원
          </p>
        </div>
        <div style={{ padding: '1.5rem', border: '1px solid #ddd', borderRadius: '8px' }}>
          <h3 style={{ margin: 0, fontSize: '0.9rem', color: '#666' }}>총 부채</h3>
          <p style={{ margin: '0.5rem 0 0', fontSize: '1.5rem', fontWeight: 'bold', color: '#d32f2f' }}>
            {summary.totalLiabilities.toLocaleString()}원
          </p>
        </div>
        <div style={{ padding: '1.5rem', border: '1px solid #ddd', borderRadius: '8px' }}>
          <h3 style={{ margin: 0, fontSize: '0.9rem', color: '#666' }}>순자산</h3>
          <p style={{ margin: '0.5rem 0 0', fontSize: '1.5rem', fontWeight: 'bold', color: '#388e3c' }}>
            {summary.netWorth.toLocaleString()}원
          </p>
        </div>
        <div style={{ padding: '1.5rem', border: '1px solid #ddd', borderRadius: '8px' }}>
          <h3 style={{ margin: 0, fontSize: '0.9rem', color: '#666' }}>월 고정지출</h3>
          <p style={{ margin: '0.5rem 0 0', fontSize: '1.5rem', fontWeight: 'bold' }}>
            {summary.monthlyFixedExpense.toLocaleString()}원
          </p>
        </div>
      </div>
    </div>
  );
}
