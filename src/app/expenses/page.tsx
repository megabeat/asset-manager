'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, Expense } from '@/lib/api';
import { FeedbackBanner } from '@/components/ui/FeedbackBanner';
import { getAssetCategoryLabel } from '@/lib/assetCategory';
import { SectionCard } from '@/components/ui/SectionCard';
import { FormField } from '@/components/ui/FormField';
import { DataTable } from '@/components/ui/DataTable';
import { useFeedbackMessage } from '@/hooks/useFeedbackMessage';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

type NumericInput = number | '';

type ExpenseForm = {
  name: string;
  amount: NumericInput;
  type: 'fixed' | 'subscription' | 'one_time';
  cycle: 'monthly' | 'yearly' | 'one_time';
  billingDay: NumericInput;
  occurredAt: string;
  reflectToLiquidAsset: boolean;
  isInvestmentTransfer: boolean;
  investmentTargetCategory: string;
  isCardIncluded: boolean;
  category: string;
};

const defaultForm: ExpenseForm = {
  name: '',
  amount: '',
  type: 'fixed',
  cycle: 'monthly',
  billingDay: new Date().getDate(),
  occurredAt: new Date().toISOString().slice(0, 10),
  reflectToLiquidAsset: false,
  isInvestmentTransfer: false,
  investmentTargetCategory: 'stock_kr',
  isCardIncluded: false,
  category: ''
};

const INVESTMENT_TARGET_OPTIONS = [
  { value: 'stock_kr', label: '국내주식' },
  { value: 'pension_personal', label: '개인연금' },
  { value: 'etc', label: '기타' },
  { value: 'stock_us', label: '미국주식' },
  { value: 'deposit', label: '예금' },
  { value: 'cash', label: '현금' },
  { value: 'pension_retirement', label: '퇴직연금' }
] as const;

function getCurrentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getOccurredAtByBillingDay(day: number): string {
  const safeDay = Math.min(31, Math.max(1, Math.trunc(day)));
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const resolvedDay = Math.min(safeDay, lastDay);

  const date = new Date(year, month, resolvedDay);
  return date.toISOString().slice(0, 10);
}

const CARD_ISSUERS = ['신한', '삼성', '현대'] as const;
type CardIssuer = (typeof CARD_ISSUERS)[number];

  type CardQuickForm = {
    cardName: CardIssuer;
    amount: NumericInput;
    occurredAt: string;
  };

  const defaultCardQuickForm: CardQuickForm = {
    cardName: '신한',
    amount: '',
    occurredAt: new Date().toISOString().slice(0, 10),
  };

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settling, setSettling] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  const [isMonthSettled, setIsMonthSettled] = useState(false);
  const [settlementMonth, setSettlementMonth] = useState(getCurrentMonthKey());
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [entryMode, setEntryMode] = useState<'card' | 'general' | 'investment'>('card');
  const [form, setForm] = useState<ExpenseForm>(defaultForm);
  const [cardQuickForm, setCardQuickForm] = useState<CardQuickForm>(defaultCardQuickForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { message, feedback, clearMessage, setMessageText, setSuccessMessage, setErrorMessage } = useFeedbackMessage();

  async function loadExpenses() {
    const result = await api.getExpenses();
    if (result.data) {
      setExpenses(result.data);
    }
    if (result.error) {
      setErrorMessage('조회 실패', result.error);
    }
  }

  async function checkSettledStatus(month: string) {
    const result = await api.checkExpenseSettled(month);
    setIsMonthSettled(result.data?.settled ?? false);
  }

  useEffect(() => {
    loadExpenses().finally(() => {
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (/^\d{4}-\d{2}$/.test(settlementMonth)) {
      checkSettledStatus(settlementMonth);
    }
  }, [settlementMonth, expenses]);

  const totalMonthly = useMemo(() => {
    return expenses.reduce((sum, item) => {
      if (item.isInvestmentTransfer) {
        return sum;
      }
      if (item.cycle === 'yearly') {
        return sum + item.amount / 12;
      }
      if (item.cycle === 'one_time') {
        return sum;
      }
      return sum + item.amount;
    }, 0);
  }, [expenses]);

  const monthlySpendSummary = useMemo(() => {
    const inMonth = (expense: Expense) => String(expense.occurredAt ?? '').slice(0, 7) === settlementMonth;
    const monthlyRows = expenses.filter(inMonth);

    const cardAmount = monthlyRows
      .filter((expense) => (expense.category ?? '').includes('카드대금') && !expense.isInvestmentTransfer)
      .reduce((sum, expense) => sum + Number(expense.amount ?? 0), 0);

    const autoRecurringAmount = monthlyRows
      .filter((expense) => expense.entrySource === 'auto_settlement' && !expense.isInvestmentTransfer)
      .reduce((sum, expense) => sum + Number(expense.amount ?? 0), 0);

    const manualAmount = monthlyRows
      .filter(
        (expense) =>
          expense.entrySource !== 'auto_settlement' &&
          !(expense.category ?? '').includes('카드대금') &&
          !expense.isInvestmentTransfer
      )
      .reduce((sum, expense) => sum + Number(expense.amount ?? 0), 0);

    const investmentTransferAmount = monthlyRows
      .filter((expense) => expense.isInvestmentTransfer)
      .reduce((sum, expense) => sum + Number(expense.amount ?? 0), 0);

    return {
      cardAmount,
      autoRecurringAmount,
      manualAmount,
      investmentTransferAmount,
      totalAmount: cardAmount + autoRecurringAmount + manualAmount
    };
  }, [expenses, settlementMonth]);

  const previousCardAmount = useMemo(() => {
    const normalizedName = cardQuickForm.cardName.trim().toLowerCase();
    const cardRows = expenses
      .filter((item) => {
        const name = item.name?.toLowerCase() ?? '';
        const isCardCategory = (item.category ?? '').includes('카드');
        if (!isCardCategory) return false;
        if (!normalizedName) return true;
        return name.includes(normalizedName);
      })
      .sort((a, b) => String(b.occurredAt ?? '').localeCompare(String(a.occurredAt ?? '')));

    return cardRows[0]?.amount ?? 0;
  }, [expenses, cardQuickForm.cardName]);

  const recentThreeMonthTransferAverage = useMemo(() => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() - 2, 1);

    const totalAmount = expenses
      .filter(
        (expense) =>
          expense.isInvestmentTransfer &&
          (expense.cycle === 'one_time' || expense.expenseType === 'one_time')
      )
      .reduce((sum, expense) => {
        const occurredAt = expense.occurredAt ? new Date(expense.occurredAt) : null;
        if (!occurredAt || Number.isNaN(occurredAt.getTime()) || occurredAt < from) {
          return sum;
        }
        return sum + Number(expense.amount ?? 0);
      }, 0);

    return totalAmount / 3;
  }, [expenses]);

  const cardIssuerMonthlyStats = useMemo(() => {
    const cardExpenses = expenses.filter((item) => {
      const category = item.category ?? '';
      const name = item.name ?? '';
      return category.includes('카드') || name.includes('카드대금');
    });

    const monthSet = new Set<string>();
    const amountByIssuerMonth = new Map<string, number>();

    for (const expense of cardExpenses) {
      const occurredAt = String(expense.occurredAt ?? '').slice(0, 7);
      if (!occurredAt || occurredAt.length < 7) {
        continue;
      }

      const issuer = CARD_ISSUERS.find((cardIssuer) => (expense.name ?? '').includes(cardIssuer));
      if (!issuer) {
        continue;
      }

      monthSet.add(occurredAt);
      const key = `${issuer}|${occurredAt}`;
      amountByIssuerMonth.set(key, (amountByIssuerMonth.get(key) ?? 0) + Number(expense.amount ?? 0));
    }

    const months = Array.from(monthSet.values()).sort((a, b) => a.localeCompare(b));
    const currentMonth = months.length > 0 ? months[months.length - 1] : null;
    const previousMonth = months.length > 1 ? months[months.length - 2] : null;

    const rows = CARD_ISSUERS.map((issuer) => {
      const currentAmount = currentMonth ? amountByIssuerMonth.get(`${issuer}|${currentMonth}`) ?? 0 : 0;
      const previousAmount = previousMonth ? amountByIssuerMonth.get(`${issuer}|${previousMonth}`) ?? 0 : 0;
      return {
        issuer,
        currentAmount,
        previousAmount,
        delta: currentAmount - previousAmount,
      };
    });

    return { rows, currentMonth, previousMonth };
  }, [expenses]);

  const recurringExpenses = useMemo(() => {
    return expenses.filter((expense) => expense.cycle !== 'one_time' && expense.expenseType !== 'one_time');
  }, [expenses]);

  const oneTimeExpenses = useMemo(() => {
    return expenses.filter((expense) => expense.cycle === 'one_time' || expense.expenseType === 'one_time');
  }, [expenses]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearMessage();
    const nextErrors: Record<string, string> = {};
    const amountValue = Number(form.amount || 0);

    if (!form.name.trim()) nextErrors.name = '항목명을 입력해주세요.';
    if (!Number.isFinite(amountValue) || amountValue < 0) {
      nextErrors.amount = '금액은 0 이상이어야 합니다.';
    }

    if (entryMode === 'investment' || form.type === 'subscription' || form.type === 'fixed') {
      const dayValue = Number(form.billingDay || 0);
      if (!Number.isFinite(dayValue) || dayValue < 1 || dayValue > 31) {
        nextErrors.billingDay = '결제일은 1~31 사이여야 합니다.';
      }
    }

    if ((entryMode === 'investment' || form.isInvestmentTransfer) && !form.investmentTargetCategory) {
      nextErrors.investmentTargetCategory = '투자 대상 자산을 선택해주세요.';
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      setMessageText('항목명과 금액을 확인해주세요.');
      return;
    }

    const normalizedType = entryMode === 'investment' ? 'fixed' : form.type;
    const normalizedCycle = entryMode === 'investment' ? 'monthly' : form.cycle;
    const normalizedIsInvestmentTransfer = entryMode === 'investment' ? true : form.isInvestmentTransfer;
    const normalizedReflectToLiquidAsset = entryMode === 'investment' ? true : form.reflectToLiquidAsset;

    const resolvedOccurredAt =
      entryMode === 'investment' || form.type === 'subscription' || form.type === 'fixed'
        ? getOccurredAtByBillingDay(Number(form.billingDay || 1))
        : form.occurredAt;

    setSaving(true);
    const payload = {
      name: form.name.trim(),
      amount: amountValue,
      type: normalizedType,
      cycle: normalizedCycle,
      billingDay:
        entryMode === 'investment' || form.type === 'subscription' || form.type === 'fixed'
          ? Number(form.billingDay || 1)
          : null,
      occurredAt: resolvedOccurredAt,
      reflectToLiquidAsset: normalizedReflectToLiquidAsset,
      isInvestmentTransfer: normalizedIsInvestmentTransfer,
      investmentTargetCategory: normalizedIsInvestmentTransfer ? form.investmentTargetCategory : '',
      isCardIncluded:
        entryMode === 'investment'
          ? false
          : form.type === 'subscription' || form.type === 'fixed'
            ? form.isCardIncluded
            : false,
      category: form.category.trim()
    };

    const result = editingExpenseId
      ? await api.updateExpense(editingExpenseId, payload)
      : await api.createExpense(payload);

    if (result.error) {
      setErrorMessage(editingExpenseId ? '수정 실패' : '저장 실패', result.error);
    } else {
      setForm(defaultForm);
      setEditingExpenseId(null);
      setSuccessMessage(editingExpenseId ? '지출이 수정되었습니다.' : '지출이 저장되었습니다.');
      await loadExpenses();
    }

    setSaving(false);
  }

  async function onSubmitCardQuick() {
    clearMessage();
    if (!cardQuickForm.cardName.trim()) {
      setMessageText('카드명을 입력해주세요.');
      return;
    }
    const cardAmountValue = Number(cardQuickForm.amount || 0);
    if (!Number.isFinite(cardAmountValue) || cardAmountValue <= 0) {
      setMessageText('카드대금은 0보다 커야 합니다.');
      return;
    }

    setSaving(true);
    const result = await api.createExpense({
      name: `${cardQuickForm.cardName.trim()} 카드대금`,
      amount: cardAmountValue,
      type: 'one_time',
      cycle: 'one_time',
      billingDay: null,
      occurredAt: cardQuickForm.occurredAt,
      reflectToLiquidAsset: true,
      isInvestmentTransfer: false,
      isCardIncluded: false,
      category: '카드대금'
    });

    if (result.error) {
      setErrorMessage('카드대금 저장 실패', result.error);
    } else {
      setCardQuickForm(defaultCardQuickForm);
      setSuccessMessage('카드대금이 반영되었습니다. (현금성 자산 차감)');
      await loadExpenses();
    }
    setSaving(false);
  }

  async function onDelete(id: string) {
    if (!confirm('이 지출 항목을 삭제하시겠습니까?')) return;
    const result = await api.deleteExpense(id);
    if (result.error) {
      setErrorMessage('삭제 실패', result.error);
      return;
    }
    setExpenses((prev) => prev.filter((item) => item.id !== id));
  }

  async function onSettleMonth() {
    clearMessage();
    if (!/^\d{4}-\d{2}$/.test(settlementMonth)) {
      setMessageText('정산월 형식이 올바르지 않습니다. (YYYY-MM)');
      return;
    }

    if (isMonthSettled) {
      setMessageText('이미 정산이 완료된 월입니다. 재정산하려면 먼저 정산 취소를 해주세요.');
      return;
    }

    setSettling(true);
    const result = await api.settleExpenseMonth(settlementMonth);

    if (result.error) {
      setErrorMessage('월마감 자동 반영 실패', result.error);
      setSettling(false);
      return;
    }

    const summary = result.data;
    setSuccessMessage(
      `${summary?.targetMonth ?? settlementMonth} 자동반영 완료: 생성 ${summary?.createdCount ?? 0}건, 중복건너뜀 ${summary?.skippedCount ?? 0}건, 총 ${Math.round(summary?.totalSettledAmount ?? 0).toLocaleString()}원`
    );
    await loadExpenses();
    setSettling(false);
  }

  async function onRollbackMonth() {
    clearMessage();
    if (!/^\d{4}-\d{2}$/.test(settlementMonth)) {
      setMessageText('정산월 형식이 올바르지 않습니다. (YYYY-MM)');
      return;
    }

    if (!confirm(`${settlementMonth} 정산을 취소하시겠습니까?\n자동 생성된 지출 내역이 삭제되고 자산이 복원됩니다.`)) {
      return;
    }

    setRollingBack(true);
    const result = await api.rollbackExpenseMonth(settlementMonth);

    if (result.error) {
      setErrorMessage('정산 취소 실패', result.error);
      setRollingBack(false);
      return;
    }

    const summary = result.data;
    setSuccessMessage(
      `${summary?.targetMonth ?? settlementMonth} 정산 취소 완료: 삭제 ${summary?.deletedCount ?? 0}건, 복원금액 ${Math.round(summary?.reversedAmount ?? 0).toLocaleString()}원`
    );
    await loadExpenses();
    setRollingBack(false);
  }

  function onEdit(expense: Expense) {
    setEntryMode(expense.isInvestmentTransfer ? 'investment' : 'general');
    setEditingExpenseId(expense.id);
    setErrors({});
    clearMessage();
    setForm({
      name: expense.name ?? '',
      amount: Number(expense.amount ?? 0),
      type: (expense.expenseType as 'fixed' | 'subscription' | 'one_time') ?? 'fixed',
      cycle: (expense.cycle as 'monthly' | 'yearly' | 'one_time') ?? 'monthly',
      billingDay:
        expense.billingDay && expense.billingDay >= 1 && expense.billingDay <= 31
          ? expense.billingDay
          : expense.occurredAt
            ? new Date(expense.occurredAt).getDate()
            : new Date().getDate(),
      occurredAt: expense.occurredAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
      reflectToLiquidAsset: Boolean(expense.reflectToLiquidAsset),
      isInvestmentTransfer: Boolean(expense.isInvestmentTransfer),
      investmentTargetCategory: expense.investmentTargetCategory ?? 'stock_kr',
      isCardIncluded: Boolean(expense.isCardIncluded),
      category: expense.category ?? ''
    });
  }

  function onCancelEdit() {
    setEditingExpenseId(null);
    setErrors({});
    setForm(defaultForm);
  }

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="py-4">
      <h1>지출 관리</h1>

      <SectionCard className="mt-5 max-w-[980px]">
        <h3 className="mb-3 mt-0">월마감 정산</h3>
        <div className="form-grid [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
          <FormField label="정산월">
            <input
              type="month"
              value={settlementMonth}
              onChange={(event) => setSettlementMonth(event.target.value)}
            />
          </FormField>
          <div className="flex items-end gap-2">
            <button
              type="button"
              className="btn-primary w-[180px]"
              onClick={onSettleMonth}
              disabled={settling || isMonthSettled}
            >
              {settling ? '월마감 반영 중...' : isMonthSettled ? '정산 완료됨' : '월마감 실행'}
            </button>
            {isMonthSettled && (
              <button
                type="button"
                className="btn-danger-outline w-[180px]"
                onClick={onRollbackMonth}
                disabled={rollingBack}
              >
                {rollingBack ? '취소 중...' : '정산 취소'}
              </button>
            )}
          </div>
          <FormField label="안내" fullWidth>
            <input
              value={isMonthSettled
                ? `${settlementMonth} 정산이 이미 완료되었습니다. 재정산하려면 정산 취소 후 다시 실행하세요.`
                : "비카드 정기지출과 투자이체 템플릿이 결제일 기준으로 월마감 자동 반영됩니다."}
              readOnly
            />
          </FormField>
        </div>
      </SectionCard>

      <SectionCard className="mt-4 max-w-[980px]">
        <h3 className="mb-3 mt-0">{settlementMonth} 소비 요약</h3>
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
          <div className="rounded-xl border border-[var(--line)] p-3">
            <p className="helper-text m-0">카드대금</p>
            <p className="m-0 mt-1 text-[1.1rem] font-bold">{Math.round(monthlySpendSummary.cardAmount).toLocaleString()}원</p>
          </div>
          <div className="rounded-xl border border-[var(--line)] p-3">
            <p className="helper-text m-0">자동반영(비카드 정기)</p>
            <p className="m-0 mt-1 text-[1.1rem] font-bold">{Math.round(monthlySpendSummary.autoRecurringAmount).toLocaleString()}원</p>
          </div>
          <div className="rounded-xl border border-[var(--line)] p-3">
            <p className="helper-text m-0">수동등록(일회성/현금 등)</p>
            <p className="m-0 mt-1 text-[1.1rem] font-bold">{Math.round(monthlySpendSummary.manualAmount).toLocaleString()}원</p>
          </div>
          <div className="rounded-xl border border-[var(--line)] p-3">
            <p className="helper-text m-0">월 총소비</p>
            <p className="m-0 mt-1 text-[1.1rem] font-bold">{Math.round(monthlySpendSummary.totalAmount).toLocaleString()}원</p>
          </div>
          <div className="rounded-xl border border-[var(--line)] p-3">
            <p className="helper-text m-0">투자이체</p>
            <p className="m-0 mt-1 text-[1.1rem] font-bold">{Math.round(monthlySpendSummary.investmentTransferAmount).toLocaleString()}원</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard className="mt-5 max-w-[980px]">
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            type="button"
            className={entryMode === 'card' ? 'btn-primary' : 'btn-danger-outline'}
            onClick={() => setEntryMode('card')}
          >
            카드값 간편입력
          </button>
          <button
            type="button"
            className={entryMode === 'general' ? 'btn-primary' : 'btn-danger-outline'}
            onClick={() => setEntryMode('general')}
          >
            일반 지출 입력
          </button>
          <button
            type="button"
            className={entryMode === 'investment' ? 'btn-primary' : 'btn-danger-outline'}
            onClick={() => {
              setEntryMode('investment');
              setForm((prev) => ({
                ...prev,
                type: 'fixed',
                cycle: 'monthly',
                reflectToLiquidAsset: true,
                isInvestmentTransfer: true,
                isCardIncluded: false,
                category: prev.category || '투자이체'
              }));
            }}
          >
            투자·저축 이체
          </button>
        </div>

        {entryMode === 'general' || entryMode === 'investment' ? (
          <form onSubmit={onSubmit} className="form-grid">
          <FormField label="항목명" error={errors.name}>
            <input
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              className={errors.name ? 'border-red-700' : ''}
            />
          </FormField>

          <FormField label="금액(원)" error={errors.amount}>
            <input
              type="number"
              min={0}
              value={form.amount}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  amount: event.target.value === '' ? '' : Number(event.target.value)
                }))
              }
              className={errors.amount ? 'border-red-700' : ''}
            />
            {entryMode === 'investment' ? (
              <p className="helper-text m-0 mt-1">
                최근 3개월 평균 이체액: {Math.round(recentThreeMonthTransferAverage).toLocaleString()}원
              </p>
            ) : null}
          </FormField>

          {entryMode === 'general' ? (
            <>
              <FormField label="유형">
                <select
                  value={form.type}
                  onChange={(event) => {
                    const nextType = event.target.value as 'fixed' | 'subscription' | 'one_time';
                    setForm((prev) => ({
                      ...prev,
                      type: nextType,
                      cycle: nextType === 'one_time' ? 'one_time' : 'monthly',
                      reflectToLiquidAsset: nextType === 'one_time' ? true : prev.reflectToLiquidAsset,
                      isCardIncluded: nextType === 'one_time' ? false : prev.isCardIncluded,
                      isInvestmentTransfer: false,
                    }));
                  }}
                >
                  <option value="fixed">고정지출</option>
                  <option value="subscription">구독지출</option>
                  <option value="one_time">일회성</option>
                </select>
              </FormField>

              <FormField label="주기">
                <select
                  value={form.cycle}
                  onChange={(event) => setForm((prev) => ({ ...prev, cycle: event.target.value as 'monthly' | 'yearly' | 'one_time' }))}
                  disabled={form.type === 'subscription' || form.type === 'fixed'}
                >
                  <option value="monthly">월간</option>
                  <option value="yearly">연간</option>
                  <option value="one_time">일회성</option>
                </select>
              </FormField>
            </>
          ) : (
            <>
              <FormField label="유형">
                <input value="투자/저축 이체" readOnly />
              </FormField>
              <FormField label="주기">
                <input value="월간 고정" readOnly />
              </FormField>
            </>
          )}

          {entryMode === 'investment' || form.type === 'subscription' || form.type === 'fixed' ? (
            <FormField label="매월 결제일" error={errors.billingDay}>
              <input
                type="number"
                min={1}
                max={31}
                value={form.billingDay}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    billingDay: event.target.value === '' ? '' : Number(event.target.value)
                  }))
                }
                className={errors.billingDay ? 'border-red-700' : ''}
              />
            </FormField>
          ) : (
            <FormField label="출금(발생)일">
              <input
                type="date"
                value={form.occurredAt}
                onChange={(event) => setForm((prev) => ({ ...prev, occurredAt: event.target.value }))}
              />
            </FormField>
          )}

          <FormField label="현금성 자산 차감" fullWidth>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.reflectToLiquidAsset}
                disabled={entryMode === 'investment'}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, reflectToLiquidAsset: event.target.checked }))
                }
              />
              <span>입력 시 입출금 통장/현금 자산에서 금액 차감</span>
            </label>
          </FormField>

          {entryMode === 'general' ? (
            <FormField label="투자이체 여부" fullWidth>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.isInvestmentTransfer}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, isInvestmentTransfer: event.target.checked }))
                  }
                />
                <span>소비지출이 아닌 투자/저축 이체로 분류 (소비 합계에서 제외)</span>
              </label>
            </FormField>
          ) : (
            <FormField label="투자이체" fullWidth>
              <input value="투자/저축 이체로 저장되며 월마감 자동반영 대상입니다." readOnly />
            </FormField>
          )}

          {(entryMode === 'investment' || form.isInvestmentTransfer) ? (
            <FormField label="투자 대상 자산" error={errors.investmentTargetCategory}>
              <select
                value={form.investmentTargetCategory}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, investmentTargetCategory: event.target.value }))
                }
                className={errors.investmentTargetCategory ? 'border-red-700' : ''}
              >
                {INVESTMENT_TARGET_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </FormField>
          ) : null}

          {(entryMode === 'general' && (form.type === 'subscription' || form.type === 'fixed')) ? (
            <FormField label="카드 포함 여부" fullWidth>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.isCardIncluded}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, isCardIncluded: event.target.checked }))
                  }
                />
                <span>이 정기지출은 카드대금에 포함됨 (월마감 자동반영 제외)</span>
              </label>
            </FormField>
          ) : null}

          <FormField label="카테고리">
            <input
              value={form.category}
              onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
              placeholder="예: 통신비"
            />
          </FormField>

          <button
            type="submit"
            disabled={saving}
            className="btn-primary w-[160px] self-end"
          >
            {saving ? '저장 중...' : editingExpenseId ? '지출 수정' : '지출 추가'}
          </button>
          {editingExpenseId ? (
            <button
              type="button"
              className="btn-danger-outline w-[120px] self-end"
              onClick={onCancelEdit}
            >
              취소
            </button>
          ) : null}
          </form>
        ) : (
          <div className="form-grid">
            <FormField label="카드사">
              <select
                value={cardQuickForm.cardName}
                onChange={(event) =>
                  setCardQuickForm((prev) => ({ ...prev, cardName: event.target.value as CardIssuer }))
                }
              >
                {CARD_ISSUERS.map((issuer) => (
                  <option key={issuer} value={issuer}>{issuer}</option>
                ))}
              </select>
            </FormField>
            <FormField label="청구금액(원)">
              <input
                type="number"
                min={0}
                value={cardQuickForm.amount}
                onChange={(event) =>
                  setCardQuickForm((prev) => ({
                    ...prev,
                    amount: event.target.value === '' ? '' : Number(event.target.value)
                  }))
                }
              />
            </FormField>
            <FormField label="출금일">
              <input
                type="date"
                value={cardQuickForm.occurredAt}
                onChange={(event) => setCardQuickForm((prev) => ({ ...prev, occurredAt: event.target.value }))}
              />
            </FormField>
            <button type="button" className="btn-primary w-[180px] self-end" onClick={onSubmitCardQuick} disabled={saving}>
              {saving ? '반영 중...' : '카드대금 반영'}
            </button>
            <FormField label="안내" fullWidth>
              <input value="유형/주기/카테고리는 자동 설정되고, 현금성 자산에서 즉시 차감됩니다." readOnly />
            </FormField>
          </div>
        )}
      </SectionCard>

      <SectionCard className="mt-4 max-w-[980px]">
        <p className="helper-text mb-0">
          최근 카드대금 참고: {Math.round(previousCardAmount).toLocaleString()}원
        </p>
      </SectionCard>

      <SectionCard className="mt-4 max-w-[980px]">
        <h3 className="mb-3 mt-0">카드사별 월간 비교</h3>
        <table className="ui-table">
          <thead>
            <tr className="ui-table-head-row">
              <th className="ui-table-th text-left">카드사</th>
              <th className="ui-table-th text-right">
                {cardIssuerMonthlyStats.currentMonth ?? '이번달'}
              </th>
              <th className="ui-table-th text-right">
                {cardIssuerMonthlyStats.previousMonth ?? '전월'}
              </th>
              <th className="ui-table-th text-right">증감</th>
            </tr>
          </thead>
          <tbody>
            {cardIssuerMonthlyStats.rows.map((row, rowIndex) => (
              <tr key={row.issuer} className={rowIndex % 2 === 0 ? 'ui-table-row-even' : 'ui-table-row-odd'}>
                <td className="ui-table-td text-left">{row.issuer}</td>
                <td className="ui-table-td text-right">{Math.round(row.currentAmount).toLocaleString()}원</td>
                <td className="ui-table-td text-right">{Math.round(row.previousAmount).toLocaleString()}원</td>
                <td className={`ui-table-td text-right ${row.delta >= 0 ? 'ui-delta-negative' : 'ui-delta-positive'}`}>
                  {row.delta >= 0 ? '+' : ''}{Math.round(row.delta).toLocaleString()}원
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>

      <p className="mt-3 font-semibold">
        월 환산 생활지출 합계: {Math.round(totalMonthly).toLocaleString()}원
      </p>

      <FeedbackBanner feedback={feedback} />

      <SectionCard className="mt-4 max-w-[980px]">
        <h3 className="mb-3 mt-0">정기 지출 (고정/구독 생활비)</h3>
        <DataTable
          rows={recurringExpenses}
          rowKey={(expense) => expense.id}
          emptyMessage="등록된 정기 지출이 없습니다."
          columns={[
            { key: 'name', header: '항목명', render: (expense) => expense.name },
            { key: 'type', header: '유형', render: (expense) => expense.expenseTypeLabel ?? expense.expenseType },
            {
              key: 'flowType',
              header: '흐름',
              align: 'center',
              render: (expense) => (expense.isInvestmentTransfer ? '투자이체' : '소비'),
            },
            {
              key: 'target',
              header: '투자대상',
              align: 'center',
              render: (expense) =>
                expense.isInvestmentTransfer
                  ? getAssetCategoryLabel(expense.investmentTargetCategory)
                  : '-',
            },
            { key: 'cycle', header: '주기', render: (expense) => expense.cycleLabel ?? expense.cycle },
            {
              key: 'cardIncluded',
              header: '카드포함',
              align: 'center',
              render: (expense) => (expense.isCardIncluded ? '예' : '아니오'),
            },
            {
              key: 'billingDay',
              header: '결제일',
              align: 'center',
              render: (expense) =>
                expense.expenseType !== 'one_time' && expense.billingDay
                  ? `매월 ${expense.billingDay}일`
                  : '-',
            },
            {
              key: 'amount',
              header: '금액',
              align: 'right',
              render: (expense) => `${expense.amount.toLocaleString()}원`,
            },
            {
              key: 'reflect',
              header: '자산차감',
              align: 'right',
              render: (expense) =>
                expense.reflectToLiquidAsset && (expense.reflectedAmount ?? 0) > 0
                  ? `-${Math.round(expense.reflectedAmount ?? 0).toLocaleString()}원`
                  : '-',
            },
            {
              key: 'actions',
              header: '관리',
              align: 'center',
              render: (expense) => (
                <div className="flex justify-center gap-1.5">
                  <button className="btn-primary" onClick={() => onEdit(expense)}>
                    수정
                  </button>
                  <button className="btn-danger-outline" onClick={() => onDelete(expense.id)}>
                    삭제
                  </button>
                </div>
              ),
            },
          ]}
        />
      </SectionCard>

      <SectionCard className="mt-4 max-w-[980px]">
        <h3 className="mb-3 mt-0">실제 지출 (고정지출 + 한시성 지출)</h3>
        <DataTable
          rows={oneTimeExpenses}
          rowKey={(expense) => expense.id}
          emptyMessage="등록된 실제 지출이 없습니다."
          columns={[
            { key: 'name', header: '항목명', render: (expense) => expense.name },
            { key: 'type', header: '유형', render: (expense) => expense.expenseTypeLabel ?? expense.expenseType },
            {
              key: 'flowType',
              header: '흐름',
              align: 'center',
              render: (expense) => (expense.isInvestmentTransfer ? '투자이체' : '소비'),
            },
            {
              key: 'target',
              header: '투자대상',
              align: 'center',
              render: (expense) =>
                expense.isInvestmentTransfer
                  ? getAssetCategoryLabel(expense.investmentTargetCategory)
                  : '-',
            },
            {
              key: 'entrySource',
              header: '생성방식',
              align: 'center',
              render: (expense) => (expense.entrySource === 'auto_settlement' ? '자동' : '수동'),
            },
            { key: 'cycle', header: '주기', render: (expense) => expense.cycleLabel ?? expense.cycle },
            {
              key: 'amount',
              header: '금액',
              align: 'right',
              render: (expense) => `${expense.amount.toLocaleString()}원`,
            },
            {
              key: 'reflect',
              header: '자산차감',
              align: 'right',
              render: (expense) =>
                expense.reflectToLiquidAsset && (expense.reflectedAmount ?? 0) > 0
                  ? `-${Math.round(expense.reflectedAmount ?? 0).toLocaleString()}원`
                  : '-',
            },
            {
              key: 'actions',
              header: '관리',
              align: 'center',
              render: (expense) => (
                <div className="flex justify-center gap-1.5">
                  <button className="btn-primary" onClick={() => onEdit(expense)}>
                    수정
                  </button>
                  <button className="btn-danger-outline" onClick={() => onDelete(expense.id)}>
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
