'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, Liability } from '@/lib/api';
import { SectionCard } from '@/components/ui/SectionCard';
import { FormField } from '@/components/ui/FormField';
import { DataTable } from '@/components/ui/DataTable';
import { useFeedbackMessage } from '@/hooks/useFeedbackMessage';

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
  const [form, setForm] = useState<LiabilityForm>(defaultForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { message, clearMessage, setMessageText, setSuccessMessage, setErrorMessage } = useFeedbackMessage();

  async function loadLiabilities() {
    const result = await api.getLiabilities();
    if (result.data) {
      setItems(result.data);
    }
    if (result.error) {
      setErrorMessage('조회 실패', result.error);
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
    clearMessage();
    const nextErrors: Record<string, string> = {};

    if (!form.name.trim()) nextErrors.name = '부채명을 입력해주세요.';
    if (!Number.isFinite(form.amount) || form.amount < 0) {
      nextErrors.amount = '금액은 0 이상이어야 합니다.';
    }
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      setMessageText('부채명과 금액을 확인해주세요.');
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
      setErrorMessage('저장 실패', result.error);
    } else {
      setForm(defaultForm);
      setSuccessMessage('부채가 저장되었습니다.');
      await loadLiabilities();
    }
    setSaving(false);
  }

  async function onDelete(id: string) {
    const result = await api.deleteLiability(id);
    if (result.error) {
      setErrorMessage('삭제 실패', result.error);
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

      <SectionCard style={{ marginTop: '1.25rem', maxWidth: 980 }}>
        <form onSubmit={onSubmit} className="form-grid">
          <FormField label="부채명" error={errors.name}>
            <input
              placeholder="부채명"
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
              onChange={(event) => setForm((prev) => ({ ...prev, amount: Number(event.target.value || 0) }))}
              style={errors.amount ? { borderColor: '#b91c1c' } : undefined}
            />
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
            {saving ? '저장 중...' : '부채 추가'}
          </button>
        </form>
      </SectionCard>

      <p style={{ marginTop: '1rem', fontWeight: 600 }}>
        총 부채: {totalLiabilities.toLocaleString()}원
      </p>

      {message && <p>{message}</p>}

      <SectionCard style={{ marginTop: '1.25rem' }}>
        <DataTable
          rows={items}
          rowKey={(liability) => liability.id}
          emptyMessage="등록된 부채가 없습니다."
          columns={[
            { key: 'name', header: '부채명', render: (liability) => liability.name },
            { key: 'category', header: '카테고리', render: (liability) => liability.category || '-' },
            {
              key: 'amount',
              header: '금액',
              align: 'right',
              render: (liability) => `${liability.amount.toLocaleString()}원`,
            },
            {
              key: 'actions',
              header: '관리',
              align: 'center',
              render: (liability) => (
                <button className="btn-danger-outline" onClick={() => onDelete(liability.id)}>
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
