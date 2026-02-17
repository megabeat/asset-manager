'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, Liability } from '@/lib/api';
import { FeedbackBanner } from '@/components/ui/FeedbackBanner';
import { SectionCard } from '@/components/ui/SectionCard';
import { FormField } from '@/components/ui/FormField';
import { DataTable } from '@/components/ui/DataTable';
import { useFeedbackMessage } from '@/hooks/useFeedbackMessage';
import { useConfirmModal } from '@/hooks/useConfirmModal';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

type LiabilityForm = {
  name: string;
  amount: number;
  category: string;
  interestRate: number | '';
  repaymentMethod: string;
  maturityDate: string;
  monthlyPayment: number | '';
  startDate: string;
  loanTerm: number | '';
  note: string;
  owner: string;
};

const CATEGORIES = [
  { value: '주택담보대출', label: '주택담보대출' },
  { value: '신용대출', label: '신용대출' },
  { value: '학자금대출', label: '학자금대출' },
  { value: '전세대출', label: '전세대출' },
  { value: '자동차할부', label: '자동차할부' },
  { value: '카드론', label: '카드론' },
  { value: '기타', label: '기타' }
] as const;

const REPAYMENT_METHODS = [
  { value: '', label: '선택안함' },
  { value: '원리금균등', label: '원리금균등' },
  { value: '원금균등', label: '원금균등' },
  { value: '만기일시', label: '만기일시' },
  { value: '거치식', label: '거치식' }
] as const;

const defaultForm: LiabilityForm = {
  name: '',
  amount: 0,
  category: '기타',
  interestRate: '',
  repaymentMethod: '',
  maturityDate: '',
  monthlyPayment: '',
  startDate: '',
  loanTerm: '',
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
  const { confirmState, confirm, onConfirm: onModalConfirm, onCancel: onModalCancel } = useConfirmModal();

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

  const totalMonthlyPayment = useMemo(
    () => items.reduce((sum, item) => sum + (item.monthlyPayment ?? 0), 0),
    [items]
  );

  const weightedAvgRate = useMemo(() => {
    const withRate = items.filter((item) => item.interestRate != null && item.interestRate > 0);
    if (withRate.length === 0) return null;
    const totalAmount = withRate.reduce((sum, item) => sum + item.amount, 0);
    if (totalAmount === 0) return null;
    const weighted = withRate.reduce((sum, item) => sum + item.amount * (item.interestRate ?? 0), 0);
    return Math.round((weighted / totalAmount) * 100) / 100;
  }, [items]);

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
      interestRate: form.interestRate === '' ? null : Number(form.interestRate),
      repaymentMethod: form.repaymentMethod,
      maturityDate: form.maturityDate,
      monthlyPayment: form.monthlyPayment === '' ? null : Number(form.monthlyPayment),
      startDate: form.startDate,
      loanTerm: form.loanTerm === '' ? null : Number(form.loanTerm),
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
      category: liability.category ?? '기타',
      interestRate: liability.interestRate ?? '',
      repaymentMethod: liability.repaymentMethod ?? '',
      maturityDate: liability.maturityDate ?? '',
      monthlyPayment: liability.monthlyPayment ?? '',
      startDate: liability.startDate ?? '',
      loanTerm: liability.loanTerm ?? '',
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
    const yes = await confirm('이 부채 항목을 삭제하시겠습니까?', { title: '부채 삭제', confirmLabel: '삭제' });
    if (!yes) return;
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
            <select
              value={form.category}
              onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
            >
              {CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
          </FormField>

          <FormField label="연이자율(%)">
            <input
              type="number"
              min={0}
              max={100}
              step={0.01}
              placeholder="예: 3.5"
              value={form.interestRate}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  interestRate: event.target.value === '' ? '' : Number(event.target.value)
                }))
              }
            />
          </FormField>

          <FormField label="상환방식">
            <select
              value={form.repaymentMethod}
              onChange={(event) => setForm((prev) => ({ ...prev, repaymentMethod: event.target.value }))}
            >
              {REPAYMENT_METHODS.map((method) => (
                <option key={method.value} value={method.value}>{method.label}</option>
              ))}
            </select>
          </FormField>

          <FormField label="월 상환액">
            <input
              type="number"
              min={0}
              placeholder="월 상환액"
              value={form.monthlyPayment}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  monthlyPayment: event.target.value === '' ? '' : Number(event.target.value)
                }))
              }
            />
          </FormField>

          <FormField label="대출 시작일">
            <input
              type="date"
              value={form.startDate}
              onChange={(event) => setForm((prev) => ({ ...prev, startDate: event.target.value }))}
            />
          </FormField>

          <FormField label="만기일">
            <input
              type="date"
              value={form.maturityDate}
              onChange={(event) => setForm((prev) => ({ ...prev, maturityDate: event.target.value }))}
            />
          </FormField>

          <FormField label="대출기간(개월)">
            <input
              type="number"
              min={0}
              max={600}
              placeholder="예: 360"
              value={form.loanTerm}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  loanTerm: event.target.value === '' ? '' : Number(event.target.value)
                }))
              }
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

      <div className="mt-4 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))] max-w-[980px]">
        <div className="rounded-xl border border-[var(--line)] p-3">
          <p className="helper-text m-0">총 부채</p>
          <p className="m-0 mt-1 text-[1.1rem] font-bold">{totalLiabilities.toLocaleString()}원</p>
        </div>
        <div className="rounded-xl border border-[var(--line)] p-3">
          <p className="helper-text m-0">월 상환 합계</p>
          <p className="m-0 mt-1 text-[1.1rem] font-bold">{totalMonthlyPayment.toLocaleString()}원</p>
        </div>
        {weightedAvgRate !== null && (
          <div className="rounded-xl border border-[var(--line)] p-3">
            <p className="helper-text m-0">가중 평균 이자율</p>
            <p className="m-0 mt-1 text-[1.1rem] font-bold">{weightedAvgRate}%</p>
          </div>
        )}
      </div>

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
              header: '잔액',
              align: 'right',
              render: (liability) => `${liability.amount.toLocaleString()}원`,
            },
            {
              key: 'interestRate',
              header: '이자율',
              align: 'right',
              render: (liability) =>
                liability.interestRate != null ? `${liability.interestRate}%` : '-',
            },
            {
              key: 'repaymentMethod',
              header: '상환방식',
              render: (liability) => liability.repaymentMethod || '-',
            },
            {
              key: 'monthlyPayment',
              header: '월 상환액',
              align: 'right',
              render: (liability) =>
                liability.monthlyPayment ? `${liability.monthlyPayment.toLocaleString()}원` : '-',
            },
            {
              key: 'maturityDate',
              header: '만기일',
              render: (liability) => liability.maturityDate || '-',
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
