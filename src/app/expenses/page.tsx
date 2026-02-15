'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, Expense } from '@/lib/api';

type ExpenseForm = {
  name: string;
  amount: number;
  type: 'fixed' | 'subscription';
  cycle: 'monthly' | 'yearly';
  billingDay: number;
  category: string;
};

const defaultForm: ExpenseForm = {
  name: '',
  amount: 0,
  type: 'fixed',
  cycle: 'monthly',
  billingDay: 1,
  category: ''
};

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<'all' | 'fixed' | 'subscription'>('all');
  const [form, setForm] = useState<ExpenseForm>(defaultForm);
  const [message, setMessage] = useState<string | null>(null);

  async function loadExpenses(selectedType: 'all' | 'fixed' | 'subscription' = filter) {
    const result = await api.getExpenses(selectedType === 'all' ? undefined : selectedType);
    if (result.data) {
      setExpenses(result.data);
    }
    if (result.error) {
      setMessage(`조회 실패: ${result.error.message}`);
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
      return sum + item.amount;
    }, 0);
  }, [expenses]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!form.name.trim() || form.amount < 0) {
      setMessage('항목명과 금액을 확인해주세요.');
      return;
    }

    setSaving(true);
    const result = await api.createExpense({
      name: form.name.trim(),
      amount: Number(form.amount),
      type: form.type,
      cycle: form.cycle,
      billingDay: form.billingDay,
      category: form.category.trim()
    });

    if (result.error) {
      setMessage(`저장 실패: ${result.error.message}`);
    } else {
      setForm(defaultForm);
      setMessage('지출이 저장되었습니다.');
      await loadExpenses();
    }

    setSaving(false);
  }

  async function onDelete(id: string) {
    const result = await api.deleteExpense(id);
    if (result.error) {
      setMessage(`삭제 실패: ${result.error.message}`);
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
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>지출 관리</h1>

      <form
        onSubmit={onSubmit}
        style={{
          marginTop: '1.25rem',
          maxWidth: 820,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '0.75rem'
        }}
      >
        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <span>항목명</span>
          <input
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            style={{ padding: '0.6rem', border: '1px solid #d0d0d0', borderRadius: 8 }}
          />
        </label>

        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <span>금액(원)</span>
          <input
            type="number"
            min={0}
            value={form.amount}
            onChange={(event) => setForm((prev) => ({ ...prev, amount: Number(event.target.value || 0) }))}
            style={{ padding: '0.6rem', border: '1px solid #d0d0d0', borderRadius: 8 }}
          />
        </label>

        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <span>유형</span>
          <select
            value={form.type}
            onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value as 'fixed' | 'subscription' }))}
            style={{ padding: '0.6rem', border: '1px solid #d0d0d0', borderRadius: 8 }}
          >
            <option value="fixed">고정지출</option>
            <option value="subscription">구독지출</option>
          </select>
        </label>

        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <span>주기</span>
          <select
            value={form.cycle}
            onChange={(event) => setForm((prev) => ({ ...prev, cycle: event.target.value as 'monthly' | 'yearly' }))}
            style={{ padding: '0.6rem', border: '1px solid #d0d0d0', borderRadius: 8 }}
          >
            <option value="monthly">월간</option>
            <option value="yearly">연간</option>
          </select>
        </label>

        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <span>청구일(1~31)</span>
          <input
            type="number"
            min={1}
            max={31}
            value={form.billingDay}
            onChange={(event) => setForm((prev) => ({ ...prev, billingDay: Number(event.target.value || 1) }))}
            style={{ padding: '0.6rem', border: '1px solid #d0d0d0', borderRadius: 8 }}
          />
        </label>

        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <span>카테고리</span>
          <input
            value={form.category}
            onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
            placeholder="예: 통신비"
            style={{ padding: '0.6rem', border: '1px solid #d0d0d0', borderRadius: 8 }}
          />
        </label>

        <button
          type="submit"
          disabled={saving}
          style={{
            width: 160,
            padding: '0.7rem 1rem',
            borderRadius: 8,
            border: '1px solid #0b63ce',
            backgroundColor: '#0b63ce',
            color: '#fff'
          }}
        >
          {saving ? '저장 중...' : '지출 추가'}
        </button>
      </form>

      <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <strong>필터:</strong>
        <button onClick={() => onChangeFilter('all')}>전체</button>
        <button onClick={() => onChangeFilter('fixed')}>고정</button>
        <button onClick={() => onChangeFilter('subscription')}>구독</button>
      </div>

      <p style={{ marginTop: '0.75rem', fontWeight: 600 }}>
        월 환산 지출 합계: {Math.round(totalMonthly).toLocaleString()}원
      </p>

      {message && <p>{message}</p>}

      <div style={{ marginTop: '2rem' }}>
        {expenses.length === 0 ? (
          <p>등록된 지출이 없습니다.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #ddd' }}>
                <th style={{ padding: '1rem', textAlign: 'left' }}>항목명</th>
                <th style={{ padding: '1rem', textAlign: 'left' }}>유형</th>
                <th style={{ padding: '1rem', textAlign: 'left' }}>주기</th>
                <th style={{ padding: '1rem', textAlign: 'right' }}>금액</th>
                <th style={{ padding: '1rem', textAlign: 'center' }}>관리</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((expense) => (
                <tr key={expense.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '1rem' }}>{expense.name}</td>
                  <td style={{ padding: '1rem' }}>{expense.expenseType}</td>
                  <td style={{ padding: '1rem' }}>{expense.cycle}</td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    {expense.amount.toLocaleString()}원
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'center' }}>
                    <button
                      onClick={() => onDelete(expense.id)}
                      style={{ border: '1px solid #d32f2f', color: '#d32f2f', background: '#fff', borderRadius: 6, padding: '0.4rem 0.65rem' }}
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
