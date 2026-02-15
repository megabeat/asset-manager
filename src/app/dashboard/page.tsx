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
    return <div style={{ padding: '2rem' }}>로딩 중...</div>;
  }

  if (!summary) {
    return <div style={{ padding: '2rem' }}>데이터를 불러올 수 없습니다.</div>;
  }

  const categoryData = Object.entries(
    assets.reduce<Record<string, number>>((acc, asset) => {
      const category = asset.category || 'etc';
      acc[category] = (acc[category] ?? 0) + (asset.currentValue ?? 0);
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value }));

  const pensionValue = assets
    .filter((asset) => asset.category === 'pension')
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
    <div style={{ padding: '1rem 0' }}>
      <h1>대시보드</h1>

      {error && <p style={{ marginTop: '0.75rem' }}>일부 데이터 로드 실패: {error}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
        <SectionCard style={{ padding: '1.25rem' }}>
          <h3 style={{ margin: 0, fontSize: '0.9rem', color: '#666' }}>총 자산</h3>
          <p style={{ margin: '0.5rem 0 0', fontSize: '1.5rem', fontWeight: 'bold' }}>
            {summary.totalAssets.toLocaleString()}원
          </p>
        </SectionCard>
        <SectionCard style={{ padding: '1.25rem' }}>
          <h3 style={{ margin: 0, fontSize: '0.9rem', color: '#666' }}>총 부채</h3>
          <p style={{ margin: '0.5rem 0 0', fontSize: '1.5rem', fontWeight: 'bold', color: '#d32f2f' }}>
            {summary.totalLiabilities.toLocaleString()}원
          </p>
        </SectionCard>
        <SectionCard style={{ padding: '1.25rem' }}>
          <h3 style={{ margin: 0, fontSize: '0.9rem', color: '#666' }}>순자산</h3>
          <p style={{ margin: '0.5rem 0 0', fontSize: '1.5rem', fontWeight: 'bold', color: '#388e3c' }}>
            {summary.netWorth.toLocaleString()}원
          </p>
        </SectionCard>
        <SectionCard style={{ padding: '1.25rem' }}>
          <h3 style={{ margin: 0, fontSize: '0.9rem', color: '#666' }}>월 고정지출</h3>
          <p style={{ margin: '0.5rem 0 0', fontSize: '1.5rem', fontWeight: 'bold' }}>
            {summary.monthlyFixedExpense.toLocaleString()}원
          </p>
        </SectionCard>
      </div>

      <div style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
        <SectionCard>
          <h3 style={{ marginTop: 0 }}>연금 자산</h3>
          <p style={{ margin: 0, fontSize: '1.35rem', fontWeight: 700 }}>{pensionValue.toLocaleString()}원</p>
          <p className="helper-text" style={{ marginTop: '0.5rem' }}>
            국민연금/개인연금 등 연금 카테고리 합산 기준
          </p>
        </SectionCard>

        <SectionCard>
          <h3 style={{ marginTop: 0 }}>미국주식 환율 기준</h3>
          <p style={{ margin: 0, fontSize: '1.35rem', fontWeight: 700 }}>
            {fxWeightedRate ? `${fxWeightedRate.toFixed(2)} KRW/USD` : '-'}
          </p>
          <p className="helper-text" style={{ marginTop: '0.5rem' }}>
            미국주식 USD 평가액 가중 평균 환율 기준 (없으면 표시 안함)
          </p>
        </SectionCard>
      </div>

      <div style={{ marginTop: '2rem', display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
        <SectionCard>
          <h3 style={{ marginTop: 0 }}>자산 추이 (30일)</h3>
          {trend.length === 0 ? (
            <p>추이 데이터가 없습니다.</p>
          ) : (
            <div style={{ width: '100%', height: 320 }}>
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
          <h3 style={{ marginTop: 0 }}>자산 카테고리 비중</h3>
          {categoryData.length === 0 ? (
            <p>카테고리 데이터가 없습니다.</p>
          ) : (
            <div style={{ width: '100%', height: 320 }}>
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

      <div style={{ marginTop: '1rem' }}>
        <SectionCard>
          <h3 style={{ marginTop: 0 }}>국내/미국 주식 비중</h3>
          {stockSplitData.length === 0 ? (
            <p>주식 데이터가 없습니다.</p>
          ) : (
            <div style={{ width: '100%', height: 280 }}>
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

      <div style={{ marginTop: '1rem' }}>
        <SectionCard>
          <h3 style={{ marginTop: 0 }}>월별 자산 변화(월말 3일 기준)</h3>
          {monthlyChanges.length === 0 ? (
            <p>아직 월말 스냅샷 데이터가 없습니다.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '0.5rem 0' }}>월</th>
                  <th style={{ textAlign: 'right', padding: '0.5rem 0' }}>월말 자산</th>
                  <th style={{ textAlign: 'right', padding: '0.5rem 0' }}>전월 대비</th>
                </tr>
              </thead>
              <tbody>
                {monthlyChanges.map((item) => (
                  <tr key={item.month}>
                    <td style={{ padding: '0.4rem 0' }}>{item.month}</td>
                    <td style={{ textAlign: 'right', padding: '0.4rem 0' }}>
                      {item.totalValue.toLocaleString()}원
                    </td>
                    <td
                      style={{
                        textAlign: 'right',
                        padding: '0.4rem 0',
                        color: item.delta >= 0 ? '#388e3c' : '#d32f2f'
                      }}
                    >
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
