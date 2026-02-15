'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, Liability } from '@/lib/api';

type LiabilityForm = {
  name: string;
  amount: number;
  category: string;
  note: string;
};

const defaultForm: LiabilityForm = {
  name: '',
  amount: 0,
  category: '',
  note: ''
};

export default function LiabilitiesPage() {
  const [items, setItems] = useState<Liability[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState<LiabilityForm>(defaultForm);

  async function loadLiabilities() {
    const result = await api.getLiabilities();
    if (result.data) {
      setItems(result.data);
    }
    if (result.error) {
      setMessage(`조회 실패: ${result.error.message}`);
    }
  }

  useEffect(() => {
    loadLiabilities().finally(() => setLoading(false));
  }, []);

  const totalLiabilities = useMemo(
    () => items.reduce((sum, item) => sum + item.amount, 0),
    [items]
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!form.name.trim() || form.amount < 0) {
      setMessage('부채명과 금액을 확인해주세요.');
      return;
    }

    setSaving(true);
    const result = await api.createLiability({
      name: form.name.trim(),
      amount: Number(form.amount),
      category: form.category.trim(),
      note: form.note.trim()
    });

    if (result.error) {
      setMessage(`저장 실패: ${result.error.message}`);
    } else {
      setForm(defaultForm);
      setMessage('부채가 저장되었습니다.');
      await loadLiabilities();
    }
    setSaving(false);
  }

  async function onDelete(id: string) {
    const result = await api.deleteLiability(id);
    if (result.error) {
      setMessage(`삭제 실패: ${result.error.message}`);
      return;
    }
    setItems((prev) => prev.filter((item) => item.id !== id));
  }

  if (loading) {
    return <div style={{ padding: '2rem' }}>로딩 중...</div>;
  }

  return (
    <div style={{ padding: '1rem 0' }}>
      <h1>부채 관리</h1>

      <form
        onSubmit={onSubmit}
        style={{
          marginTop: '1.25rem',
          maxWidth: 840,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '0.75rem'
        }}
      >
        <input
          placeholder="부채명"
          value={form.name}
          onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          style={{ padding: '0.6rem', border: '1px solid #d0d0d0', borderRadius: 8 }}
        />
        <input
          type="number"
          min={0}
          placeholder="금액"
          value={form.amount}
          onChange={(event) => setForm((prev) => ({ ...prev, amount: Number(event.target.value || 0) }))}
          style={{ padding: '0.6rem', border: '1px solid #d0d0d0', borderRadius: 8 }}
        />
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
          style={{ width: 140, padding: '0.65rem 0.9rem', borderRadius: 8, border: '1px solid #0b63ce', background: '#0b63ce', color: '#fff' }}
        >
          {saving ? '저장 중...' : '부채 추가'}
        </button>
      </form>

      <p style={{ marginTop: '1rem', fontWeight: 600 }}>
        총 부채: {totalLiabilities.toLocaleString()}원
      </p>

      {message && <p>{message}</p>}

      <div style={{ marginTop: '1.25rem' }}>
        {items.length === 0 ? (
          <p>등록된 부채가 없습니다.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #ddd' }}>
                <th style={{ padding: '0.8rem', textAlign: 'left' }}>부채명</th>
                <th style={{ padding: '0.8rem', textAlign: 'left' }}>카테고리</th>
                <th style={{ padding: '0.8rem', textAlign: 'right' }}>금액</th>
                <th style={{ padding: '0.8rem', textAlign: 'center' }}>관리</th>
              </tr>
            </thead>
            <tbody>
              {items.map((liability) => (
                <tr key={liability.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '0.8rem' }}>{liability.name}</td>
                  <td style={{ padding: '0.8rem' }}>{liability.category || '-'}</td>
                  <td style={{ padding: '0.8rem', textAlign: 'right' }}>{liability.amount.toLocaleString()}원</td>
                  <td style={{ padding: '0.8rem', textAlign: 'center' }}>
                    <button
                      onClick={() => onDelete(liability.id)}
                      style={{ border: '1px solid #d32f2f', color: '#d32f2f', background: '#fff', borderRadius: 6, padding: '0.35rem 0.65rem' }}
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
