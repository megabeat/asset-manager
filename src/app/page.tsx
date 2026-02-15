'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, Asset, Expense, Income } from '@/lib/api';

type Summary = {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  monthlyFixedExpense: number;
};

const quickActions = [
  { href: '/profile', label: '프로파일 작성', desc: '기본 정보와 가구 구성 입력' },
  { href: '/assets', label: '자산 등록', desc: '현금/투자/부동산 등 자산 입력' },
  { href: '/pensions', label: '연금 관리', desc: '국민/개인/퇴직연금 분리 관리' },
  { href: '/incomes', label: '수입 관리', desc: '월/연/일회성 수입 기록' },
  { href: '/expenses', label: '지출 관리', desc: '고정/구독 지출과 월 환산 확인' },
  { href: '/liabilities', label: '부채 관리', desc: '대출/카드/기타 채무 기록' },
  { href: '/education', label: '교육 계획', desc: '자녀별 교육비 시뮬레이션' },
  { href: '/ai-advisor', label: 'AI 상담', desc: '재무 상태 기반 질문/답변' },
  { href: '/dashboard', label: '통합 대시보드', desc: '순자산/추이/구성 한눈에 보기' }
];

export default function Home() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getDashboardSummary(), api.getAssets(), api.getExpenses(), api.getIncomes()]).then(
      ([summaryResult, assetsResult, expensesResult, incomesResult]) => {
        if (summaryResult.data) setSummary(summaryResult.data);
        if (assetsResult.data) setAssets(assetsResult.data);
        if (expensesResult.data) setExpenses(expensesResult.data);
        if (incomesResult.data) setIncomes(incomesResult.data);
        setLoading(false);
      }
    );
  }, []);

  const topAssets = useMemo(
    () => [...assets].sort((a, b) => b.currentValue - a.currentValue).slice(0, 5),
    [assets]
  );

  const liquidAssetsTotal = useMemo(() => {
    return assets
      .filter((asset) => asset.category === 'cash' || asset.category === 'deposit')
      .reduce((sum, asset) => sum + (asset.currentValue ?? 0), 0);
  }, [assets]);

  const monthlyExpense = useMemo(() => {
    return expenses.reduce((sum, item) => {
      if (item.cycle === 'yearly') return sum + item.amount / 12;
      if (item.cycle === 'one_time') return sum;
      return sum + item.amount;
    }, 0);
  }, [expenses]);

  const monthlyIncome = useMemo(() => {
    return incomes.reduce((sum, item) => {
      if (item.cycle === 'yearly') return sum + item.amount / 12;
      if (item.cycle === 'one_time') return sum;
      return sum + item.amount;
    }, 0);
  }, [incomes]);

  const monthlySurplus = monthlyIncome - monthlyExpense;

  return (
    <div style={{ padding: '1rem 0 2rem' }}>
      <section
        style={{
          background: '#fff',
          border: '1px solid #ececec',
          borderRadius: 12,
          padding: '1.25rem 1.25rem'
        }}
      >
        <h1 style={{ marginTop: 0, marginBottom: '0.5rem' }}>개인 자산관리 홈</h1>
        <p style={{ margin: 0, color: '#555' }}>
          자산/수입/지출/부채를 입력하고 순자산과 현금흐름을 바로 확인하세요.
        </p>
      </section>

      <section
        style={{
          marginTop: '1rem',
          display: 'grid',
          gap: '0.8rem',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))'
        }}
      >
        <div style={{ background: '#fff', border: '1px solid #ececec', borderRadius: 10, padding: '1rem' }}>
          <h3 style={{ margin: 0, color: '#666', fontSize: '0.9rem' }}>총 자산</h3>
          <p style={{ margin: '0.45rem 0 0', fontWeight: 700, fontSize: '1.25rem' }}>
            {summary?.totalAssets?.toLocaleString() ?? '-'}원
          </p>
        </div>
        <div style={{ background: '#fff', border: '1px solid #ececec', borderRadius: 10, padding: '1rem' }}>
          <h3 style={{ margin: 0, color: '#666', fontSize: '0.9rem' }}>현금성 자산(입출금/현금)</h3>
          <p style={{ margin: '0.45rem 0 0', fontWeight: 700, fontSize: '1.25rem' }}>
            {liquidAssetsTotal.toLocaleString()}원
          </p>
        </div>
        <div style={{ background: '#fff', border: '1px solid #ececec', borderRadius: 10, padding: '1rem' }}>
          <h3 style={{ margin: 0, color: '#666', fontSize: '0.9rem' }}>총 부채</h3>
          <p style={{ margin: '0.45rem 0 0', fontWeight: 700, fontSize: '1.25rem', color: '#d32f2f' }}>
            {summary?.totalLiabilities?.toLocaleString() ?? '-'}원
          </p>
        </div>
        <div style={{ background: '#fff', border: '1px solid #ececec', borderRadius: 10, padding: '1rem' }}>
          <h3 style={{ margin: 0, color: '#666', fontSize: '0.9rem' }}>순자산</h3>
          <p style={{ margin: '0.45rem 0 0', fontWeight: 700, fontSize: '1.25rem', color: '#2e7d32' }}>
            {summary?.netWorth?.toLocaleString() ?? '-'}원
          </p>
        </div>
        <div style={{ background: '#fff', border: '1px solid #ececec', borderRadius: 10, padding: '1rem' }}>
          <h3 style={{ margin: 0, color: '#666', fontSize: '0.9rem' }}>월 지출(환산)</h3>
          <p style={{ margin: '0.45rem 0 0', fontWeight: 700, fontSize: '1.25rem' }}>
            {Math.round(monthlyExpense).toLocaleString()}원
          </p>
        </div>
        <div style={{ background: '#fff', border: '1px solid #ececec', borderRadius: 10, padding: '1rem' }}>
          <h3 style={{ margin: 0, color: '#666', fontSize: '0.9rem' }}>월 수입(환산)</h3>
          <p style={{ margin: '0.45rem 0 0', fontWeight: 700, fontSize: '1.25rem' }}>
            {Math.round(monthlyIncome).toLocaleString()}원
          </p>
        </div>
        <div style={{ background: '#fff', border: '1px solid #ececec', borderRadius: 10, padding: '1rem' }}>
          <h3 style={{ margin: 0, color: '#666', fontSize: '0.9rem' }}>월 잉여자금</h3>
          <p
            style={{
              margin: '0.45rem 0 0',
              fontWeight: 700,
              fontSize: '1.25rem',
              color: monthlySurplus >= 0 ? '#2e7d32' : '#d32f2f'
            }}
          >
            {Math.round(monthlySurplus).toLocaleString()}원
          </p>
        </div>
      </section>

      <section style={{ marginTop: '1rem', display: 'grid', gap: '1rem', gridTemplateColumns: '2fr 1fr' }}>
        <div style={{ background: '#fff', border: '1px solid #ececec', borderRadius: 10, padding: '1rem' }}>
          <h2 style={{ marginTop: 0, marginBottom: '0.8rem', fontSize: '1.05rem' }}>빠른 실행</h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '0.65rem'
            }}
          >
            {quickActions.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  border: '1px solid #e6e6e6',
                  borderRadius: 8,
                  padding: '0.8rem',
                  textDecoration: 'none',
                  color: '#222'
                }}
              >
                <strong style={{ display: 'block', marginBottom: '0.2rem' }}>{item.label}</strong>
                <span style={{ color: '#666', fontSize: '0.88rem' }}>{item.desc}</span>
              </Link>
            ))}
          </div>
        </div>

        <div style={{ background: '#fff', border: '1px solid #ececec', borderRadius: 10, padding: '1rem' }}>
          <h2 style={{ marginTop: 0, marginBottom: '0.8rem', fontSize: '1.05rem' }}>상위 자산</h2>
          {loading ? (
            <p>로딩 중...</p>
          ) : topAssets.length === 0 ? (
            <p>등록된 자산이 없습니다.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: '1rem', display: 'grid', gap: '0.45rem' }}>
              {topAssets.map((asset) => (
                <li key={asset.id}>
                  <span>{asset.name}</span>
                  <span style={{ float: 'right', fontWeight: 600 }}>
                    {asset.currentValue.toLocaleString()}원
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
