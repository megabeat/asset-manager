'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { api, Asset } from '@/lib/api';
import { FeedbackBanner } from '@/components/ui/FeedbackBanner';
import { useFeedbackMessage } from '@/hooks/useFeedbackMessage';
import { useConfirmModal } from '@/hooks/useConfirmModal';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { SectionCard } from '@/components/ui/SectionCard';
import { FormField } from '@/components/ui/FormField';
import { DataTable } from '@/components/ui/DataTable';
import { getAssetCategoryLabel } from '@/lib/assetCategory';
import { isPensionCategory } from '@/lib/isPensionCategory';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ResponsiveContainer, Tooltip, Treemap } from 'recharts';

type AssetCategory = 'cash' | 'deposit' | 'stock_kr' | 'stock_us' | 'car' | 'real_estate' | 'etc';
type NumericInput = number | '';

type AssetForm = {
  category: AssetCategory;
  name: string;
  currentValue: NumericInput;
  quantity: NumericInput;
  acquiredValue: NumericInput;
  valuationDate: string;
  note: string;
  carYear: NumericInput;
  symbol: string;
  usdAmount: NumericInput;
  exchangeRate: NumericInput;
  pensionMonthlyContribution: NumericInput;
  pensionReceiveAge: NumericInput;
  pensionReceiveStart: string;
  owner: string;
};

type QuickPreset = {
  id: string;
  label: string;
  category: AssetCategory;
  values: Partial<AssetForm>;
};

type CategoryGroup = {
  category: string;
  label: string;
  total: number;
  count: number;
  color: string;
  items: Array<{ name: string; size: number }>;
};

type CategorySummaryRow = {
  category: string;
  label: string;
  count: number;
  total: number;
  ratio: number;
  color: string;
};

type TreemapItem = {
  name: string;
  size: number;
  category?: string;
  fill: string;
};

const defaultForm: AssetForm = {
  category: 'cash',
  name: '',
  currentValue: '',
  quantity: '',
  acquiredValue: '',
  valuationDate: new Date().toISOString().slice(0, 10),
  note: '',
  carYear: '',
  symbol: '',
  usdAmount: '',
  exchangeRate: '',
  pensionMonthlyContribution: '',
  pensionReceiveAge: 60,
  pensionReceiveStart: '',
  owner: '본인'
};

const categoryLabel: Record<AssetCategory, string> = {
  cash: '현금',
  deposit: '예금',
  stock_kr: '국내주식',
  stock_us: '미국주식',
  car: '자동차',
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
    id: 'car-auto',
    label: '자동차',
    category: 'car',
    values: { name: '자동차', carYear: new Date().getFullYear() - 3 }
  },
  {
    id: 'real-estate',
    label: '부동산',
    category: 'real_estate',
    values: { name: '아파트' }
  }
];

const TREEMAP_COLORS = ['#0b63ce', '#2e7d32', '#f57c00', '#7b1fa2', '#c2185b', '#00796b', '#4f46e5'];

function formatWon(value: number): string {
  return `${Math.round(value).toLocaleString()}원`;
}

function AssetTreemapTooltip({
  active,
  payload
}: {
  active?: boolean;
  payload?: Array<{ payload?: TreemapItem }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const node = payload[0]?.payload;
  if (!node) return null;
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 shadow-md">
      <p className="m-0 text-[0.85rem] font-semibold">{node.name}</p>
      {node.category && <p className="helper-text mt-1">{node.category}</p>}
      <p className="m-0 mt-1 text-[0.85rem]">{formatWon(node.size)}</p>
    </div>
  );
}



export default function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<AssetForm>(defaultForm);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const { message, feedback, clearMessage, setMessageText, setSuccessMessage, setErrorMessage } = useFeedbackMessage();
  const { confirmState, confirm, onConfirm: onModalConfirm, onCancel: onModalCancel } = useConfirmModal();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [fxLoading, setFxLoading] = useState(false);
  const [fxManualOverride, setFxManualOverride] = useState(false);
  const [treemapView, setTreemapView] = useState<'all' | 'stock'>('all');

  async function loadAssets() {
    const result = await api.getAssets();
    if (result.data) {
      setAssets(result.data.filter((asset) => !isPensionCategory(asset.category)));
    }
    if (result.error) {
      setErrorMessage('목록 조회 실패', result.error);
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
      setMessageText('환율 정보를 가져오지 못했습니다. 직접 입력해 주세요.');
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
    clearMessage();
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

  const stockAssetValue = useMemo(
    () =>
      assets
        .filter((asset) => asset.category === 'stock_kr' || asset.category === 'stock_us')
        .reduce((sum, asset) => sum + (asset.currentValue ?? 0), 0),
    [assets]
  );

  const categoryGroups = useMemo<CategoryGroup[]>(() => {
    const groupMap = new Map<string, CategoryGroup>();

    assets.forEach((asset) => {
      const category = asset.category || 'etc';
      const currentValue = Math.max(0, Number(asset.currentValue ?? 0));

      if (!groupMap.has(category)) {
        const index = groupMap.size % TREEMAP_COLORS.length;
        groupMap.set(category, {
          category,
          label: getAssetCategoryLabel(category),
          total: 0,
          count: 0,
          color: TREEMAP_COLORS[index],
          items: []
        });
      }

      const group = groupMap.get(category);
      if (!group) return;

      group.total += currentValue;
      group.count += 1;
      const isStock = category === 'stock_kr' || category === 'stock_us';
      group.items.push({
        name: (isStock && asset.symbol) ? asset.symbol : (asset.name || '이름 없음'),
        size: currentValue
      });
    });

    return Array.from(groupMap.values()).sort((left, right) => right.total - left.total);
  }, [assets]);

  const categorySummaryRows = useMemo<CategorySummaryRow[]>(() => {
    if (totalAssetValue <= 0) {
      return categoryGroups.map((group) => ({
        category: group.category,
        label: group.label,
        count: group.count,
        total: group.total,
        ratio: 0,
        color: group.color
      }));
    }

    return categoryGroups.map((group) => ({
      category: group.category,
      label: group.label,
      count: group.count,
      total: group.total,
      ratio: group.total / totalAssetValue,
      color: group.color
    }));
  }, [categoryGroups, totalAssetValue]);

  const treemapData = useMemo<TreemapItem[]>(() => {
    return categoryGroups
      .filter((group) => group.total > 0)
      .flatMap((group) =>
        group.items
          .filter((item) => item.size > 0)
          .map((item) => ({
            name: item.name,
            size: item.size,
            category: group.label,
            fill: group.color
          }))
      );
  }, [categoryGroups]);

  const stockTreemapData = useMemo<TreemapItem[]>(() => {
    const STOCK_PALETTE = [
      '#0b63ce', '#2e7d32', '#f57c00', '#7b1fa2', '#c2185b',
      '#00796b', '#4f46e5', '#d32f2f', '#0097a7', '#689f38',
      '#5c6bc0', '#e64a19', '#00838f', '#8e24aa', '#f9a825',
    ];
    const stockCategories = ['stock_us', 'stock_kr'] as const;
    let colorIdx = 0;
    return stockCategories.flatMap((cat) => {
      const items = assets.filter((a) => a.category === cat && (a.currentValue ?? 0) > 0);
      const label = cat === 'stock_us' ? '미국주식' : '국내주식';
      return items
        .sort((a, b) => (b.currentValue ?? 0) - (a.currentValue ?? 0))
        .map((a) => ({
          name: a.symbol || a.name || '이름 없음',
          size: a.currentValue ?? 0,
          category: label,
          fill: STOCK_PALETTE[colorIdx++ % STOCK_PALETTE.length]
        }));
    });
  }, [assets]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearMessage();
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
    } else if (form.category === 'car') {
      const thisYear = new Date().getFullYear();
      const carYear = Number(form.carYear || 0);
      if (!Number.isFinite(carYear) || carYear < 1980 || carYear > thisYear + 1) {
        nextErrors.carYear = '년식은 1980년부터 현재+1년 범위로 입력해주세요.';
      }
      if (Number(form.currentValue || 0) <= 0) {
        nextErrors.currentValue = '현재 중고시세는 0보다 커야 합니다.';
      }
    } else if (Number(form.currentValue || 0) < 0) {
      nextErrors.currentValue = '금액은 0 이상이어야 합니다.';
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setMessageText('입력값을 다시 확인해주세요.');
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
      carYear: form.category === 'car' ? Number(form.carYear) : null,
      pensionMonthlyContribution: null,
      pensionReceiveAge: null,
      pensionReceiveStart: null,
      owner: form.owner
    };

    const result = editingAssetId
      ? await api.updateAsset(editingAssetId, payload)
      : await api.createAsset(payload);

    if (result.error) {
      setErrorMessage(editingAssetId ? '수정 실패' : '저장 실패', result.error);
    } else {
      resetFormWithRate(form.exchangeRate);
      setEditingAssetId(null);
      setSuccessMessage(editingAssetId ? '자산이 수정되었습니다.' : '자산이 저장되었습니다.');
      await loadAssets();
    }

    setSaving(false);
  }

  async function onDelete(id: string) {
    const yes = await confirm('이 자산을 삭제하시겠습니까?', { title: '자산 삭제', confirmLabel: '삭제' });
    if (!yes) return;
    clearMessage();
    const result = await api.deleteAsset(id);
    if (result.error) {
      setErrorMessage('삭제 실패', result.error);
      return;
    }

    setAssets((prev) => prev.filter((asset) => asset.id !== id));
    setSuccessMessage('자산을 삭제했습니다.');
  }

  const formSectionRef = useRef<HTMLDivElement>(null);

  function onEdit(asset: Asset) {
    const quantity = Number(asset.quantity ?? 0);
    const acquiredValue = Number(asset.acquiredValue ?? 0);

    setEditingAssetId(asset.id);
    setErrors({});
    clearMessage();
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
      carYear: asset.carYear === null || asset.carYear === undefined ? '' : Number(asset.carYear),
      symbol: asset.symbol ?? '',
      usdAmount: Number(asset.usdAmount ?? 0),
      exchangeRate: Number(asset.exchangeRate ?? form.exchangeRate ?? 0),
      pensionMonthlyContribution: '',
      pensionReceiveAge: '',
      pensionReceiveStart: '',
      owner: asset.owner ?? '본인'
    });

    setTimeout(() => {
      formSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }

  function onCancelEdit() {
    setEditingAssetId(null);
    setErrors({});
    resetFormWithRate(form.exchangeRate);
  }

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="py-4">
      <h1>자산 관리</h1>
        <p className="helper-text mt-1.5">
          연금 관련 자산은 연금관리 메뉴에서 별도로 관리합니다.
        </p>

      <div className="form-grid mt-4">
        <SectionCard>
          <p className="helper-text">총 자산(연금 제외)</p>
          <h2 className="m-0">{totalAssetValue.toLocaleString()}원</h2>
        </SectionCard>
        <SectionCard>
          <p className="helper-text">주식 자산</p>
          <h2 className="m-0">{stockAssetValue.toLocaleString()}원</h2>
        </SectionCard>
      </div>

      <SectionCard className="mt-4" ref={formSectionRef}>
        <div className="mb-3">
          <p className="helper-text m-0">빠른 입력 템플릿</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {quickPresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset)}
                className="btn-danger-outline min-w-[100px]"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={onSubmit} className="form-grid">
          <FormField label="카테고리" fullWidth>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(categoryLabel) as AssetCategory[]).map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => changeCategory(category)}
                  className={`${form.category === category ? 'btn-primary' : 'btn-danger-outline'} min-w-[92px]`}
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
              placeholder={'예: CMA 통장'}
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
                  <FormField label={`환율(USD/KRW)${fxLoading ? ' - 조회중' : fxManualOverride ? '' : ' - 자동'}`} error={errors.exchangeRate}>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={form.exchangeRate}
                        readOnly={!fxManualOverride}
                        className={!fxManualOverride ? 'opacity-70' : ''}
                        onChange={(event) =>
                          setForm((prev) => ({
                            ...prev,
                            exchangeRate: event.target.value === '' ? '' : Number(event.target.value)
                          }))
                        }
                      />
                      <button
                        type="button"
                        className="btn-subtle shrink-0 whitespace-nowrap text-xs"
                        onClick={() => {
                          if (fxManualOverride) {
                            loadUsdKrwRate();
                          }
                          setFxManualOverride(!fxManualOverride);
                        }}
                      >
                        {fxManualOverride ? '자동' : '수동입력'}
                      </button>
                    </div>
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
            <>
              {form.category === 'car' ? (
                <FormField label="년식" error={errors.carYear}>
                  <input
                    type="number"
                    min={1980}
                    max={new Date().getFullYear() + 1}
                    value={form.carYear}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        carYear: event.target.value === '' ? '' : Number(event.target.value)
                      }))
                    }
                  />
                </FormField>
              ) : null}
              <FormField label={form.category === 'car' ? '현재 중고시세(원)' : '현재가치(원)'} error={errors.currentValue}>
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
            </>
          )}

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
                isStockCategory
                    ? '예: 분할매수 2차'
                    : '선택 입력'
              }
            />
          </FormField>

          <FormField label="소유자">
            <select
              value={form.owner}
              onChange={(event) => setForm((prev) => ({ ...prev, owner: event.target.value }))}
            >
              <option value="본인">본인</option>
              <option value="배우자">배우자</option>
              <option value="공동">공동</option>
            </select>
          </FormField>

          <div className="flex items-end gap-2">
            <button type="submit" disabled={saving} className="btn-primary w-[180px]">
              {saving ? '저장 중...' : editingAssetId ? '자산 수정' : '자산 추가'}
            </button>
            {editingAssetId ? (
              <button type="button" onClick={onCancelEdit} className="btn-danger-outline w-[120px]">
                취소
              </button>
            ) : null}
          </div>
        </form>
      </SectionCard>

      <FeedbackBanner feedback={feedback} />

      <SectionCard className="mt-4">
        <h3 className="mt-0">자산 분류 요약</h3>
        <DataTable
          rows={categorySummaryRows}
          rowKey={(row) => row.category}
          emptyMessage="요약할 자산이 없습니다."
          columns={[
            {
              key: 'label',
              header: '분류',
              render: (row) => (
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: row.color }}
                  />
                  <span>{row.label}</span>
                </div>
              )
            },
            {
              key: 'count',
              header: '건수',
              align: 'center',
              render: (row) => `${row.count}건`
            },
            {
              key: 'total',
              header: '총 평가금액',
              align: 'right',
              render: (row) => formatWon(row.total)
            },
            {
              key: 'ratio',
              header: '비중',
              align: 'right',
              render: (row) => `${(row.ratio * 100).toFixed(1)}%`
            }
          ]}
        />
      </SectionCard>

      <SectionCard className="mt-4">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="mt-0">자산 트리맵</h3>
          <div className="flex gap-1 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-0.5">
            <button
              type="button"
              className={treemapView === 'all' ? 'btn-primary px-3 py-1 text-xs' : 'btn-subtle px-3 py-1 text-xs'}
              onClick={() => setTreemapView('all')}
            >
              전체
            </button>
            <button
              type="button"
              className={treemapView === 'stock' ? 'btn-primary px-3 py-1 text-xs' : 'btn-subtle px-3 py-1 text-xs'}
              onClick={() => setTreemapView('stock')}
            >
              주식(미국/한국)
            </button>
          </div>
        </div>
        <p className="helper-text mt-1.5">
          {treemapView === 'all'
            ? '사각형 면적은 자산 금액 비중을 나타냅니다. 카테고리 내 개별 자산까지 한 번에 비교할 수 있습니다.'
            : '미국주식 / 국내주식의 종목별 비중을 비교합니다.'}
        </p>
        {(treemapView === 'all' ? treemapData : stockTreemapData).length === 0 ? (
          <p className="mt-3">{treemapView === 'all' ? '표시할 자산 데이터가 없습니다.' : '주식 자산이 없습니다.'}</p>
        ) : (
          <div className="mt-3 h-[360px] w-full overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-2 sm:h-[420px]">
            <ResponsiveContainer width="100%" height="100%">
              <Treemap
                data={treemapView === 'all' ? treemapData : stockTreemapData}
                dataKey="size"
                stroke="rgba(255,255,255,0.88)"
                aspectRatio={4 / 3}
                isAnimationActive
                animationDuration={500}
              >
                <Tooltip content={<AssetTreemapTooltip />} />
              </Treemap>
            </ResponsiveContainer>
          </div>
        )}
      </SectionCard>

      <SectionCard className="mt-4">
        <h3 className="mt-0">자산 상세 목록</h3>
        <DataTable
          rows={assets}
          rowKey={(asset) => asset.id}
          emptyMessage="등록된 자산이 없습니다."
          columns={[
            { key: 'name', header: '자산명', render: (asset) => asset.name },
            {
              key: 'category',
              header: '분류',
              render: (asset) => getAssetCategoryLabel(asset.category),
            },
            {
              key: 'meta',
              header: '상세',
              render: (asset) => {
                if (asset.category === 'stock_us') {
                  return `${asset.symbol || '-'} / ${asset.usdAmount?.toLocaleString() ?? 0} USD`;
                }
                if (asset.category === 'car') {
                  return asset.carYear ? `${asset.carYear}년식` : '-';
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
              key: 'owner',
              header: '소유자',
              align: 'center',
              render: (asset) => asset.owner ?? '본인',
            },
            {
              key: 'actions',
              header: '관리',
              align: 'center',
              render: (asset) => (
                <div className="flex justify-center gap-1.5">
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
      <ConfirmModal
        open={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        confirmLabel={confirmState.confirmLabel}
        variant="danger"
        onConfirm={onModalConfirm}
        onCancel={onModalCancel}
      />
    </div>
  );
}
