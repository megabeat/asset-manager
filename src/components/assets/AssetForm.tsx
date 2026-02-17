'use client';

import { FormEvent, Dispatch, SetStateAction } from 'react';
import { FormField } from '@/components/ui/FormField';

type AssetCategory = 'cash' | 'deposit' | 'stock_kr' | 'stock_us' | 'car' | 'real_estate' | 'etc';
type NumericInput = number | '';

export type AssetFormData = {
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
  values: Partial<AssetFormData>;
};

export const defaultAssetForm: AssetFormData = {
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

export const categoryLabel: Record<AssetCategory, string> = {
  cash: '현금',
  deposit: '예금',
  stock_kr: '국내주식',
  stock_us: '미국주식',
  car: '자동차',
  real_estate: '부동산',
  etc: '기타'
};

export const quickPresets: QuickPreset[] = [
  { id: 'cash-wallet', label: '현금-지갑', category: 'cash', values: { name: '생활비 현금' } },
  { id: 'deposit-cma', label: '예금-CMA', category: 'deposit', values: { name: 'CMA 통장' } },
  { id: 'stock-kr', label: '국내주식', category: 'stock_kr', values: { name: '국내주식', symbol: '005930', quantity: 1 } },
  { id: 'stock-us', label: '미국주식', category: 'stock_us', values: { name: '미국주식', symbol: 'AAPL', quantity: 1 } },
  { id: 'car-auto', label: '자동차', category: 'car', values: { name: '자동차', carYear: new Date().getFullYear() - 3 } },
  { id: 'real-estate', label: '부동산', category: 'real_estate', values: { name: '아파트' } },
];

interface AssetFormProps {
  form: AssetFormData;
  setForm: Dispatch<SetStateAction<AssetFormData>>;
  errors: Record<string, string>;
  setErrors: Dispatch<SetStateAction<Record<string, string>>>;
  saving: boolean;
  editingAssetId: string | null;
  setEditingAssetId: Dispatch<SetStateAction<string | null>>;
  fxLoading: boolean;
  fxManualOverride: boolean;
  setFxManualOverride: Dispatch<SetStateAction<boolean>>;
  effectiveUsdAmount: number;
  effectiveCurrentValue: number | '';
  isStockCategory: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancelEdit: () => void;
  loadUsdKrwRate: () => Promise<void>;
  clearMessage: () => void;
}

export function AssetForm({
  form,
  setForm,
  errors,
  setErrors,
  saving,
  editingAssetId,
  setEditingAssetId,
  fxLoading,
  fxManualOverride,
  setFxManualOverride,
  effectiveUsdAmount,
  effectiveCurrentValue,
  isStockCategory,
  onSubmit,
  onCancelEdit,
  loadUsdKrwRate,
  clearMessage,
}: AssetFormProps) {
  function applyPreset(preset: QuickPreset) {
    const preservedRate = form.exchangeRate;
    setEditingAssetId(null);
    setErrors({});
    clearMessage();
    setForm({
      ...defaultAssetForm,
      exchangeRate: preservedRate,
      valuationDate: new Date().toISOString().slice(0, 10),
      category: preset.category,
      ...preset.values
    });
  }

  function changeCategory(category: AssetCategory) {
    const preservedRate = form.exchangeRate;
    setForm((prev) => ({
      ...defaultAssetForm,
      exchangeRate: preservedRate,
      valuationDate: prev.valuationDate,
      category,
      name: prev.category === category ? prev.name : ''
    }));
    setErrors({});
  }

  return (
    <form onSubmit={onSubmit} className="form-grid">
      <FormField label="카테고리" fullWidth>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(categoryLabel) as AssetCategory[]).map((cat) => {
            const preset = quickPresets.find((p) => p.category === cat);
            return (
              <button
                key={cat}
                type="button"
                onClick={() => preset ? applyPreset(preset) : changeCategory(cat)}
                className={`${form.category === cat ? 'btn-primary' : 'btn-danger-outline'} min-w-[92px]`}
              >
                {categoryLabel[cat]}
              </button>
            );
          })}
        </div>
      </FormField>

      <FormField label="자산명" error={errors.name}>
        <input
          value={form.name}
          onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          placeholder="예: CMA 통장"
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
          placeholder={isStockCategory ? '예: 분할매수 2차' : '선택 입력'}
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
  );
}
