'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { api, Income } from '@/lib/api';
import { FeedbackBanner } from '@/components/ui/FeedbackBanner';
import { SectionCard } from '@/components/ui/SectionCard';
import { CollapsibleSection } from '@/components/ui/CollapsibleSection';
import SettlementSection from '@/components/ui/SettlementSection';
import { FormField } from '@/components/ui/FormField';
import { DataTable } from '@/components/ui/DataTable';
import { useFeedbackMessage } from '@/hooks/useFeedbackMessage';
import { useConfirmModal } from '@/hooks/useConfirmModal';
import { useSettlement } from '@/hooks/useSettlement';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

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
  owner: string;
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
  note: '',
  owner: '본인'
};

export default function IncomesPage() {
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<IncomeForm>(defaultForm);
  const [editingIncomeId, setEditingIncomeId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const formSectionRef = useRef<HTMLElement>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { message, feedback, clearMessage, setMessageText, setSuccessMessage, setErrorMessage } = useFeedbackMessage();
  const { confirmState, confirm, onConfirm: onModalConfirm, onCancel: onModalCancel } = useConfirmModal();

  async function loadIncomes() {
    const result = await api.getIncomes();
    if (result.data) {
      setIncomes(result.data);
    }
    if (result.error) {
      setErrorMessage('조회 실패', result.error);
    }
  }

  const settlement = useSettlement({
    checkSettled: api.checkIncomeSettled,
    settle: api.settleIncomeMonth,
    rollback: api.rollbackIncomeMonth,
    reload: loadIncomes,
    confirm,
    entityLabel: '수입',
    guideText: '고정 월수입 템플릿만 입금일 기준으로 자동 생성/현금 반영됩니다.',
    clearMessage, setMessageText, setSuccessMessage, setErrorMessage,
    deps: [incomes],
  });

  useEffect(() => {
    loadIncomes().finally(() => setLoading(false));
  }, []);

  const monthlyIncome = useMemo(() => {
    return incomes.reduce((sum, income) => {
      if (income.cycle === 'yearly') return sum + income.amount / 12;
      if (income.cycle === 'one_time') return sum;
      return sum + income.amount;
    }, 0);
  }, [incomes]);

  const monthlyIncomeSummary = useMemo(() => {
    const inMonth = (income: Income) => String(income.occurredAt ?? '').slice(0, 7) === settlement.settlementMonth;
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
  }, [incomes, settlement.settlementMonth]);

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
    const payload = {
      name: form.name.trim(),
      amount: amountValue,
      cycle: form.cycle,
      billingDay: form.cycle === 'monthly' && form.isFixedIncome ? Number(form.billingDay || 1) : null,
      isFixedIncome: form.cycle === 'monthly' ? form.isFixedIncome : false,
      occurredAt: form.occurredAt,
      reflectToLiquidAsset: form.reflectToLiquidAsset,
      category: form.category.trim(),
      note: form.note.trim(),
      owner: form.owner
    };

    const result = editingIncomeId
      ? await api.updateIncome(editingIncomeId, payload)
      : await api.createIncome(payload);

    if (result.error) {
      setErrorMessage(editingIncomeId ? '수정 실패' : '저장 실패', result.error);
    } else {
      setEditingIncomeId(null);
      setFormOpen(false);
      setForm(defaultForm);
      setSuccessMessage(editingIncomeId ? '수입이 수정되었습니다.' : '수입이 저장되었습니다.');
      await loadIncomes();
    }
    setSaving(false);
  }

  async function onDelete(id: string) {
    const yes = await confirm('이 수입 항목을 삭제하시겠습니까?', { title: '수입 삭제', confirmLabel: '삭제' });
    if (!yes) return;
    const result = await api.deleteIncome(id);
    if (result.error) {
      setErrorMessage('삭제 실패', result.error);
      return;
    }
    setIncomes((prev) => prev.filter((item) => item.id !== id));
  }

  function onEdit(income: Income) {
    setEditingIncomeId(income.id);
    setFormOpen(true);
    setErrors({});
    clearMessage();
    setForm({
      name: income.name ?? '',
      amount: Number(income.amount ?? 0),
      cycle: (income.cycle as 'monthly' | 'yearly' | 'one_time') ?? 'monthly',
      billingDay:
        income.billingDay && income.billingDay >= 1 && income.billingDay <= 31
          ? income.billingDay
          : income.occurredAt
            ? new Date(income.occurredAt).getDate()
            : new Date().getDate(),
      isFixedIncome: Boolean(income.isFixedIncome),
      occurredAt: income.occurredAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
      reflectToLiquidAsset: Boolean(income.reflectToLiquidAsset),
      category: income.category ?? '',
      note: income.note ?? '',
      owner: income.owner ?? '본인'
    });

    setTimeout(() => {
      formSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }

  function onCancelEdit() {
    setEditingIncomeId(null);
    setFormOpen(false);
    setErrors({});
    setForm(defaultForm);
  }

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="py-4">
      <h1>수입 관리</h1>

      <SettlementSection {...settlement} />

      <SectionCard className="mt-4 max-w-[980px]">
        <h3 className="mb-3 mt-0">{settlement.settlementMonth} 수입 요약</h3>
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

      <CollapsibleSection
        className="mt-4 max-w-[980px]"
        ref={formSectionRef}
        open={formOpen}
        onToggle={() => setFormOpen((prev) => !prev)}
        title="✘ 수입 입력"
        editTitle="✘ 수입 수정"
        isEditing={!!editingIncomeId}
      >
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

          <button
            type="submit"
            disabled={saving}
            className="btn-primary w-[140px] self-end"
          >
            {saving ? '저장 중...' : editingIncomeId ? '수입 수정' : '수입 추가'}
          </button>
          {editingIncomeId ? (
            <button
              type="button"
              className="btn-danger-outline w-[140px] self-end"
              onClick={onCancelEdit}
            >
              수정 취소
            </button>
          ) : null}
        </form>
      </CollapsibleSection>

      <p className="mt-4 font-semibold">
        월 환산 수입: {Math.round(monthlyIncome).toLocaleString()}원
      </p>

      <FeedbackBanner feedback={feedback} />

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
              key: 'owner',
              header: '소유자',
              align: 'center',
              render: (income) => income.owner ?? '본인',
            },
            {
              key: 'actions',
              header: '관리',
              align: 'center',
              render: (income) => (
                <div className="flex gap-1 justify-center">
                  <button className="btn-primary" onClick={() => onEdit(income)}>
                    수정
                  </button>
                  <button className="btn-danger-outline" onClick={() => onDelete(income.id)}>
                    삭제
                  </button>
                </div>
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
