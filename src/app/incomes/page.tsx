'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, Income } from '@/lib/api';
import { SectionCard } from '@/components/ui/SectionCard';
import { FormField } from '@/components/ui/FormField';
import { DataTable } from '@/components/ui/DataTable';
import { useFeedbackMessage } from '@/hooks/useFeedbackMessage';

type NumericInput = number | '';

type IncomeForm = {
  name: string;
  amount: NumericInput;
  cycle: 'monthly' | 'yearly' | 'one_time';
  billingDay: NumericInput;
  isFixedIncome: boolean;
  occurredAt: string;
  reflectToLiquidAsset: boolean;
  category: string;
  note: string;
};

const defaultForm: IncomeForm = {
  name: '',
  amount: '',
  cycle: 'monthly',
  billingDay: new Date().getDate(),
  isFixedIncome: false,
  occurredAt: new Date().toISOString().slice(0, 10),
  reflectToLiquidAsset: false,
  category: '',
  note: ''
};

function getCurrentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default function IncomesPage() {
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settling, setSettling] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  const [isMonthSettled, setIsMonthSettled] = useState(false);
  const [settlementMonth, setSettlementMonth] = useState(getCurrentMonthKey());
  const [form, setForm] = useState<IncomeForm>(defaultForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { message, clearMessage, setMessageText, setSuccessMessage, setErrorMessage } = useFeedbackMessage();

  async function loadIncomes() {
    const result = await api.getIncomes();
    if (result.data) {
      setIncomes(result.data);
    }
    if (result.error) {
      setErrorMessage('조회 실패', result.error);
    }
  }

  async function checkSettledStatus(month: string) {
    const result = await api.checkIncomeSettled(month);
    setIsMonthSettled(result.data?.settled ?? false);
  }

  useEffect(() => {
    loadIncomes().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (/^\d{4}-\d{2}$/.test(settlementMonth)) {
      checkSettledStatus(settlementMonth);
    }
  }, [settlementMonth, incomes]);

  const monthlyIncome = useMemo(() => {
    return incomes.reduce((sum, income) => {
      if (income.cycle === 'yearly') return sum + income.amount / 12;
      if (income.cycle === 'one_time') return sum;
      return sum + income.amount;
    }, 0);
  }, [incomes]);

  const monthlyIncomeSummary = useMemo(() => {
    const inMonth = (income: Income) => String(income.occurredAt ?? '').slice(0, 7) === settlementMonth;
    const monthlyRows = incomes.filter(inMonth);

    const autoAmount = monthlyRows
      .filter((income) => income.entrySource === 'auto_settlement')
      .reduce((sum, income) => sum + Number(income.amount ?? 0), 0);

    const manualAmount = monthlyRows
      .filter((income) => income.entrySource !== 'auto_settlement')
      .reduce((sum, income) => sum + Number(income.amount ?? 0), 0);

    return {
      autoAmount,
      manualAmount,
      totalAmount: autoAmount + manualAmount
    };
  }, [incomes, settlementMonth]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearMessage();
    const nextErrors: Record<string, string> = {};
    const amountValue = Number(form.amount || 0);

    if (!form.name.trim()) nextErrors.name = '수입명을 입력해주세요.';
    if (!Number.isFinite(amountValue) || amountValue < 0) {
      nextErrors.amount = '금액은 0 이상이어야 합니다.';
    }
    if (form.cycle === 'monthly' && form.isFixedIncome) {
      const billingDayValue = Number(form.billingDay || 0);
      if (!Number.isFinite(billingDayValue) || billingDayValue < 1 || billingDayValue > 31) {
        nextErrors.billingDay = '입금일은 1~31 사이여야 합니다.';
      }
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      setMessageText('수입명과 금액을 확인해주세요.');
      return;
    }

    setSaving(true);
    const result = await api.createIncome({
      name: form.name.trim(),
      amount: amountValue,
      cycle: form.cycle,
      billingDay: form.cycle === 'monthly' && form.isFixedIncome ? Number(form.billingDay || 1) : null,
      isFixedIncome: form.cycle === 'monthly' ? form.isFixedIncome : false,
      occurredAt: form.occurredAt,
      reflectToLiquidAsset: form.reflectToLiquidAsset,
      category: form.category.trim(),
      note: form.note.trim()
    });

    if (result.error) {
      setErrorMessage('저장 실패', result.error);
    } else {
      setForm(defaultForm);
      setSuccessMessage('수입이 저장되었습니다.');
      await loadIncomes();
    }
    setSaving(false);
  }

  async function onDelete(id: string) {
    const result = await api.deleteIncome(id);
    if (result.error) {
      setErrorMessage('삭제 실패', result.error);
      return;
    }
    setIncomes((prev) => prev.filter((item) => item.id !== id));
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
    const result = await api.settleIncomeMonth(settlementMonth);

    if (result.error) {
      setErrorMessage('월마감 자동 반영 실패', result.error);
      setSettling(false);
      return;
    }

    const summary = result.data;
    setSuccessMessage(
      `${summary?.targetMonth ?? settlementMonth} 자동반영 완료: 생성 ${summary?.createdCount ?? 0}건, 중복건너뜀 ${summary?.skippedCount ?? 0}건, 총 ${Math.round(summary?.totalSettledAmount ?? 0).toLocaleString()}원`
    );
    await loadIncomes();
    setSettling(false);
  }

  async function onRollbackMonth() {
    clearMessage();
    if (!/^\d{4}-\d{2}$/.test(settlementMonth)) {
      setMessageText('정산월 형식이 올바르지 않습니다. (YYYY-MM)');
      return;
    }

    if (!confirm(`${settlementMonth} 정산을 취소하시겠습니까?\n자동 생성된 수입 내역이 삭제되고 자산이 복원됩니다.`)) {
      return;
    }

    setRollingBack(true);
    const result = await api.rollbackIncomeMonth(settlementMonth);

    if (result.error) {
      setErrorMessage('정산 취소 실패', result.error);
      setRollingBack(false);
      return;
    }

    const summary = result.data;
    setSuccessMessage(
      `${summary?.targetMonth ?? settlementMonth} 정산 취소 완료: 삭제 ${summary?.deletedCount ?? 0}건, 복원금액 ${Math.round(summary?.reversedAmount ?? 0).toLocaleString()}원`
    );
    await loadIncomes();
    setRollingBack(false);
  }

  if (loading) {
    return <div className="p-6">로딩 중...</div>;
  }

  return (
    <div className="py-4">
      <h1>수입 관리</h1>

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
                : "고정 월수입 템플릿만 입금일 기준으로 자동 생성/현금 반영됩니다."}
              readOnly
            />
          </FormField>
        </div>
      </SectionCard>

      <SectionCard className="mt-4 max-w-[980px]">
        <h3 className="mb-3 mt-0">{settlementMonth} 수입 요약</h3>
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
          <div className="rounded-xl border border-[var(--line)] p-3">
            <p className="helper-text m-0">자동반영(고정수입)</p>
            <p className="m-0 mt-1 text-[1.1rem] font-bold">{Math.round(monthlyIncomeSummary.autoAmount).toLocaleString()}원</p>
          </div>
          <div className="rounded-xl border border-[var(--line)] p-3">
            <p className="helper-text m-0">수동등록(변동수입)</p>
            <p className="m-0 mt-1 text-[1.1rem] font-bold">{Math.round(monthlyIncomeSummary.manualAmount).toLocaleString()}원</p>
          </div>
          <div className="rounded-xl border border-[var(--line)] p-3">
            <p className="helper-text m-0">월 총수입</p>
            <p className="m-0 mt-1 text-[1.1rem] font-bold">{Math.round(monthlyIncomeSummary.totalAmount).toLocaleString()}원</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard className="mt-4 max-w-[980px]">
        <form onSubmit={onSubmit} className="form-grid">
          <FormField label="수입명" error={errors.name}>
            <input
              placeholder="수입명"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              className={errors.name ? 'border-red-700' : ''}
            />
          </FormField>

          <FormField label="금액" error={errors.amount}>
            <input
              type="number"
              min={0}
              placeholder="금액"
              value={form.amount}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  amount: event.target.value === '' ? '' : Number(event.target.value)
                }))
              }
              className={errors.amount ? 'border-red-700' : ''}
            />
          </FormField>

          <FormField label="주기">
            <select
              value={form.cycle}
              onChange={(event) =>
                setForm((prev) => {
                  const nextCycle = event.target.value as 'monthly' | 'yearly' | 'one_time';
                  return {
                    ...prev,
                    cycle: nextCycle,
                    reflectToLiquidAsset: nextCycle === 'monthly' ? false : true,
                    isFixedIncome: nextCycle === 'monthly' ? prev.isFixedIncome : false,
                  };
                })
              }
            >
              <option value="monthly">월간</option>
              <option value="yearly">연간</option>
              <option value="one_time">일회성</option>
            </select>
          </FormField>

          {form.cycle === 'monthly' ? (
            <>
              <FormField label="고정수입 템플릿" fullWidth>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.isFixedIncome}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, isFixedIncome: event.target.checked }))
                    }
                  />
                  <span>월마감 자동반영 대상(급여/고정입금)</span>
                </label>
              </FormField>

              {form.isFixedIncome ? (
                <FormField label="입금일 (매월)" error={errors.billingDay}>
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
              ) : null}
            </>
          ) : null}

          <FormField label="발생일">
            <input
              type="date"
              value={form.occurredAt}
              onChange={(event) => setForm((prev) => ({ ...prev, occurredAt: event.target.value }))}
            />
          </FormField>

          <FormField label="현금성 자산 반영" fullWidth>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.reflectToLiquidAsset}
                disabled={form.cycle === 'monthly'}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, reflectToLiquidAsset: event.target.checked }))
                }
              />
              <span>
                {form.cycle === 'monthly'
                  ? '월간 수입은 월마감에서 자동 반영합니다.'
                  : '저장 시 입출금 통장(현금성 자산)에 즉시 반영'}
              </span>
            </label>
          </FormField>

          <FormField label="카테고리">
            <input
              placeholder="카테고리"
              value={form.category}
              onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
            />
          </FormField>

          <FormField label="메모">
            <input
              placeholder="메모"
              value={form.note}
              onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
            />
          </FormField>

          <button
            type="submit"
            disabled={saving}
            className="btn-primary w-[140px] self-end"
          >
            {saving ? '저장 중...' : '수입 추가'}
          </button>
        </form>
      </SectionCard>

      <p className="mt-4 font-semibold">
        월 환산 수입: {Math.round(monthlyIncome).toLocaleString()}원
      </p>

      {message && <p>{message}</p>}

      <SectionCard className="mt-5 max-w-[980px]">
        <DataTable
          rows={incomes}
          rowKey={(income) => income.id}
          emptyMessage="등록된 수입이 없습니다."
          columns={[
            { key: 'name', header: '수입명', render: (income) => income.name },
            {
              key: 'incomeType',
              header: '유형',
              render: (income) => (income.isFixedIncome ? '고정' : '변동'),
            },
            { key: 'cycle', header: '주기', render: (income) => income.cycleLabel ?? income.cycle },
            {
              key: 'entrySource',
              header: '생성방식',
              align: 'center',
              render: (income) => (income.entrySource === 'auto_settlement' ? '자동' : '수동'),
            },
            {
              key: 'amount',
              header: '금액',
              align: 'right',
              render: (income) => `${income.amount.toLocaleString()}원`,
            },
            {
              key: 'actions',
              header: '관리',
              align: 'center',
              render: (income) => (
                <button className="btn-danger-outline" onClick={() => onDelete(income.id)}>
                  삭제
                </button>
              ),
            },
            {
              key: 'reflect',
              header: '자산반영',
              align: 'right',
              render: (income) =>
                income.reflectToLiquidAsset && (income.reflectedAmount ?? 0) > 0
                  ? `+${Math.round(income.reflectedAmount ?? 0).toLocaleString()}원 (${income.occurredAt ?? '-'})`
                  : '-',
            },
          ]}
        />
      </SectionCard>
    </div>
  );
}
