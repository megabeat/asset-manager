'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, Asset } from '@/lib/api';
import { SectionCard } from '@/components/ui/SectionCard';
import { FormField } from '@/components/ui/FormField';
import { DataTable } from '@/components/ui/DataTable';

type AssetCategory = 'cash' | 'deposit' | 'pension' | 'stock_kr' | 'stock_us' | 'real_estate' | 'etc';
type NumericInput = number | '';

type AssetForm = {
  category: AssetCategory;
  name: string;
  currentValue: NumericInput;
  quantity: NumericInput;
  acquiredValue: NumericInput;
  valuationDate: string;
  note: string;
  symbol: string;
  usdAmount: NumericInput;
  exchangeRate: NumericInput;
  pensionMonthlyContribution: NumericInput;
  pensionReceiveAge: NumericInput;
  pensionReceiveStart: string;
};

type QuickPreset = {
  id: string;
  label: string;
  category: AssetCategory;
  values: Partial<AssetForm>;
};

const defaultForm: AssetForm = {
  category: 'cash',
  name: '',
  currentValue: '',
  quantity: '',
  acquiredValue: '',
  valuationDate: new Date().toISOString().slice(0, 10),
  note: '',
  symbol: '',
  usdAmount: '',
  exchangeRate: '',
  pensionMonthlyContribution: '',
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

const quickPresets: QuickPreset[] = [
  {
    id: 'cash-wallet',
    label: '현금-지갑',
    category: 'cash',
    values: { name: '생활비 현금' }
  },
  {
    id: 'deposit-cma',
    label: '예금-CMA',
    category: 'deposit',
    values: { name: 'CMA 통장' }
  },
  {
    id: 'pension-national',
    label: '국민연금',
    category: 'pension',
    values: { name: '국민연금', pensionReceiveAge: 63 }
  },
  {
    id: 'stock-kr',
    label: '국내주식',
    category: 'stock_kr',
    values: { name: '국내주식', symbol: '005930', quantity: 1 }
  },
  {
    id: 'stock-us',
    label: '미국주식',
    category: 'stock_us',
    values: { name: '미국주식', symbol: 'AAPL', quantity: 1 }
  },
  {
    id: 'real-estate',
    label: '부동산',
    category: 'real_estate',
    values: { name: '아파트' }
  }
];

export default function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<AssetForm>(defaultForm);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
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

  const isStockCategory = form.category === 'stock_kr' || form.category === 'stock_us';

  function resetFormWithRate(rate: NumericInput) {
    setForm({
      ...defaultForm,
      exchangeRate: rate,
      valuationDate: new Date().toISOString().slice(0, 10)
    });
  }

  function applyPreset(preset: QuickPreset) {
    const preservedRate = form.exchangeRate;
    setEditingAssetId(null);
    setErrors({});
    setMessage(null);
    setForm({
      ...defaultForm,
      exchangeRate: preservedRate,
      valuationDate: new Date().toISOString().slice(0, 10),
      category: preset.category,
      ...preset.values
    });
  }

  function changeCategory(category: AssetCategory) {
    const preservedRate = form.exchangeRate;
    setForm((prev) => ({
      ...defaultForm,
      exchangeRate: preservedRate,
      valuationDate: prev.valuationDate,
      category,
      name: prev.category === category ? prev.name : ''
    }));
    setErrors({});
  }

  const effectiveUsdAmount = useMemo(() => {
    if (form.category !== 'stock_us') {
      return 0;
    }
    return Number(form.quantity || 0) * Number(form.acquiredValue || 0);
  }, [form.category, form.quantity, form.acquiredValue]);

  const effectiveCurrentValue = useMemo(() => {
    if (form.category === 'stock_kr') {
      return Math.round((form.quantity || 0) * (form.acquiredValue || 0));
    }
    if (form.category === 'stock_us') {
      return Math.round(effectiveUsdAmount * (form.exchangeRate || 0));
    }
    return form.currentValue;
  }, [form.category, form.currentValue, form.quantity, form.acquiredValue, form.exchangeRate, effectiveUsdAmount]);

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

    if (isStockCategory) {
      if (!form.symbol.trim()) nextErrors.symbol = '종목코드를 입력해주세요.';
      if (Number(form.quantity || 0) <= 0) nextErrors.quantity = '수량은 0보다 커야 합니다.';
      if (Number(form.acquiredValue || 0) <= 0) nextErrors.acquiredValue = '단가는 0보다 커야 합니다.';
    }

    if (form.category === 'stock_us') {
      if (Number(form.exchangeRate || 0) <= 0) nextErrors.exchangeRate = '환율은 0보다 커야 합니다.';
    } else if (form.category === 'pension') {
      if (Number(form.pensionMonthlyContribution || 0) < 0) nextErrors.pensionMonthlyContribution = '납입액은 0 이상이어야 합니다.';
      const pensionAge = Number(form.pensionReceiveAge || 0);
      if (pensionAge < 40 || pensionAge > 100) {
        nextErrors.pensionReceiveAge = '수령 나이는 40~100 범위로 입력해주세요.';
      }
      if (!form.pensionReceiveStart) nextErrors.pensionReceiveStart = '수령 시작 시기를 입력해주세요.';
      if (Number(form.currentValue || 0) < 0) nextErrors.currentValue = '현재가치는 0 이상이어야 합니다.';
    } else if (Number(form.currentValue || 0) < 0) {
      nextErrors.currentValue = '금액은 0 이상이어야 합니다.';
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setMessage('입력값을 다시 확인해주세요.');
      return;
    }

    setSaving(true);
    const payload = {
      category: form.category,
      name: form.name.trim(),
      currentValue: Number(effectiveCurrentValue),
      quantity: isStockCategory ? Number(form.quantity) : null,
      acquiredValue: isStockCategory ? Number(form.acquiredValue) : null,
      valuationDate: form.valuationDate,
      note: form.note.trim(),
      symbol: isStockCategory ? form.symbol.trim() : null,
      usdAmount: form.category === 'stock_us' ? Number(effectiveUsdAmount) : null,
      exchangeRate: form.category === 'stock_us' ? Number(form.exchangeRate) : null,
      pensionMonthlyContribution: form.category === 'pension' ? Number(form.pensionMonthlyContribution) : null,
      pensionReceiveAge: form.category === 'pension' ? Number(form.pensionReceiveAge) : null,
      pensionReceiveStart: form.category === 'pension' ? form.pensionReceiveStart : null
    };

    const result = editingAssetId
      ? await api.updateAsset(editingAssetId, payload)
      : await api.createAsset(payload);

    if (result.error) {
      setMessage(`${editingAssetId ? '수정' : '저장'} 실패: ${result.error.message}`);
    } else {
      resetFormWithRate(form.exchangeRate);
      setEditingAssetId(null);
      setMessage(editingAssetId ? '자산이 수정되었습니다.' : '자산이 저장되었습니다.');
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

  function onEdit(asset: Asset) {
    const quantity = Number(asset.quantity ?? 0);
    const acquiredValue = Number(asset.acquiredValue ?? 0);

    setEditingAssetId(asset.id);
    setErrors({});
    setMessage(null);
    setForm({
      category: (asset.category as AssetCategory) ?? 'etc',
      name: asset.name ?? '',
      currentValue: Number(asset.currentValue ?? 0),
      quantity:
        quantity > 0
          ? quantity
          : asset.category === 'stock_us'
            ? 1
            : asset.category === 'stock_kr'
              ? 1
              : 0,
      acquiredValue:
        acquiredValue > 0
          ? acquiredValue
          : asset.category === 'stock_us'
            ? Number(asset.usdAmount ?? 0)
            : asset.category === 'stock_kr'
              ? Number(asset.currentValue ?? 0)
              : 0,
      valuationDate: asset.valuationDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
      note: asset.note ?? '',
      symbol: asset.symbol ?? '',
      usdAmount: Number(asset.usdAmount ?? 0),
      exchangeRate: Number(asset.exchangeRate ?? form.exchangeRate ?? 0),
      pensionMonthlyContribution: Number(asset.pensionMonthlyContribution ?? 0),
      pensionReceiveAge: Number(asset.pensionReceiveAge ?? 60),
      pensionReceiveStart: asset.pensionReceiveStart ?? ''
    });
  }

  function onCancelEdit() {
    setEditingAssetId(null);
    setErrors({});
    resetFormWithRate(form.exchangeRate);
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
        <div style={{ marginBottom: '0.75rem' }}>
          <p className="helper-text" style={{ margin: 0 }}>빠른 입력 템플릿</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.5rem' }}>
            {quickPresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset)}
                className="btn-danger-outline"
                style={{ minWidth: 100 }}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={onSubmit} className="form-grid">
          <FormField label="카테고리" fullWidth>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {(Object.keys(categoryLabel) as AssetCategory[]).map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => changeCategory(category)}
                  className={form.category === category ? 'btn-primary' : 'btn-danger-outline'}
                  style={{ minWidth: 92 }}
                >
                  {categoryLabel[category]}
                </button>
              ))}
            </div>
          </FormField>

          <FormField label="자산명" error={errors.name}>
            <input
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder={form.category === 'pension' ? '예: 국민연금' : '예: CMA 통장'}
            />
          </FormField>

          {isStockCategory ? (
            <>
              <FormField label="종목코드" error={errors.symbol}>
                <input
                  value={form.symbol}
                  onChange={(event) => setForm((prev) => ({ ...prev, symbol: event.target.value.toUpperCase() }))}
                  placeholder="예: AAPL"
                />
              </FormField>
              <FormField label="수량" error={errors.quantity}>
                <input
                  type="number"
                  min={0}
                  step="0.0001"
                  value={form.quantity}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      quantity: event.target.value === '' ? '' : Number(event.target.value)
                    }))
                  }
                />
              </FormField>
              <FormField
                label={form.category === 'stock_us' ? '단가(USD)' : '단가(원)'}
                error={errors.acquiredValue}
              >
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.acquiredValue}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      acquiredValue: event.target.value === '' ? '' : Number(event.target.value)
                    }))
                  }
                />
              </FormField>

              {form.category === 'stock_us' ? (
                <>
                  <FormField label={`환율(USD/KRW)${fxLoading ? ' - 조회중' : ''}`} error={errors.exchangeRate}>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.exchangeRate}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          exchangeRate: event.target.value === '' ? '' : Number(event.target.value)
                        }))
                      }
                    />
                  </FormField>
                  <FormField label="USD 평가액(자동 계산)">
                    <input value={effectiveUsdAmount.toLocaleString()} readOnly />
                  </FormField>
                  <FormField label="원화 평가액(자동 계산)">
                    <input value={effectiveCurrentValue.toLocaleString()} readOnly />
                  </FormField>
                  <FormField label="계산식" fullWidth>
                    <input value={`${form.quantity || 0}주 × ${form.acquiredValue || 0} USD × ${form.exchangeRate || 0} = ${effectiveCurrentValue.toLocaleString()}원`} readOnly />
                  </FormField>
                </>
              ) : (
                <>
                  <FormField label="현재가치(원, 자동 계산)">
                    <input value={effectiveCurrentValue.toLocaleString()} readOnly />
                  </FormField>
                  <FormField label="계산식" fullWidth>
                    <input value={`${form.quantity || 0}주 × ${form.acquiredValue || 0}원 = ${effectiveCurrentValue.toLocaleString()}원`} readOnly />
                  </FormField>
                </>
              )}
            </>
          ) : (
            <FormField label="현재가치(원)" error={errors.currentValue}>
              <input
                type="number"
                min={0}
                value={form.currentValue}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    currentValue: event.target.value === '' ? '' : Number(event.target.value)
                  }))
                }
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
                    setForm((prev) => ({
                      ...prev,
                      pensionMonthlyContribution: event.target.value === '' ? '' : Number(event.target.value)
                    }))
                  }
                />
              </FormField>
              <FormField label="수령 나이" error={errors.pensionReceiveAge}>
                <input
                  type="number"
                  min={40}
                  max={100}
                  value={form.pensionReceiveAge}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      pensionReceiveAge: event.target.value === '' ? '' : Number(event.target.value)
                    }))
                  }
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
              placeholder={
                form.category === 'pension'
                  ? '예: 추납 포함, 예상 수령액 재확인 필요'
                  : isStockCategory
                    ? '예: 분할매수 2차'
                    : '선택 입력'
              }
            />
          </FormField>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'end' }}>
            <button type="submit" disabled={saving} className="btn-primary" style={{ width: 180 }}>
              {saving ? '저장 중...' : editingAssetId ? '자산 수정' : '자산 추가'}
            </button>
            {editingAssetId ? (
              <button type="button" onClick={onCancelEdit} className="btn-danger-outline" style={{ width: 120 }}>
                취소
              </button>
            ) : null}
          </div>
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
                <div style={{ display: 'flex', justifyContent: 'center', gap: '0.4rem' }}>
                  <button onClick={() => onEdit(asset)} className="btn-primary">
                    수정
                  </button>
                  <button onClick={() => onDelete(asset.id)} className="btn-danger-outline">
                    삭제
                  </button>
                </div>
              ),
            },
          ]}
        />
      </SectionCard>
    </div>
  );
}
