'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, Liability } from '@/lib/api';
import { FeedbackBanner } from '@/components/ui/FeedbackBanner';
import { SectionCard } from '@/components/ui/SectionCard';
import { FormField } from '@/components/ui/FormField';
import { DataTable } from '@/components/ui/DataTable';
import { useFeedbackMessage } from '@/hooks/useFeedbackMessage';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

type LiabilityForm = {
  name: string;
  amount: number;
  category: string;
  note: string;
  owner: string;
};

const defaultForm: LiabilityForm = {
  name: '',
  amount: 0,
  category: '',
  note: '',
  owner: '본인'
};

export default function LiabilitiesPage() {
  const [items, setItems] = useState<Liability[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingLiabilityId, setEditingLiabilityId] = useState<string | null>(null);
  const [form, setForm] = useState<LiabilityForm>(defaultForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { message, feedback, clearMessage, setMessageText, setSuccessMessage, setErrorMessage } = useFeedbackMessage();

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
    const payload = {
      name: form.name.trim(),
      amount: Number(form.amount),
      category: form.category.trim(),
      note: form.note.trim(),
      owner: form.owner
    };

    const result = editingLiabilityId
      ? await api.updateLiability(editingLiabilityId, payload)
      : await api.createLiability(payload);

    if (result.error) {
      setErrorMessage(editingLiabilityId ? '수정 실패' : '저장 실패', result.error);
    } else {
      setEditingLiabilityId(null);
      setForm(defaultForm);
      setSuccessMessage(editingLiabilityId ? '부채가 수정되었습니다.' : '부채가 저장되었습니다.');
      await loadLiabilities();
    }
    setSaving(false);
  }

  function onEdit(liability: Liability) {
    setEditingLiabilityId(liability.id);
    setErrors({});
    setForm({
      name: liability.name,
      amount: liability.amount,
      category: liability.category ?? '',
      note: liability.note ?? '',
      owner: liability.owner ?? '본인'
    });
  }

  function onCancelEdit() {
    setEditingLiabilityId(null);
    setErrors({});
    setForm(defaultForm);
  }

  async function onDelete(id: string) {
    if (!confirm('이 부채 항목을 삭제하시겠습니까?')) return;
    const result = await api.deleteLiability(id);
    if (result.error) {
      setErrorMessage('삭제 실패', result.error);
      return;
    }
    setItems((prev) => prev.filter((item) => item.id !== id));
  }

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="py-4">
      <h1>부채 관리</h1>

      <SectionCard className="mt-5 max-w-[980px]">
        <form onSubmit={onSubmit} className="form-grid">
          <FormField label="부채명" error={errors.name}>
            <input
              placeholder="부채명"
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
              onChange={(event) => setForm((prev) => ({ ...prev, amount: Number(event.target.value || 0) }))}
              className={errors.amount ? 'border-red-700' : ''}
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
            {saving ? '저장 중...' : editingLiabilityId ? '부채 수정' : '부채 추가'}
          </button>
          {editingLiabilityId ? (
            <button
              type="button"
              onClick={onCancelEdit}
              className="btn-danger-outline w-[120px] self-end"
            >
              취소
            </button>
          ) : null}
        </form>
      </SectionCard>

      <p className="mt-4 font-semibold">
        총 부채: {totalLiabilities.toLocaleString()}원
      </p>

      <FeedbackBanner feedback={feedback} />

      <SectionCard className="mt-5 max-w-[980px]">
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
              key: 'owner',
              header: '소유자',
              align: 'center',
              render: (liability) => liability.owner ?? '본인',
            },
            {
              key: 'actions',
              header: '관리',
              align: 'center',
              render: (liability) => (
                <div className="flex justify-center gap-1.5">
                  <button className="btn-primary" onClick={() => onEdit(liability)}>
                    수정
                  </button>
                  <button className="btn-danger-outline" onClick={() => onDelete(liability.id)}>
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
