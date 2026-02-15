'use client';

import { useEffect, useState } from 'react';
import { api, MonthlyAssetChange } from '@/lib/api';
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

type Summary = {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  monthlyFixedExpense: number;
};

type TrendPoint = {
  time: string;
  value: number;
};

type AssetItem = {
  id: string;
  name: string;
  category: string;
  currentValue: number;
  usdAmount?: number;
  exchangeRate?: number;
};

function isPensionCategory(category?: string): boolean {
  return (
    category === 'pension' ||
    category === 'pension_national' ||
    category === 'pension_personal' ||
    category === 'pension_retirement'
  );
}

const COLORS = ['#0b63ce', '#2e7d32', '#f57c00', '#7b1fa2', '#c2185b', '#00796b'];

export default function DashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [monthlyChanges, setMonthlyChanges] = useState<MonthlyAssetChange[]>([]);
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.getDashboardSummary(), api.getAssetTrend('30d'), api.getAssets(), api.getMonthlyAssetChanges()]).then(
      ([summaryResult, trendResult, assetsResult, monthlyResult]) => {
        if (summaryResult.data) {
          setSummary(summaryResult.data);
        }

        if (trendResult.data) {
          setTrend(trendResult.data);
        }

        if (assetsResult.data) {
          setAssets(assetsResult.data as AssetItem[]);
        }

        if (monthlyResult.data) {
          setMonthlyChanges(monthlyResult.data);
        }

        const firstError = summaryResult.error ?? trendResult.error ?? assetsResult.error ?? monthlyResult.error;
        if (firstError) {
          setError(firstError.message);
        }

        setLoading(false);
      }
    );
  }, []);

  if (loading) {
    return <div className="p-8">로딩 중...</div>;
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

      <div className="mt-4 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        <SectionCard className="p-5">
          <h3 className="kpi-label">총 자산(연금 제외)</h3>
          <p className="kpi-value">
            {summary.totalAssets.toLocaleString()}원
          </p>
        </SectionCard>
        <SectionCard className="p-5">
          <h3 className="kpi-label">총 부채</h3>
          <p className="kpi-value kpi-negative">
            {summary.totalLiabilities.toLocaleString()}원
          </p>
        </SectionCard>
        <SectionCard className="p-5">
          <h3 className="kpi-label">순자산</h3>
          <p className="kpi-value kpi-positive">
            {summary.netWorth.toLocaleString()}원
          </p>
        </SectionCard>
        <SectionCard className="p-5">
          <h3 className="kpi-label">월 고정지출</h3>
          <p className="kpi-value">
            {summary.monthlyFixedExpense.toLocaleString()}원
          </p>
        </SectionCard>
      </div>

      <div className="mt-4 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
        <SectionCard>
          <h3 className="mt-0">연금 자산</h3>
          <p className="m-0 text-[1.35rem] font-bold">{pensionValue.toLocaleString()}원</p>
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
          <h3 className="mt-0">자산 추이 (30일)</h3>
          {trend.length === 0 ? (
            <p>추이 데이터가 없습니다.</p>
          ) : (
            <div className="h-[260px] w-full sm:h-[320px]">
              <ResponsiveContainer>
                <LineChart data={trend.map((point) => ({ ...point, label: point.time.slice(5, 10) }))}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis tickFormatter={(value) => `${Math.round(value / 10000)}만`} />
                  <Tooltip formatter={(value: number) => `${Number(value).toLocaleString()}원`} />
                  <Line type="monotone" dataKey="value" stroke="#0b63ce" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>

        <SectionCard>
          <h3 className="mt-0">자산 카테고리 비중</h3>
          {categoryData.length === 0 ? (
            <p>카테고리 데이터가 없습니다.</p>
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
            <p>주식 데이터가 없습니다.</p>
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
          <h3 className="mt-0">월별 자산 변화(월말 3일 기준)</h3>
          {monthlyChanges.length === 0 ? (
            <p>아직 월말 스냅샷 데이터가 없습니다.</p>
          ) : (
            <table className="ui-table">
              <thead>
                <tr className="ui-table-head-row">
                  <th className="ui-table-th text-left">월</th>
                  <th className="ui-table-th text-right">월말 자산</th>
                  <th className="ui-table-th text-right">전월 대비</th>
                </tr>
              </thead>
              <tbody>
                {monthlyChanges.map((item) => (
                  <tr key={item.month} className="ui-table-row-even">
                    <td className="ui-table-td text-left">{item.month}</td>
                    <td className="ui-table-td text-right">
                      {item.totalValue.toLocaleString()}원
                    </td>
                    <td className={`ui-table-td text-right ${item.delta >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {item.delta >= 0 ? '+' : ''}
                      {item.delta.toLocaleString()}원
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
