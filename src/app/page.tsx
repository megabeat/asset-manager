'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, Asset, Expense, Income, Profile } from '@/lib/api';

type Summary = {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  monthlyFixedExpense: number;
};

function isPensionCategory(category?: string): boolean {
  return (
    category === 'pension' ||
    category === 'pension_national' ||
    category === 'pension_personal' ||
    category === 'pension_retirement'
  );
}

const quickActions = [
  { href: '/profile', label: '설정', desc: '기본 정보와 로그인 설정 확인' },
  { href: '/assets', label: '자산 등록', desc: '현금/투자/부동산 등 자산 입력' },
  { href: '/pensions', label: '연금', desc: '국민/개인/퇴직연금 입력·집계·비중 확인' },
  { href: '/incomes', label: '수입 관리', desc: '월/연/일회성 수입 기록' },
  { href: '/expenses', label: '지출 관리', desc: '고정/구독 지출과 월 환산 확인' },
  { href: '/liabilities', label: '부채 관리', desc: '대출/카드/기타 채무 기록' },
  { href: '/education', label: '자산시뮬레이션', desc: '교육비 포함 미래 자산 시나리오 분석' },
  { href: '/ai-advisor', label: 'AI 상담', desc: '재무 상태 기반 질문/답변' },
  { href: '/dashboard', label: '통합 대시보드', desc: '순자산/추이/구성 한눈에 보기' }
];

export default function Home() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [settlementMonthKey, setSettlementMonthKey] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const savedMonth = window.localStorage.getItem('home.settlementMonthKey');
    if (savedMonth && /^\d{4}-\d{2}$/.test(savedMonth)) {
      setSettlementMonthKey(savedMonth);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem('home.settlementMonthKey', settlementMonthKey);
  }, [settlementMonthKey]);

  useEffect(() => {
    Promise.all([
      api.getDashboardSummary(),
      api.getAssets(),
      api.getExpenses(),
      api.getIncomes(),
      api.getProfile()
    ]).then(
      ([summaryResult, assetsResult, expensesResult, incomesResult, profileResult]) => {
        if (summaryResult.data) setSummary(summaryResult.data);
        if (assetsResult.data) setAssets(assetsResult.data);
        if (expensesResult.data) setExpenses(expensesResult.data);
        if (incomesResult.data) setIncomes(incomesResult.data);
        if (profileResult.data) setProfile(profileResult.data);
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

  const stockAssetsTotal = useMemo(() => {
    return assets
      .filter((asset) => asset.category === 'stock_kr' || asset.category === 'stock_us')
      .reduce((sum, asset) => sum + (asset.currentValue ?? 0), 0);
  }, [assets]);

  const pensionAssetsTotal = useMemo(() => {
    return assets
      .filter((asset) => isPensionCategory(asset.category))
      .reduce((sum, asset) => sum + (asset.currentValue ?? 0), 0);
  }, [assets]);

  const totalAssetsWithPension = useMemo(() => {
    return (summary?.totalAssets ?? 0) + pensionAssetsTotal;
  }, [summary?.totalAssets, pensionAssetsTotal]);

  const monthlyExpense = useMemo(() => {
    return expenses.reduce((sum, item) => {
      if (item.isInvestmentTransfer) return sum;
      if (item.cycle === '매년' || item.cycle === 'yearly') return sum + item.amount / 12;
      if (item.cycle === '일회성' || item.cycle === 'one_time') return sum;
      return sum + item.amount;
    }, 0);
  }, [expenses]);

  const monthlyIncome = useMemo(() => {
    const monthlyIncomeFromEntries = incomes.reduce((sum, item) => {
      if (item.cycle === 'yearly') return sum + item.amount / 12;
      if (item.cycle === 'one_time') return sum;
      return sum + item.amount;
    }, 0);

    if (monthlyIncomeFromEntries > 0) {
      return monthlyIncomeFromEntries;
    }

    const annualCompensation =
      Number(profile?.baseSalaryAnnual ?? 0) +
      Number(profile?.annualFixedExtra ?? 0) +
      Number(profile?.annualBonus ?? 0) +
      Number(profile?.annualRsu ?? 0);

    return annualCompensation > 0 ? annualCompensation / 12 : 0;
  }, [incomes, profile]);

  const monthlySurplus = monthlyIncome - monthlyExpense;

  const monthlySettledIncome = useMemo(() => {
    return incomes
      .filter((income) => String(income.occurredAt ?? '').slice(0, 7) === settlementMonthKey)
      .reduce((sum, income) => sum + Number(income.amount ?? 0), 0);
  }, [incomes, settlementMonthKey]);

  const monthlySettledExpense = useMemo(() => {
    return expenses
      .filter(
        (expense) =>
          String(expense.occurredAt ?? '').slice(0, 7) === settlementMonthKey &&
          !expense.isInvestmentTransfer
      )
      .reduce((sum, expense) => sum + Number(expense.amount ?? 0), 0);
  }, [expenses, settlementMonthKey]);

  const monthlySettledInvestmentTransfer = useMemo(() => {
    return expenses
      .filter(
        (expense) =>
          String(expense.occurredAt ?? '').slice(0, 7) === settlementMonthKey &&
          Boolean(expense.isInvestmentTransfer)
      )
      .reduce((sum, expense) => sum + Number(expense.amount ?? 0), 0);
  }, [expenses, settlementMonthKey]);

  const monthlyNetCashflow = monthlySettledIncome - monthlySettledExpense;

  return (
    <div className="pb-8 pt-4">
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
        <h1 className="mb-2 mt-0">개인 자산관리 홈</h1>
        <p className="m-0 text-[var(--muted)]">
          자산/수입/지출/부채를 입력하고 순자산과 현금흐름을 바로 확인하세요.
        </p>
      </section>

      <section className="mt-4 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        <div className="kpi-card">
          <h3 className="kpi-label">총 자산(연금 제외)</h3>
          <p className="kpi-value">
            {summary?.totalAssets?.toLocaleString() ?? '-'}원
          </p>
        </div>
        <div className="kpi-card">
          <h3 className="kpi-label">총 자산(연금 포함)</h3>
          <p className="kpi-value">
            {totalAssetsWithPension.toLocaleString()}원
          </p>
        </div>
        <div className="kpi-card">
          <h3 className="kpi-label">보유현금(자유 입/출금)</h3>
          <p className="kpi-value">
            {liquidAssetsTotal.toLocaleString()}원
          </p>
        </div>
        <div className="kpi-card">
          <h3 className="kpi-label">주식자산(미장/국장)</h3>
          <p className="kpi-value">
            {stockAssetsTotal.toLocaleString()}원
          </p>
        </div>
        <div className="kpi-card">
          <h3 className="kpi-label">총 부채</h3>
          <p className="kpi-value kpi-negative">
            {summary?.totalLiabilities?.toLocaleString() ?? '-'}원
          </p>
        </div>
        <div className="kpi-card">
          <h3 className="kpi-label">순자산</h3>
          <p className="kpi-value kpi-positive">
            {summary?.netWorth?.toLocaleString() ?? '-'}원
          </p>
        </div>
        <div className="kpi-card">
          <h3 className="kpi-label">월 지출(환산)</h3>
          <p className="kpi-value">
            {Math.round(monthlyExpense).toLocaleString()}원
          </p>
        </div>
        <div className="kpi-card">
          <h3 className="kpi-label">월 수입(환산)</h3>
          <p className="kpi-value">
            {Math.round(monthlyIncome).toLocaleString()}원
          </p>
        </div>
        <div className="kpi-card">
          <h3 className="kpi-label">월 잉여자금</h3>
          <p className={`kpi-value ${monthlySurplus >= 0 ? 'kpi-positive' : 'kpi-negative'}`}>
            {Math.round(monthlySurplus).toLocaleString()}원
          </p>
        </div>
        <div className="kpi-card">
          <h3 className="kpi-label">월 순현금흐름(정산)</h3>
          <div className="mt-1">
            <label className="helper-text flex items-center gap-2">
              <span>기준월</span>
              <input
                type="month"
                value={settlementMonthKey}
                onChange={(event) => setSettlementMonthKey(event.target.value)}
                className="max-w-[170px] px-2 py-1.5"
              />
            </label>
          </div>
          <p className={`kpi-value ${monthlyNetCashflow >= 0 ? 'kpi-positive' : 'kpi-negative'}`}>
            {Math.round(monthlyNetCashflow).toLocaleString()}원
          </p>
          <p className="helper-text mt-1">기준월: {settlementMonthKey} (수입 {Math.round(monthlySettledIncome).toLocaleString()}원 - 생활지출 {Math.round(monthlySettledExpense).toLocaleString()}원)</p>
        </div>
        <div className="kpi-card">
          <h3 className="kpi-label">월 투자이체(정산)</h3>
          <p className="kpi-value">
            {Math.round(monthlySettledInvestmentTransfer).toLocaleString()}원
          </p>
        </div>
      </section>

      <section className="mt-4 grid gap-4 md:grid-cols-[2fr_1fr]">
        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
          <h2 className="mb-3 mt-0 text-[1.05rem]">빠른 실행</h2>
          <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
            {quickActions.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg border border-[var(--line)] p-3 no-underline transition-colors hover:bg-[var(--table-stripe)]"
              >
                <strong className="mb-1 block">{item.label}</strong>
                <span className="text-[0.88rem] text-[var(--muted)]">{item.desc}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
          <h2 className="mb-3 mt-0 text-[1.05rem]">상위 자산</h2>
          {loading ? (
            <p>로딩 중...</p>
          ) : topAssets.length === 0 ? (
            <p>등록된 자산이 없습니다.</p>
          ) : (
            <ul className="m-0 grid gap-2 pl-4">
              {topAssets.map((asset) => (
                <li key={asset.id}>
                  <span>{asset.name}</span>
                  <span className="float-right font-semibold">
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
