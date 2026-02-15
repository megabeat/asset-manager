'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, Expense } from '@/lib/api';
import { SectionCard } from '@/components/ui/SectionCard';
import { FormField } from '@/components/ui/FormField';
import { DataTable } from '@/components/ui/DataTable';
import { useFeedbackMessage } from '@/hooks/useFeedbackMessage';

type ExpenseForm = {
  name: string;
  amount: number;
  type: 'fixed' | 'subscription';
  cycle: 'monthly' | 'yearly' | 'one_time';
  billingDay: number;
  occurredAt: string;
  reflectToLiquidAsset: boolean;
  category: string;
};

const defaultForm: ExpenseForm = {
  name: '',
  amount: 0,
  type: 'fixed',
  cycle: 'monthly',
  billingDay: 1,
  occurredAt: new Date().toISOString().slice(0, 10),
  reflectToLiquidAsset: false,
  category: ''
};

  type CardQuickForm = {
    cardName: string;
    amount: number;
    occurredAt: string;
  };

  const defaultCardQuickForm: CardQuickForm = {
    cardName: '',
    amount: 0,
    occurredAt: new Date().toISOString().slice(0, 10),
  };

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<'all' | 'fixed' | 'subscription'>('all');
  const [form, setForm] = useState<ExpenseForm>(defaultForm);
  const [cardQuickForm, setCardQuickForm] = useState<CardQuickForm>(defaultCardQuickForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { message, clearMessage, setMessageText, setSuccessMessage, setErrorMessage } = useFeedbackMessage();

  async function loadExpenses(selectedType: 'all' | 'fixed' | 'subscription' = filter) {
    const result = await api.getExpenses(selectedType === 'all' ? undefined : selectedType);
    if (result.data) {
      setExpenses(result.data);
    }
    if (result.error) {
      setErrorMessage('조회 실패', result.error);
    }
  }

  useEffect(() => {
    loadExpenses().finally(() => {
      setLoading(false);
    });
  }, []);

  const totalMonthly = useMemo(() => {
    return expenses.reduce((sum, item) => {
      if (item.cycle === 'yearly') {
        return sum + item.amount / 12;
      }
      if (item.cycle === 'one_time') {
        return sum;
      }
      return sum + item.amount;
    }, 0);
  }, [expenses]);

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

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearMessage();
    const nextErrors: Record<string, string> = {};

    if (!form.name.trim()) nextErrors.name = '항목명을 입력해주세요.';
    if (!Number.isFinite(form.amount) || form.amount < 0) {
      nextErrors.amount = '금액은 0 이상이어야 합니다.';
    }
    if (form.cycle !== 'one_time' && (!Number.isFinite(form.billingDay) || form.billingDay < 1 || form.billingDay > 31)) {
      nextErrors.billingDay = '청구일은 1~31 사이여야 합니다.';
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      setMessageText('항목명과 금액을 확인해주세요.');
      return;
    }

    setSaving(true);
    const result = await api.createExpense({
      name: form.name.trim(),
      amount: Number(form.amount),
      type: form.type,
      cycle: form.cycle,
      billingDay: form.cycle === 'one_time' ? null : form.billingDay,
      occurredAt: form.occurredAt,
      reflectToLiquidAsset: form.reflectToLiquidAsset,
      category: form.category.trim()
    });

    if (result.error) {
      setErrorMessage('저장 실패', result.error);
    } else {
      setForm(defaultForm);
      setSuccessMessage('지출이 저장되었습니다.');
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
    if (!Number.isFinite(cardQuickForm.amount) || cardQuickForm.amount <= 0) {
      setMessageText('카드대금은 0보다 커야 합니다.');
      return;
    }

    setSaving(true);
    const result = await api.createExpense({
      name: `${cardQuickForm.cardName.trim()} 카드대금`,
      amount: Number(cardQuickForm.amount),
      type: 'fixed',
      cycle: 'one_time',
      billingDay: null,
      occurredAt: cardQuickForm.occurredAt,
      reflectToLiquidAsset: true,
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
    const result = await api.deleteExpense(id);
    if (result.error) {
      setErrorMessage('삭제 실패', result.error);
      return;
    }
    setExpenses((prev) => prev.filter((item) => item.id !== id));
  }

  async function onChangeFilter(nextFilter: 'all' | 'fixed' | 'subscription') {
    setFilter(nextFilter);
    setLoading(true);
    await loadExpenses(nextFilter);
    setLoading(false);
  }

  if (loading) {
    return <div style={{ padding: '2rem' }}>로딩 중...</div>;
  }

  return (
    <div style={{ padding: '1rem 0' }}>
      <h1>지출 관리</h1>

      <SectionCard style={{ marginTop: '1.25rem', maxWidth: 980 }}>
        <div style={{ marginBottom: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-danger-outline"
            onClick={() =>
              setForm((prev) => ({
                ...prev,
                name: '월말 카드값',
                type: 'fixed',
                cycle: 'monthly',
                billingDay: 31,
                category: '카드대금',
                reflectToLiquidAsset: true
              }))
            }
          >
            월말 카드값 템플릿
          </button>
          <button
            type="button"
            className="btn-danger-outline"
            onClick={() =>
              setForm((prev) => ({
                ...prev,
                name: '현금 일회성 지출',
                type: 'fixed',
                cycle: 'one_time',
                billingDay: 1,
                category: '현금지출',
                reflectToLiquidAsset: true
              }))
            }
          >
            현금 일회성 템플릿
          </button>
        </div>

        <form onSubmit={onSubmit} className="form-grid">
          <FormField label="항목명" error={errors.name}>
            <input
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              style={errors.name ? { borderColor: '#b91c1c' } : undefined}
            />
          </FormField>

          <FormField label="금액(원)" error={errors.amount}>
            <input
              type="number"
              min={0}
              value={form.amount}
              onChange={(event) => setForm((prev) => ({ ...prev, amount: Number(event.target.value || 0) }))}
              style={errors.amount ? { borderColor: '#b91c1c' } : undefined}
            />
          </FormField>

          <FormField label="유형">
            <select
              value={form.type}
              onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value as 'fixed' | 'subscription' }))}
            >
              <option value="fixed">고정지출</option>
              <option value="subscription">구독지출</option>
            </select>
          </FormField>

          <FormField label="주기">
            <select
              value={form.cycle}
              onChange={(event) => setForm((prev) => ({ ...prev, cycle: event.target.value as 'monthly' | 'yearly' | 'one_time' }))}
            >
              <option value="monthly">월간</option>
              <option value="yearly">연간</option>
              <option value="one_time">일회성</option>
            </select>
          </FormField>

          {form.cycle !== 'one_time' ? (
            <FormField label="청구일(1~31)" error={errors.billingDay}>
              <input
                type="number"
                min={1}
                max={31}
                value={form.billingDay}
                onChange={(event) => setForm((prev) => ({ ...prev, billingDay: Number(event.target.value || 1) }))}
                style={errors.billingDay ? { borderColor: '#b91c1c' } : undefined}
              />
            </FormField>
          ) : null}

          <FormField label="출금(발생)일">
            <input
              type="date"
              value={form.occurredAt}
              onChange={(event) => setForm((prev) => ({ ...prev, occurredAt: event.target.value }))}
            />
          </FormField>

          <FormField label="현금성 자산 차감" fullWidth>
            <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={form.reflectToLiquidAsset}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, reflectToLiquidAsset: event.target.checked }))
                }
              />
              <span>입력 시 입출금 통장/현금 자산에서 금액 차감</span>
            </label>
          </FormField>

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
            className="btn-primary"
            style={{ width: 160, alignSelf: 'end' }}
          >
            {saving ? '저장 중...' : '지출 추가'}
          </button>
        </form>
      </SectionCard>

      <SectionCard style={{ marginTop: '1rem', maxWidth: 980 }}>
        <h3 style={{ marginTop: 0, marginBottom: '0.75rem' }}>이번 달 카드대금 빠른입력</h3>
        <div className="form-grid">
          <FormField label="카드명">
            <input
              value={cardQuickForm.cardName}
              placeholder="예: 신한, 삼성"
              onChange={(event) => setCardQuickForm((prev) => ({ ...prev, cardName: event.target.value }))}
            />
          </FormField>
          <FormField label="청구금액(원)">
            <input
              type="number"
              min={0}
              value={cardQuickForm.amount}
              onChange={(event) => setCardQuickForm((prev) => ({ ...prev, amount: Number(event.target.value || 0) }))}
            />
          </FormField>
          <FormField label="출금일">
            <input
              type="date"
              value={cardQuickForm.occurredAt}
              onChange={(event) => setCardQuickForm((prev) => ({ ...prev, occurredAt: event.target.value }))}
            />
          </FormField>
          <button type="button" className="btn-primary" onClick={onSubmitCardQuick} disabled={saving} style={{ width: 180, alignSelf: 'end' }}>
            {saving ? '반영 중...' : '카드대금 반영'}
          </button>
        </div>
        <p className="helper-text" style={{ marginBottom: 0 }}>
          최근 카드대금 참고: {Math.round(previousCardAmount).toLocaleString()}원
        </p>
      </SectionCard>

      <SectionCard style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center', maxWidth: 520 }}>
        <strong>필터:</strong>
        <button className="btn-subtle" onClick={() => onChangeFilter('all')}>전체</button>
        <button className="btn-subtle" onClick={() => onChangeFilter('fixed')}>고정</button>
        <button className="btn-subtle" onClick={() => onChangeFilter('subscription')}>구독</button>
      </SectionCard>

      <p style={{ marginTop: '0.75rem', fontWeight: 600 }}>
        월 환산 지출 합계: {Math.round(totalMonthly).toLocaleString()}원
      </p>

      {message && <p>{message}</p>}

      <SectionCard style={{ marginTop: '1rem' }}>
        <DataTable
          rows={expenses}
          rowKey={(expense) => expense.id}
          emptyMessage="등록된 지출이 없습니다."
          columns={[
            { key: 'name', header: '항목명', render: (expense) => expense.name },
            { key: 'type', header: '유형', render: (expense) => expense.expenseType },
            { key: 'cycle', header: '주기', render: (expense) => expense.cycle },
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
                <button className="btn-danger-outline" onClick={() => onDelete(expense.id)}>
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
