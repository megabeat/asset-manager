'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, Asset } from '@/lib/api';
import { SectionCard } from '@/components/ui/SectionCard';
import { FormField } from '@/components/ui/FormField';
import { DataTable } from '@/components/ui/DataTable';

type AssetCategory = 'cash' | 'deposit' | 'pension' | 'stock_kr' | 'stock_us' | 'real_estate' | 'etc';

type AssetForm = {
  category: AssetCategory;
  name: string;
  currentValue: number;
  valuationDate: string;
  note: string;
  symbol: string;
  usdAmount: number;
  exchangeRate: number;
  pensionMonthlyContribution: number;
  pensionReceiveAge: number;
  pensionReceiveStart: string;
};

const defaultForm: AssetForm = {
  category: 'cash',
  name: '',
  currentValue: 0,
  valuationDate: new Date().toISOString().slice(0, 10),
  note: '',
  symbol: '',
  usdAmount: 0,
  exchangeRate: 0,
  pensionMonthlyContribution: 0,
  pensionReceiveAge: 60,
  pensionReceiveStart: ''
};

const categoryLabel: Record<AssetCategory, string> = {
  cash: '현금',
  deposit: '예금',
  pension: '연금(국민연금 포함)',
  stock_kr: '국내주식',
  stock_us: '미국주식',
  real_estate: '부동산',
  etc: '기타'
};

export default function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<AssetForm>(defaultForm);
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [fxLoading, setFxLoading] = useState(false);

  async function loadAssets() {
    const result = await api.getAssets();
    if (result.data) {
      setAssets(result.data);
    }
    if (result.error) {
      setMessage(`목록 조회 실패: ${result.error.message}`);
    }
  }

  async function loadUsdKrwRate() {
    setFxLoading(true);
    try {
      const response = await fetch('https://open.er-api.com/v6/latest/USD');
      const payload = (await response.json()) as { rates?: { KRW?: number } };
      const rate = payload?.rates?.KRW;
      if (typeof rate === 'number' && Number.isFinite(rate) && rate > 0) {
        setForm((prev) => ({ ...prev, exchangeRate: Math.round(rate * 100) / 100 }));
      }
    } catch {
      setMessage('환율 정보를 가져오지 못했습니다. 직접 입력해 주세요.');
    } finally {
      setFxLoading(false);
    }
  }

  useEffect(() => {
    loadAssets().finally(() => {
      setLoading(false);
    });
    loadUsdKrwRate();
  }, []);

  const effectiveCurrentValue = useMemo(() => {
    if (form.category === 'stock_us') {
      return Math.round((form.usdAmount || 0) * (form.exchangeRate || 0));
    }
    return form.currentValue;
  }, [form.category, form.currentValue, form.usdAmount, form.exchangeRate]);

  const totalAssetValue = useMemo(
    () => assets.reduce((sum, asset) => sum + (asset.currentValue ?? 0), 0),
    [assets]
  );

  const pensionAssetValue = useMemo(
    () => assets.filter((asset) => asset.category === 'pension').reduce((sum, asset) => sum + (asset.currentValue ?? 0), 0),
    [assets]
  );

  const stockAssetValue = useMemo(
    () =>
      assets
        .filter((asset) => asset.category === 'stock_kr' || asset.category === 'stock_us')
        .reduce((sum, asset) => sum + (asset.currentValue ?? 0), 0),
    [assets]
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const nextErrors: Record<string, string> = {};

    if (!form.name.trim()) nextErrors.name = '자산명을 입력해주세요.';
    if (!form.valuationDate) nextErrors.valuationDate = '평가일을 선택해주세요.';

    if (form.category === 'stock_us') {
      if (!form.symbol.trim()) nextErrors.symbol = '종목코드를 입력해주세요.';
      if (form.usdAmount <= 0) nextErrors.usdAmount = 'USD 평가액은 0보다 커야 합니다.';
      if (form.exchangeRate <= 0) nextErrors.exchangeRate = '환율은 0보다 커야 합니다.';
    } else if (form.category === 'pension') {
      if (form.pensionMonthlyContribution < 0) nextErrors.pensionMonthlyContribution = '납입액은 0 이상이어야 합니다.';
      if (form.pensionReceiveAge < 40 || form.pensionReceiveAge > 100) {
        nextErrors.pensionReceiveAge = '수령 나이는 40~100 범위로 입력해주세요.';
      }
      if (!form.pensionReceiveStart) nextErrors.pensionReceiveStart = '수령 시작 시기를 입력해주세요.';
      if (form.currentValue < 0) nextErrors.currentValue = '현재가치는 0 이상이어야 합니다.';
    } else if (form.currentValue < 0) {
      nextErrors.currentValue = '금액은 0 이상이어야 합니다.';
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setMessage('입력값을 다시 확인해주세요.');
      return;
    }

    setSaving(true);
    const result = await api.createAsset({
      category: form.category,
      name: form.name.trim(),
      currentValue: Number(effectiveCurrentValue),
      valuationDate: form.valuationDate,
      note: form.note.trim(),
      symbol: form.symbol.trim(),
      usdAmount: form.category === 'stock_us' ? Number(form.usdAmount) : null,
      exchangeRate: form.category === 'stock_us' ? Number(form.exchangeRate) : null,
      pensionMonthlyContribution: form.category === 'pension' ? Number(form.pensionMonthlyContribution) : null,
      pensionReceiveAge: form.category === 'pension' ? Number(form.pensionReceiveAge) : null,
      pensionReceiveStart: form.category === 'pension' ? form.pensionReceiveStart : null
    });

    if (result.error) {
      setMessage(`저장 실패: ${result.error.message}`);
    } else {
      setForm((prev) => ({ ...defaultForm, exchangeRate: prev.exchangeRate }));
      setMessage('자산이 저장되었습니다.');
      await loadAssets();
    }

    setSaving(false);
  }

  async function onDelete(id: string) {
    setMessage(null);
    const result = await api.deleteAsset(id);
    if (result.error) {
      setMessage(`삭제 실패: ${result.error.message}`);
      return;
    }

    setAssets((prev) => prev.filter((asset) => asset.id !== id));
    setMessage('자산을 삭제했습니다.');
  }

  if (loading) {
    return <div style={{ padding: '2rem' }}>로딩 중...</div>;
  }

  return (
    <div style={{ padding: '1rem 0' }}>
      <h1>자산 관리</h1>

      <div className="form-grid" style={{ marginTop: '1rem' }}>
        <SectionCard>
          <p className="helper-text">총 자산</p>
          <h2 style={{ margin: 0 }}>{totalAssetValue.toLocaleString()}원</h2>
        </SectionCard>
        <SectionCard>
          <p className="helper-text">연금 자산</p>
          <h2 style={{ margin: 0 }}>{pensionAssetValue.toLocaleString()}원</h2>
        </SectionCard>
        <SectionCard>
          <p className="helper-text">주식 자산</p>
          <h2 style={{ margin: 0 }}>{stockAssetValue.toLocaleString()}원</h2>
        </SectionCard>
      </div>

      <SectionCard style={{ marginTop: '1rem' }}>
        <form onSubmit={onSubmit} className="form-grid">
          <FormField label="카테고리">
            <select
              value={form.category}
              onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value as AssetCategory }))}
            >
              <option value="cash">현금</option>
              <option value="deposit">예금</option>
              <option value="pension">연금(국민연금 포함)</option>
              <option value="stock_kr">국내주식</option>
              <option value="stock_us">미국주식</option>
              <option value="real_estate">부동산</option>
              <option value="etc">기타</option>
            </select>
          </FormField>

          <FormField label="자산명" error={errors.name}>
            <input
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder={form.category === 'pension' ? '예: 국민연금' : '예: CMA 통장'}
            />
          </FormField>

          {form.category === 'stock_us' ? (
            <>
              <FormField label="종목코드" error={errors.symbol}>
                <input
                  value={form.symbol}
                  onChange={(event) => setForm((prev) => ({ ...prev, symbol: event.target.value.toUpperCase() }))}
                  placeholder="예: AAPL"
                />
              </FormField>
              <FormField label="USD 평가액" error={errors.usdAmount}>
                <input
                  type="number"
                  min={0}
                  value={form.usdAmount}
                  onChange={(event) => setForm((prev) => ({ ...prev, usdAmount: Number(event.target.value || 0) }))}
                />
              </FormField>
              <FormField label={`환율(USD/KRW)${fxLoading ? ' - 조회중' : ''}`} error={errors.exchangeRate}>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.exchangeRate}
                  onChange={(event) => setForm((prev) => ({ ...prev, exchangeRate: Number(event.target.value || 0) }))}
                />
              </FormField>
              <FormField label="원화 평가액(자동 계산)">
                <input value={effectiveCurrentValue.toLocaleString()} readOnly />
              </FormField>
            </>
          ) : (
            <FormField label="현재가치(원)" error={errors.currentValue}>
              <input
                type="number"
                min={0}
                value={form.currentValue}
                onChange={(event) => setForm((prev) => ({ ...prev, currentValue: Number(event.target.value || 0) }))}
              />
            </FormField>
          )}

          {form.category === 'pension' ? (
            <>
              <FormField label="현재 월 납입액(원)" error={errors.pensionMonthlyContribution}>
                <input
                  type="number"
                  min={0}
                  value={form.pensionMonthlyContribution}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, pensionMonthlyContribution: Number(event.target.value || 0) }))
                  }
                />
              </FormField>
              <FormField label="수령 나이" error={errors.pensionReceiveAge}>
                <input
                  type="number"
                  min={40}
                  max={100}
                  value={form.pensionReceiveAge}
                  onChange={(event) => setForm((prev) => ({ ...prev, pensionReceiveAge: Number(event.target.value || 60) }))}
                />
              </FormField>
              <FormField label="수령 시작 시기" error={errors.pensionReceiveStart}>
                <input
                  type="month"
                  value={form.pensionReceiveStart}
                  onChange={(event) => setForm((prev) => ({ ...prev, pensionReceiveStart: event.target.value }))}
                />
              </FormField>
            </>
          ) : null}

          <FormField label="평가일" error={errors.valuationDate}>
            <input
              type="date"
              value={form.valuationDate}
              onChange={(event) => setForm((prev) => ({ ...prev, valuationDate: event.target.value }))}
            />
          </FormField>

          <FormField label="메모" fullWidth>
            <input
              value={form.note}
              onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
              placeholder="선택 입력"
            />
          </FormField>

          <button type="submit" disabled={saving} className="btn-primary" style={{ width: 180, alignSelf: 'end' }}>
            {saving ? '저장 중...' : '자산 추가'}
          </button>
        </form>
      </SectionCard>

      {message && <p style={{ marginTop: '1rem' }}>{message}</p>}

      <SectionCard style={{ marginTop: '1rem' }}>
        <DataTable
          rows={assets}
          rowKey={(asset) => asset.id}
          emptyMessage="등록된 자산이 없습니다."
          columns={[
            { key: 'name', header: '자산명', render: (asset) => asset.name },
            {
              key: 'category',
              header: '분류',
              render: (asset) => categoryLabel[(asset.category as AssetCategory) ?? 'etc'] ?? asset.category,
            },
            {
              key: 'meta',
              header: '상세',
              render: (asset) => {
                if (asset.category === 'stock_us') {
                  return `${asset.symbol || '-'} / ${asset.usdAmount?.toLocaleString() ?? 0} USD`;
                }
                if (asset.category === 'pension') {
                  return `납입 ${asset.pensionMonthlyContribution?.toLocaleString() ?? 0}원`;
                }
                return asset.symbol || '-';
              },
            },
            {
              key: 'value',
              header: '현재가치',
              align: 'right',
              render: (asset) => `${(asset.currentValue ?? 0).toLocaleString()}원`,
            },
            {
              key: 'actions',
              header: '관리',
              align: 'center',
              render: (asset) => (
                <button onClick={() => onDelete(asset.id)} className="btn-danger-outline">
                  삭제
                </button>
              ),
            },
          ]}
        />
      </SectionCard>
    </div>
  );
}
