'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

type Expense = {
  id: string;
  name: string;
  amount: number;
};

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getExpenses().then((result) => {
      if (result.data) {
        setExpenses(result.data);
      }
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <div style={{ padding: '2rem' }}>로딩 중...</div>;
  }

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>지출 관리</h1>
      <div style={{ marginTop: '2rem' }}>
        {expenses.length === 0 ? (
          <p>등록된 지출이 없습니다.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #ddd' }}>
                <th style={{ padding: '1rem', textAlign: 'left' }}>항목명</th>
                <th style={{ padding: '1rem', textAlign: 'right' }}>금액</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((expense) => (
                <tr key={expense.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '1rem' }}>{expense.name}</td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    {expense.amount.toLocaleString()}원
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
