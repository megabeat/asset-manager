'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { DashboardSkeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/hooks/useAuth';
import { LoginPrompt } from '@/components/ui/AuthGuard';
import { formatCompact } from '@/lib/formatCompact';
import { isPensionCategory } from '@/lib/isPensionCategory';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { SectionCard } from '@/components/ui/SectionCard';
import { getAssetCategoryLabel } from '@/lib/assetCategory';

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

type Summary = {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  monthlyFixedExpense: number;
};

type AssetItem = {
  id: string;
  name: string;
  category: string;
  currentValue: number;
  usdAmount?: number;
  exchangeRate?: number;
};

const COLORS = ['#0b63ce', '#2e7d32', '#f57c00', '#7b1fa2', '#c2185b', '#00796b'];

export default function DashboardPage() {
  const authStatus = useAuth();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [snapshots, setSnapshots] = useState<Array<{ month: string; totalValue: number; delta: number; recordedAt: string }>>([]);
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.getDashboardSummary(), api.getAssets(), api.getSnapshots()]).then(
      ([summaryResult, assetsResult, snapshotsResult]) => {
        if (summaryResult.data) {
          setSummary(summaryResult.data);
        }

        if (assetsResult.data) {
          setAssets(assetsResult.data as AssetItem[]);
        }

        if (snapshotsResult.data) {
          setSnapshots(snapshotsResult.data);
        }

        const firstError = summaryResult.error ?? assetsResult.error;
        if (firstError) {
          setError(firstError.message);
        }

        setLoading(false);
      }
    );
  }, []);

  if (authStatus === 'loading') return <LoadingSpinner />;
  if (authStatus !== 'authenticated') return <LoginPrompt />;

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (!summary) {
    return <div className="p-8">데이터를 불러올 수 없습니다.</div>;
  }

  const categoryData = Object.entries(
    assets.reduce<Record<string, number>>((acc, asset) => {
      const categoryLabel = getAssetCategoryLabel(asset.category);
      acc[categoryLabel] = (acc[categoryLabel] ?? 0) + (asset.currentValue ?? 0);
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value }));

  const pensionValue = assets
    .filter((asset) => isPensionCategory(asset.category))
    .reduce((sum, asset) => sum + (asset.currentValue ?? 0), 0);

  const krStockValue = assets
    .filter((asset) => asset.category === 'stock_kr')
    .reduce((sum, asset) => sum + (asset.currentValue ?? 0), 0);

  const usStockValue = assets
    .filter((asset) => asset.category === 'stock_us')
    .reduce((sum, asset) => sum + (asset.currentValue ?? 0), 0);

  const stockSplitData = [
    { name: '국내주식', value: krStockValue },
    { name: '미국주식', value: usStockValue }
  ].filter((item) => item.value > 0);

  const usStockAssets = assets.filter(
    (asset) => asset.category === 'stock_us' && (asset.exchangeRate ?? 0) > 0
  );
  const fxWeightedRate = (() => {
    const weighted = usStockAssets.reduce(
      (acc, asset) => {
        const rate = Number(asset.exchangeRate ?? 0);
        if (rate <= 0) {
          return acc;
        }

        const usdBase = Number(asset.usdAmount ?? 0) > 0
          ? Number(asset.usdAmount ?? 0)
          : Number(asset.currentValue ?? 0) / rate;

        if (usdBase <= 0) {
          return acc;
        }

        return {
          weightedSum: acc.weightedSum + (rate * usdBase),
          usdTotal: acc.usdTotal + usdBase
        };
      },
      { weightedSum: 0, usdTotal: 0 }
    );

    return weighted.usdTotal > 0 ? weighted.weightedSum / weighted.usdTotal : null;
  })();

  return (
    <div className="py-4">
      <h1>대시보드</h1>

      {error && <p className="mt-3">일부 데이터 로드 실패: {error}</p>}

      {assets.length === 0 && snapshots.length === 0 && summary.totalAssets === 0 && summary.totalLiabilities === 0 && (
        <SectionCard className="mt-4 p-6 border-l-[3px] border-l-[var(--color-primary)]">
          <h2 className="mt-0 text-lg font-bold">👋 환영합니다!</h2>
          <p className="text-[var(--color-text-muted)] mt-1 mb-4">
            아직 등록된 데이터가 없습니다. 아래 메뉴에서 자산·지출·소득을 등록하면 대시보드가 자동으로 채워집니다.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/assets" className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity">
              📊 자산 등록
            </Link>
            <Link href="/expenses" className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-bg-secondary)] transition-colors">
              💳 지출 등록
            </Link>
            <Link href="/profile" className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-bg-secondary)] transition-colors">
              👤 프로필 설정
            </Link>
          </div>
        </SectionCard>
      )}

      <div className="mt-4 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        <SectionCard className="p-5">
          <h3 className="kpi-label">총 자산(연금 제외)</h3>
          <p className="kpi-value">
            {formatCompact(summary.totalAssets)}
          </p>
        </SectionCard>
        <SectionCard className="p-5">
          <h3 className="kpi-label">총 부채</h3>
          <p className="kpi-value kpi-negative">
            {formatCompact(summary.totalLiabilities)}
          </p>
        </SectionCard>
        <SectionCard className="p-5">
          <h3 className="kpi-label">순자산</h3>
          <p className="kpi-value kpi-positive">
            {formatCompact(summary.netWorth)}
          </p>
        </SectionCard>
        <SectionCard className="p-5">
          <h3 className="kpi-label">월 고정지출</h3>
          <p className="kpi-value">
            {formatCompact(summary.monthlyFixedExpense)}
          </p>
        </SectionCard>
      </div>

      <div className="mt-4 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
        <SectionCard>
          <h3 className="mt-0">연금 자산</h3>
          <p className="m-0 text-[1.35rem] font-bold">{formatCompact(pensionValue)}</p>
          <p className="helper-text mt-2">
            국민연금/개인연금 등 연금 카테고리 합산 기준
          </p>
        </SectionCard>

        <SectionCard>
          <h3 className="mt-0">미국주식 환율 기준</h3>
          <p className="m-0 text-[1.35rem] font-bold">
            {fxWeightedRate ? `${fxWeightedRate.toFixed(2)} KRW/USD` : '-'}
          </p>
          <p className="helper-text mt-2">
            미국주식 USD 평가액 가중 평균 환율 기준 (없으면 표시 안함)
          </p>
        </SectionCard>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-[2fr_1fr]">
        <SectionCard>
          <h3 className="mt-0">자산 추이 (월별 스냅샷)</h3>
          {snapshots.length === 0 ? (
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
                <LineChart data={snapshots.map((s) => ({ label: s.month, value: s.totalValue }))}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis tickFormatter={(value) => `${Math.round(value / 10000)}만`} />
                  <Tooltip formatter={(value: number) => `${Number(value).toLocaleString()}원`} />
                  <Line type="monotone" dataKey="value" stroke="#0b63ce" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>

        <SectionCard>
          <h3 className="mt-0">자산 카테고리 비중</h3>
          {categoryData.length === 0 ? (
            <EmptyGuide
              icon="🥧"
              title="자산 카테고리 데이터 없음"
              description="자산을 등록하면 카테고리별 비중이 파이 차트로 표시됩니다."
              linkHref="/assets"
              linkLabel="자산 등록하기"
            />
          ) : (
            <div className="h-[260px] w-full sm:h-[320px]">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={categoryData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {categoryData.map((_, index) => (
                      <Cell key={index} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => `${Number(value).toLocaleString()}원`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>
      </div>

      <div className="mt-4">
        <SectionCard>
          <h3 className="mt-0">국내/미국 주식 비중</h3>
          {stockSplitData.length === 0 ? (
            <EmptyGuide
              icon="📊"
              title="주식 데이터 없음"
              description="국내주식 또는 미국주식 카테고리의 자산을 등록하면 비중이 표시됩니다."
              linkHref="/assets"
              linkLabel="주식 자산 등록하기"
            />
          ) : (
            <div className="h-[240px] w-full sm:h-[280px]">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={stockSplitData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={45}
                    outerRadius={85}
                    paddingAngle={2}
                  >
                    {stockSplitData.map((_, index) => (
                      <Cell key={index} fill={COLORS[(index + 2) % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => `${Number(value).toLocaleString()}원`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>
      </div>

      <div className="mt-4">
        <SectionCard>
          <h3 className="mt-0">월말 자산 스냅샷 이력</h3>
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
    </div>
  );
}