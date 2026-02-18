'use client';

import { FormEvent, Dispatch, SetStateAction, useState, useRef, useEffect } from 'react';
import { FormField } from '@/components/ui/FormField';
import { api } from '@/lib/api';
import { searchKrStocks, KrStock } from '@/lib/kr-stocks';

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

  const [priceFetching, setPriceFetching] = useState(false);
  const [priceInfo, setPriceInfo] = useState<string | null>(null);

  async function fetchCurrentPrice() {
    const symbol = form.symbol.trim();
    if (!symbol) return;
    const market = form.category === 'stock_us' ? 'US' : 'KR';
    setPriceFetching(true);
    setPriceInfo(null);
    try {
      const result = await api.getStockPrice(symbol, market);
      if (result.data) {
        const price = result.data.price;
        setForm((prev) => ({ ...prev, acquiredValue: price }));
        if (result.data.fxRate && form.category === 'stock_us') {
          setForm((prev) => ({ ...prev, exchangeRate: result.data!.fxRate! }));
        }
        setPriceInfo(`${symbol} 현재가: ${price.toLocaleString()}${market === 'KR' ? '원' : ' USD'}`);
      } else {
        setPriceInfo(`시세 조회 실패: ${result.error?.message ?? '알 수 없는 오류'}`);
      }
    } catch {
      setPriceInfo('시세 조회 중 오류가 발생했습니다.');
    } finally {
      setPriceFetching(false);
    }
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
          <FormField label={form.category === 'stock_kr' ? '종목명 또는 종목코드' : '종목코드(Ticker)'} error={errors.symbol} fullWidth>
            <StockSymbolInput
              category={form.category}
              symbol={form.symbol}
              name={form.name}
              onSelect={(code, name) => {
                setForm((prev) => ({ ...prev, symbol: code, name: name || prev.name }));
              }}
              onSymbolChange={(val) => setForm((prev) => ({ ...prev, symbol: val.toUpperCase() }))}
              priceFetching={priceFetching}
              onFetchPrice={fetchCurrentPrice}
              priceInfo={priceInfo}
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
            label={`${form.category === 'stock_us' ? '단가(USD)' : '단가(원)'} — 시세 조회 시 자동 입력`}
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

/* ─── Stock Symbol Input with Korean autocomplete ─── */

function StockSymbolInput({
  category,
  symbol,
  name: _formName,
  onSelect,
  onSymbolChange,
  priceFetching,
  onFetchPrice,
  priceInfo,
}: {
  category: string;
  symbol: string;
  name: string;
  onSelect: (code: string, name: string) => void;
  onSymbolChange: (val: string) => void;
  priceFetching: boolean;
  onFetchPrice: () => void;
  priceInfo: string | null;
}) {
  const [searchText, setSearchText] = useState('');
  const [suggestions, setSuggestions] = useState<KrStock[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close suggestions on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const isKr = category === 'stock_kr';

  function handleSearchChange(val: string) {
    setSearchText(val);
    if (isKr && val.trim().length > 0) {
      const results = searchKrStocks(val.trim());
      setSuggestions(results);
      setShowSuggestions(results.length > 0);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }

  function selectStock(stock: KrStock) {
    onSelect(stock.code, stock.name);
    setSearchText('');
    setSuggestions([]);
    setShowSuggestions(false);
  }

  return (
    <div ref={wrapperRef}>
      {isKr && (
        <div className="relative mb-2">
          <input
            value={searchText}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="한글 종목명 검색 (예: 삼성전자, SK하이닉스)"
            className="w-full"
          />
          {showSuggestions && (
            <ul
              className="absolute z-50 mt-1 max-h-[200px] w-full overflow-y-auto rounded-lg border border-[var(--line)] bg-[var(--surface)] shadow-lg"
            >
              {suggestions.map((s) => (
                <li key={s.code}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--surface-hover)] transition-colors"
                    onClick={() => selectStock(s)}
                  >
                    <span className="font-semibold">{s.name}</span>
                    <span className="helper-text">{s.code}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          value={symbol}
          onChange={(e) => onSymbolChange(e.target.value)}
          placeholder={isKr ? '종목코드 (예: 005930)' : '종목코드 (예: AAPL)'}
          className="flex-1 min-w-0"
        />
        <button
          type="button"
          className="btn-subtle shrink-0 whitespace-nowrap text-xs"
          disabled={priceFetching || !symbol.trim()}
          onClick={onFetchPrice}
        >
          {priceFetching ? '조회중...' : '시세 조회'}
        </button>
      </div>
      {priceInfo && (
        <p className="helper-text mt-1" style={{ color: priceInfo.includes('실패') || priceInfo.includes('오류') ? 'var(--accent-red)' : 'var(--accent-green)' }}>
          {priceInfo}
        </p>
      )}
    </div>
  );
}
