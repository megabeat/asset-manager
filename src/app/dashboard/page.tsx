'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, MonthlySnapshot, CategoryTrendPoint } from '@/lib/api';
import { DashboardSkeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/hooks/useAuth';
import { LoginPrompt } from '@/components/ui/AuthGuard';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { formatCompact } from '@/lib/formatCompact';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  ReferenceLine,
  Cell
} from 'recharts';
import { SectionCard } from '@/components/ui/SectionCard';

/* ── colour palette ── */
const CATEGORY_COLORS: Record<string, string> = {
  stock_us: '#8b5cf6',
  stock_kr: '#ef4444',
  cash: '#22c55e',
  deposit: '#3b82f6',
  real_estate: '#06b6d4',
  realestate: '#06b6d4',
  realestate_kr: '#06b6d4',
  realestate_us: '#0891b2',
  car: '#f59e0b',
  etc: '#6b7280',
  pension: '#ec4899',
  pension_national: '#ec4899',
  pension_personal: '#f472b6',
  pension_retirement: '#db2777',
  pension_government: '#be185d',
};
const STOCK_PALETTE = ['#8b5cf6', '#ef4444', '#3b82f6', '#f59e0b', '#22c55e', '#ec4899', '#06b6d4', '#f97316'];

function EmptyGuide({ icon, title, description, linkHref, linkLabel }: {
  icon: string;
  title: string;
  description: string;
  linkHref: string;
  linkLabel: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <span className="text-4xl mb-3">{icon}</span>
      <p className="font-semibold text-[var(--color-text)]">{title}</p>
      <p className="text-sm text-[var(--color-text-muted)] mt-1 max-w-[260px]">{description}</p>
      <Link
        href={linkHref}
        className="mt-3 inline-block rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
      >
        {linkLabel}
      </Link>
    </div>
  );
}

export default function DashboardPage() {
  const authStatus = useAuth();
  const [snapshots, setSnapshots] = useState<MonthlySnapshot[]>([]);
  const [categoryTrend, setCategoryTrend] = useState<CategoryTrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.getSnapshots(),
      api.getCategoryTrend()
    ]).then(([snapRes, catRes]) => {
      if (snapRes.data) setSnapshots(snapRes.data);
      if (catRes.data) setCategoryTrend(catRes.data);

      const firstError = snapRes.error ?? catRes.error;
      if (firstError) setError(firstError.message);
      setLoading(false);
    });
  }, []);

  /* ── derived data ── */

  // 주식+현금 월별 추이 (각 월 마지막 날 기준)
  const stockCashMonthlyData = useMemo(() => {
    // 월별로 마지막 날짜 데이터만 추출
    const monthMap = new Map<string, { month: string; stock: number; cash: number }>();
    for (const point of categoryTrend) {
      const date = point.date as string;
      const month = date.slice(0, 7); // YYYY-MM
      const stock = Number(point['stock_kr'] ?? 0) + Number(point['stock_us'] ?? 0);
      const cash = Number(point['cash'] ?? 0) + Number(point['deposit'] ?? 0);
      // 같은 월이면 더 늦은 날짜로 덮어씀 (데이터가 날짜 순이므로 마지막이 월말)
      monthMap.set(month, { month, stock, cash });
    }
    return Array.from(monthMap.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [categoryTrend]);

  // 전체 주식 원화 합산 일별 추이 (stock_kr + stock_us) — 2025-02-18부터
  const totalStockDailyData = useMemo(() => {
    return categoryTrend
      .map((point) => {
        const kr = Number(point['stock_kr'] ?? 0);
        const us = Number(point['stock_us'] ?? 0);
        const total = kr + us;
        if (total === 0) return null;
        return { date: point.date as string, total, kr, us };
      })
      .filter((d): d is { date: string; total: number; kr: number; us: number } => d !== null && d.date >= '2025-02-18');
  }, [categoryTrend]);

  const monthlyDeltaData = useMemo(() => {
    return snapshots.map((s) => ({
      month: s.month,
      delta: s.delta
    }));
  }, [snapshots]);

  const snapshotLineData = useMemo(() => {
    return snapshots.map((s) => ({ label: s.month, value: s.totalValue }));
  }, [snapshots]);

  const hasNoData = snapshots.length === 0 && categoryTrend.length === 0;

  if (authStatus === 'loading') return <LoadingSpinner />;
  if (authStatus !== 'authenticated') return <LoginPrompt />;
  if (loading) return <DashboardSkeleton />;

  return (
    <div className="py-4">
      <h1>자산 추이 대시보드</h1>

      {error && <p className="mt-3 text-sm text-[var(--color-text-muted)]">일부 데이터 로드 실패: {error}</p>}

      {hasNoData && (
        <SectionCard className="mt-4 p-6 border-l-[3px] border-l-[var(--color-primary)]">
          <h2 className="mt-0 text-lg font-bold">👋 환영합니다!</h2>
          <p className="text-[var(--color-text-muted)] mt-1 mb-4">
            아직 추이 데이터가 없습니다. 자산을 등록하고 자동 시세 업데이트가 실행되면 추이 차트가 채워집니다.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/assets" className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity">
              📊 자산 등록
            </Link>
          </div>
        </SectionCard>
      )}

      {/* ── 1. 순자산 추이 (월별 스냅샷) ── */}
      <SectionCard className="mt-4">
        <h3 className="mt-0">📈 순자산 추이 (Monthly)</h3>
        {snapshotLineData.length === 0 ? (
          <EmptyGuide
            icon="📈"
            title="아직 스냅샷이 없습니다"
            description="자산을 등록하면 매월 말일에 자동으로 자산 추이가 기록됩니다."
            linkHref="/assets"
            linkLabel="자산 등록하기"
          />
        ) : (
          <div className="h-[260px] w-full sm:h-[320px]">
            <ResponsiveContainer>
              <LineChart data={snapshotLineData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => `${Math.round(v / 10000)}만`} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value: number) => `${Number(value).toLocaleString()}원`} />
                <Line type="monotone" dataKey="value" name="총 자산" stroke="#0b63ce" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionCard>

      {/* ── 2. 주식+현금 자산 추이 (Monthly) ── */}
      <SectionCard className="mt-4">
        <h3 className="mt-0">📊 주식+현금 자산 추이 (Monthly)</h3>
        <p className="helper-text mt-1">매월 마지막 업데이트 기준 — 주식(국내+미국 원화 환산)과 현금·예금 합산입니다.</p>
        {stockCashMonthlyData.length === 0 ? (
          <EmptyGuide
            icon="📊"
            title="추이 데이터가 없습니다"
            description="자동 시세 업데이트가 실행되면 월별 추이가 기록됩니다."
            linkHref="/assets"
            linkLabel="자산 등록하기"
          />
        ) : (
          <div className="h-[280px] w-full sm:h-[340px]">
            <ResponsiveContainer>
              <LineChart data={stockCashMonthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => `${Math.round(v / 10000)}만`} tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    `${Number(value).toLocaleString()}원`,
                    name === 'stock' ? '주식' : '현금·예금'
                  ]}
                />
                <Legend formatter={(v) => v === 'stock' ? '주식 (국내+미국)' : '현금·예금'} />
                <Line type="monotone" dataKey="stock" name="stock" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 4 }} connectNulls />
                <Line type="monotone" dataKey="cash" name="cash" stroke="#22c55e" strokeWidth={2} dot={{ r: 4 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionCard>

      {/* ── 3. 전체 주식 원화 합산 추이 ── */}
      <SectionCard className="mt-4">
        <h3 className="mt-0">💹 전체 주식 원화 합산 추이 (Daily)</h3>
        <p className="helper-text mt-1">국내주식 + 미국주식(원화 환산) 일별 합산 평가액입니다.</p>
        {totalStockDailyData.length === 0 ? (
          <EmptyGuide
            icon="💹"
            title="주식 추이 데이터 없음"
            description="주식 자산을 등록하고 자동 시세 업데이트를 활성화하면 추이가 표시됩니다."
            linkHref="/assets"
            linkLabel="주식 자산 등록하기"
          />
        ) : (
          <div className="h-[280px] w-full sm:h-[340px]">
            <ResponsiveContainer>
              <LineChart data={totalStockDailyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => {
                    const parts = String(v).split('-');
                    return parts.length >= 3 ? `${parts[1]}/${parts[2]}` : v;
                  }}
                />
                <YAxis tickFormatter={(v) => `${Math.round(v / 10000)}만`} tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    `${Number(value).toLocaleString()}원`,
                    name === 'total' ? '합계' : name === 'kr' ? '국내주식' : name === 'us' ? '미국주식' : name
                  ]}
                  labelFormatter={(label) => `${label}`}
                />
                <Legend formatter={(v) => v === 'total' ? '합계' : v === 'kr' ? '🇰🇷 국내' : v === 'us' ? '🇺🇸 미국' : v} />
                <Line type="monotone" dataKey="total" name="total" stroke="#0b63ce" strokeWidth={2.5} dot={false} connectNulls />
                <Line type="monotone" dataKey="kr" name="kr" stroke="#ef4444" strokeWidth={1.5} dot={false} connectNulls strokeDasharray="4 2" />
                <Line type="monotone" dataKey="us" name="us" stroke="#8b5cf6" strokeWidth={1.5} dot={false} connectNulls strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionCard>

      {/* ── 4. 월별 증감 Bar Chart ── */}
      <SectionCard className="mt-4">
        <h3 className="mt-0">📉 월별 자산 증감</h3>
        {monthlyDeltaData.length === 0 ? (
          <EmptyGuide
            icon="📉"
            title="증감 데이터 없음"
            description="스냅샷이 2개월 이상 쌓이면 월별 증감이 표시됩니다."
            linkHref="/assets"
            linkLabel="자산 등록하기"
          />
        ) : (
          <div className="h-[220px] w-full sm:h-[260px]">
            <ResponsiveContainer>
              <BarChart data={monthlyDeltaData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => `${Math.round(v / 10000)}만`} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value: number) => `${value >= 0 ? '+' : ''}${Number(value).toLocaleString()}원`} />
                <ReferenceLine y={0} stroke="#999" />
                <Bar dataKey="delta" name="전월 대비" radius={[4, 4, 0, 0]}>
                  {monthlyDeltaData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.delta >= 0 ? '#22c55e' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionCard>

      {/* ── 5. 스냅샷 이력 테이블 ── */}
      <SectionCard className="mt-4">
        <h3 className="mt-0">📋 월말 자산 스냅샷 이력</h3>
        <p className="helper-text mt-1 mb-3">매월 말일 정오에 자동 집계된 전체 자산 평가액입니다.</p>
        {snapshots.length === 0 ? (
          <EmptyGuide
            icon="📋"
            title="월말 스냅샷 이력 없음"
            description="자산 등록 후 매월 말일에 자동 집계됩니다. 첫 집계까지 기다려 주세요."
            linkHref="/assets"
            linkLabel="자산 등록하기"
          />
        ) : (
          <div className="ui-table-wrap">
            <table className="ui-table">
              <thead>
                <tr className="ui-table-head-row">
                  <th className="ui-table-th text-left">월</th>
                  <th className="ui-table-th text-left">기록 일시</th>
                  <th className="ui-table-th text-right">전체 평가액</th>
                  <th className="ui-table-th text-right">전월 대비</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map((snap, idx) => (
                  <tr key={snap.month} className={idx % 2 === 0 ? 'ui-table-row-even' : 'ui-table-row-odd'}>
                    <td className="ui-table-td text-left">{snap.month}</td>
                    <td className="ui-table-td text-left">
                      {snap.recordedAt ? new Date(snap.recordedAt).toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}
                    </td>
                    <td className="ui-table-td text-right font-semibold">
                      {formatCompact(snap.totalValue)}
                    </td>
                    <td className={`ui-table-td text-right ${snap.delta >= 0 ? 'ui-delta-positive' : 'ui-delta-negative'}`}>
                      {snap.delta >= 0 ? '+' : ''}{formatCompact(snap.delta)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}