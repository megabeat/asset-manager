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
  occurredAt: string;
  reflectToLiquidAsset: boolean;
  category: string;
  note: string;
};

const defaultForm: IncomeForm = {
  name: '',
  amount: '',
  cycle: 'monthly',
  occurredAt: new Date().toISOString().slice(0, 10),
  reflectToLiquidAsset: false,
  category: '',
  note: ''
};

export default function IncomesPage() {
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearMessage();
    const nextErrors: Record<string, string> = {};
    const amountValue = Number(form.amount || 0);

    if (!form.name.trim()) nextErrors.name = '수입명을 입력해주세요.';
    if (!Number.isFinite(amountValue) || amountValue < 0) {
      nextErrors.amount = '금액은 0 이상이어야 합니다.';
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

  if (loading) {
    return <div style={{ padding: '2rem' }}>로딩 중...</div>;
  }

  return (
    <div style={{ padding: '1rem 0' }}>
      <h1>수입 관리</h1>

      <SectionCard style={{ marginTop: '1.25rem', maxWidth: 980 }}>
        <form onSubmit={onSubmit} className="form-grid">
          <FormField label="수입명" error={errors.name}>
            <input
              placeholder="수입명"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              style={errors.name ? { borderColor: '#b91c1c' } : undefined}
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
              style={errors.amount ? { borderColor: '#b91c1c' } : undefined}
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
                  };
                })
              }
            >
              <option value="monthly">월간</option>
              <option value="yearly">연간</option>
              <option value="one_time">일회성</option>
            </select>
          </FormField>

          <FormField label="발생일">
            <input
              type="date"
              value={form.occurredAt}
              onChange={(event) => setForm((prev) => ({ ...prev, occurredAt: event.target.value }))}
            />
          </FormField>

          <FormField label="현금성 자산 반영" fullWidth>
            <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
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
                  ? '월간 수입은 자동 반영하지 않습니다.'
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
            className="btn-primary"
            style={{ width: 140, alignSelf: 'end' }}
          >
            {saving ? '저장 중...' : '수입 추가'}
          </button>
        </form>
      </SectionCard>

      <p style={{ marginTop: '1rem', fontWeight: 600 }}>
        월 환산 수입: {Math.round(monthlyIncome).toLocaleString()}원
      </p>

      {message && <p>{message}</p>}

      <SectionCard style={{ marginTop: '1.25rem' }}>
        <DataTable
          rows={incomes}
          rowKey={(income) => income.id}
          emptyMessage="등록된 수입이 없습니다."
          columns={[
            { key: 'name', header: '수입명', render: (income) => income.name },
            { key: 'cycle', header: '주기', render: (income) => income.cycle },
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
