'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, Income } from '@/lib/api';

type IncomeForm = {
  name: string;
  amount: number;
  cycle: 'monthly' | 'yearly' | 'one_time';
  category: string;
  note: string;
};

const defaultForm: IncomeForm = {
  name: '',
  amount: 0,
  cycle: 'monthly',
  category: '',
  note: ''
};

export default function IncomesPage() {
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState<IncomeForm>(defaultForm);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function loadIncomes() {
    const result = await api.getIncomes();
    if (result.data) {
      setIncomes(result.data);
    }
    if (result.error) {
      setMessage(`조회 실패: ${result.error.message}`);
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
    setMessage(null);
    const nextErrors: Record<string, string> = {};

    if (!form.name.trim()) nextErrors.name = '수입명을 입력해주세요.';
    if (!Number.isFinite(form.amount) || form.amount < 0) {
      nextErrors.amount = '금액은 0 이상이어야 합니다.';
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      setMessage('수입명과 금액을 확인해주세요.');
      return;
    }

    setSaving(true);
    const result = await api.createIncome({
      name: form.name.trim(),
      amount: Number(form.amount),
      cycle: form.cycle,
      category: form.category.trim(),
      note: form.note.trim()
    });

    if (result.error) {
      setMessage(`저장 실패: ${result.error.message}`);
    } else {
      setForm(defaultForm);
      setMessage('수입이 저장되었습니다.');
      await loadIncomes();
    }
    setSaving(false);
  }

  async function onDelete(id: string) {
    const result = await api.deleteIncome(id);
    if (result.error) {
      setMessage(`삭제 실패: ${result.error.message}`);
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

      <form onSubmit={onSubmit} className="section-card form-grid" style={{ marginTop: '1.25rem', maxWidth: 980 }}>
        <input
          placeholder="수입명"
          value={form.name}
          onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          style={errors.name ? { borderColor: '#b91c1c' } : undefined}
        />
        {errors.name && <p className="form-error" style={{ gridColumn: '1 / -1' }}>{errors.name}</p>}
        <input
          type="number"
          min={0}
          placeholder="금액"
          value={form.amount}
          onChange={(event) => setForm((prev) => ({ ...prev, amount: Number(event.target.value || 0) }))}
          style={errors.amount ? { borderColor: '#b91c1c' } : undefined}
        />
        {errors.amount && <p className="form-error" style={{ gridColumn: '1 / -1' }}>{errors.amount}</p>}
        <select
          value={form.cycle}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, cycle: event.target.value as 'monthly' | 'yearly' | 'one_time' }))
          }
          style={{ padding: '0.6rem', border: '1px solid #d0d0d0', borderRadius: 8 }}
        >
          <option value="monthly">월간</option>
          <option value="yearly">연간</option>
          <option value="one_time">일회성</option>
        </select>
        <input
          placeholder="카테고리"
          value={form.category}
          onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
          style={{ padding: '0.6rem', border: '1px solid #d0d0d0', borderRadius: 8 }}
        />
        <input
          placeholder="메모"
          value={form.note}
          onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
          style={{ padding: '0.6rem', border: '1px solid #d0d0d0', borderRadius: 8 }}
        />
        <button
          type="submit"
          disabled={saving}
          className="btn-primary"
          style={{ width: 140 }}
        >
          {saving ? '저장 중...' : '수입 추가'}
        </button>
      </form>

      <p style={{ marginTop: '1rem', fontWeight: 600 }}>
        월 환산 수입: {Math.round(monthlyIncome).toLocaleString()}원
      </p>

      {message && <p>{message}</p>}

      <div className="section-card" style={{ marginTop: '1.25rem' }}>
        {incomes.length === 0 ? (
          <p>등록된 수입이 없습니다.</p>
        ) : (
          <table>
            <thead>
              <tr style={{ borderBottom: '2px solid #ddd' }}>
                <th style={{ padding: '0.8rem', textAlign: 'left' }}>수입명</th>
                <th style={{ padding: '0.8rem', textAlign: 'left' }}>주기</th>
                <th style={{ padding: '0.8rem', textAlign: 'right' }}>금액</th>
                <th style={{ padding: '0.8rem', textAlign: 'center' }}>관리</th>
              </tr>
            </thead>
            <tbody>
              {incomes.map((income) => (
                <tr key={income.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '0.8rem' }}>{income.name}</td>
                  <td style={{ padding: '0.8rem' }}>{income.cycle}</td>
                  <td style={{ padding: '0.8rem', textAlign: 'right' }}>{income.amount.toLocaleString()}원</td>
                  <td style={{ padding: '0.8rem', textAlign: 'center' }}>
                    <button
                      className="btn-danger-outline"
                      onClick={() => onDelete(income.id)}
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
