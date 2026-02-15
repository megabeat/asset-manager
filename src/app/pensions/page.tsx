'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, Asset } from '@/lib/api';
import { SectionCard } from '@/components/ui/SectionCard';
import { FormField } from '@/components/ui/FormField';
import { DataTable } from '@/components/ui/DataTable';

type NumericInput = number | '';
type PensionCategory = 'pension_national' | 'pension_personal' | 'pension_retirement';

type PensionForm = {
  category: PensionCategory;
  name: string;
  currentValue: NumericInput;
  valuationDate: string;
  pensionMonthlyContribution: NumericInput;
  pensionReceiveAge: NumericInput;
  pensionReceiveStart: string;
  note: string;
};

const pensionCategoryLabel: Record<PensionCategory, string> = {
  pension_national: '국민연금',
  pension_personal: '개인연금',
  pension_retirement: '퇴직연금(IPA)'
};

const defaultForm: PensionForm = {
  category: 'pension_national',
  name: '국민연금',
  currentValue: '',
  valuationDate: new Date().toISOString().slice(0, 10),
  pensionMonthlyContribution: '',
  pensionReceiveAge: 60,
  pensionReceiveStart: '',
  note: ''
};

function isPensionCategory(category?: string): boolean {
  return (
    category === 'pension' ||
    category === 'pension_national' ||
    category === 'pension_personal' ||
    category === 'pension_retirement'
  );
}

function normalizePensionCategory(category?: string): PensionCategory {
  if (category === 'pension_personal') return 'pension_personal';
  if (category === 'pension_retirement') return 'pension_retirement';
  return 'pension_national';
}

export default function PensionsPage() {
  const [pensions, setPensions] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [form, setForm] = useState<PensionForm>(defaultForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  async function loadPensions() {
    const result = await api.getAssets();
    if (result.data) {
      setPensions(result.data.filter((asset) => isPensionCategory(asset.category)));
    }
    if (result.error) {
      setMessage(`조회 실패: ${result.error.message}`);
    }
  }

  useEffect(() => {
    loadPensions().finally(() => setLoading(false));
  }, []);

  const totalPensionValue = useMemo(
    () => pensions.reduce((sum, item) => sum + Number(item.currentValue ?? 0), 0),
    [pensions]
  );

  const nationalPensionValue = useMemo(
    () =>
      pensions
        .filter((item) => normalizePensionCategory(item.category) === 'pension_national')
        .reduce((sum, item) => sum + Number(item.currentValue ?? 0), 0),
    [pensions]
  );

  const personalPensionValue = useMemo(
    () =>
      pensions
        .filter((item) => normalizePensionCategory(item.category) === 'pension_personal')
        .reduce((sum, item) => sum + Number(item.currentValue ?? 0), 0),
    [pensions]
  );

  const retirementPensionValue = useMemo(
    () =>
      pensions
        .filter((item) => normalizePensionCategory(item.category) === 'pension_retirement')
        .reduce((sum, item) => sum + Number(item.currentValue ?? 0), 0),
    [pensions]
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    const nextErrors: Record<string, string> = {};
    const currentValue = Number(form.currentValue || 0);
    const monthlyContribution = Number(form.pensionMonthlyContribution || 0);
    const receiveAge = Number(form.pensionReceiveAge || 0);

    if (!form.name.trim()) nextErrors.name = '연금명을 입력해주세요.';
    if (!form.valuationDate) nextErrors.valuationDate = '평가일을 선택해주세요.';
    if (currentValue < 0) nextErrors.currentValue = '현재가치는 0 이상이어야 합니다.';
    if (monthlyContribution < 0) nextErrors.pensionMonthlyContribution = '월 납입액은 0 이상이어야 합니다.';
    if (receiveAge < 40 || receiveAge > 100) nextErrors.pensionReceiveAge = '수령 나이는 40~100 범위입니다.';
    if (!form.pensionReceiveStart) nextErrors.pensionReceiveStart = '수령 시작 시기를 입력해주세요.';

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setMessage('입력값을 확인해주세요.');
      return;
    }

    setSaving(true);
    const payload = {
      category: form.category,
      name: form.name.trim(),
      currentValue,
      valuationDate: form.valuationDate,
      note: form.note.trim(),
      pensionMonthlyContribution: monthlyContribution,
      pensionReceiveAge: receiveAge,
      pensionReceiveStart: form.pensionReceiveStart
    };

    const result = editingAssetId
      ? await api.updateAsset(editingAssetId, payload)
      : await api.createAsset(payload);

    if (result.error) {
      setMessage(`${editingAssetId ? '수정' : '저장'} 실패: ${result.error.message}`);
    } else {
      setEditingAssetId(null);
      setForm(defaultForm);
      setMessage(editingAssetId ? '연금 자산이 수정되었습니다.' : '연금 자산이 저장되었습니다.');
      await loadPensions();
    }

    setSaving(false);
  }

  function onEdit(asset: Asset) {
    setEditingAssetId(asset.id);
    setErrors({});
    setMessage(null);
    setForm({
      category: normalizePensionCategory(asset.category),
      name: asset.name ?? '',
      currentValue: Number(asset.currentValue ?? 0),
      valuationDate: asset.valuationDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
      pensionMonthlyContribution: Number(asset.pensionMonthlyContribution ?? 0),
      pensionReceiveAge: Number(asset.pensionReceiveAge ?? 60),
      pensionReceiveStart: asset.pensionReceiveStart ?? '',
      note: asset.note ?? ''
    });
  }

  function onCancelEdit() {
    setEditingAssetId(null);
    setErrors({});
    setForm(defaultForm);
  }

  async function onDelete(id: string) {
    setMessage(null);
    const result = await api.deleteAsset(id);
    if (result.error) {
      setMessage(`삭제 실패: ${result.error.message}`);
      return;
    }
    setPensions((prev) => prev.filter((item) => item.id !== id));
  }

  if (loading) {
    return <div style={{ padding: '2rem' }}>로딩 중...</div>;
  }

  return (
    <div style={{ padding: '1rem 0' }}>
      <h1>연금 관리</h1>

      <div className="form-grid" style={{ marginTop: '1rem' }}>
        <SectionCard>
          <p className="helper-text">전체 연금 자산</p>
          <h2 style={{ margin: 0 }}>{totalPensionValue.toLocaleString()}원</h2>
        </SectionCard>
        <SectionCard>
          <p className="helper-text">국민연금</p>
          <h2 style={{ margin: 0 }}>{nationalPensionValue.toLocaleString()}원</h2>
        </SectionCard>
        <SectionCard>
          <p className="helper-text">개인연금</p>
          <h2 style={{ margin: 0 }}>{personalPensionValue.toLocaleString()}원</h2>
        </SectionCard>
        <SectionCard>
          <p className="helper-text">퇴직연금(IPA)</p>
          <h2 style={{ margin: 0 }}>{retirementPensionValue.toLocaleString()}원</h2>
        </SectionCard>
      </div>

      <SectionCard style={{ marginTop: '1rem' }}>
        <form onSubmit={onSubmit} className="form-grid">
          <FormField label="연금 유형">
            <select
              value={form.category}
              onChange={(event) => {
                const category = event.target.value as PensionCategory;
                setForm((prev) => ({
                  ...prev,
                  category,
                  name: pensionCategoryLabel[category]
                }));
              }}
            >
              <option value="pension_national">국민연금</option>
              <option value="pension_personal">개인연금</option>
              <option value="pension_retirement">퇴직연금(IPA)</option>
            </select>
          </FormField>

          <FormField label="연금명" error={errors.name}>
            <input
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="예: 국민연금"
            />
          </FormField>

          <FormField label="현재가치(원)" error={errors.currentValue}>
            <input
              type="number"
              min={0}
              value={form.currentValue}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  currentValue: event.target.value === '' ? '' : Number(event.target.value)
                }))
              }
            />
          </FormField>

          <FormField label="월 납입액(원)" error={errors.pensionMonthlyContribution}>
            <input
              type="number"
              min={0}
              value={form.pensionMonthlyContribution}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  pensionMonthlyContribution: event.target.value === '' ? '' : Number(event.target.value)
                }))
              }
            />
          </FormField>

          <FormField label="수령 나이" error={errors.pensionReceiveAge}>
            <input
              type="number"
              min={40}
              max={100}
              value={form.pensionReceiveAge}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  pensionReceiveAge: event.target.value === '' ? '' : Number(event.target.value)
                }))
              }
            />
          </FormField>

          <FormField label="수령 시작 시기" error={errors.pensionReceiveStart}>
            <input
              type="month"
              value={form.pensionReceiveStart}
              onChange={(event) => setForm((prev) => ({ ...prev, pensionReceiveStart: event.target.value }))}
            />
          </FormField>

          <FormField label="평가일" error={errors.valuationDate}>
            <input
              type="date"
              value={form.valuationDate}
              onChange={(event) => setForm((prev) => ({ ...prev, valuationDate: event.target.value }))}
            />
          </FormField>

          <FormField label="메모" fullWidth>
            <input
              value={form.note}
              onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
              placeholder="선택 입력"
            />
          </FormField>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'end' }}>
            <button type="submit" disabled={saving} className="btn-primary" style={{ width: 180 }}>
              {saving ? '저장 중...' : editingAssetId ? '연금 수정' : '연금 추가'}
            </button>
            {editingAssetId ? (
              <button type="button" onClick={onCancelEdit} className="btn-danger-outline" style={{ width: 120 }}>
                취소
              </button>
            ) : null}
          </div>
        </form>
      </SectionCard>

      {message && <p style={{ marginTop: '1rem' }}>{message}</p>}

      <SectionCard style={{ marginTop: '1rem' }}>
        <DataTable
          rows={pensions}
          rowKey={(asset) => asset.id}
          emptyMessage="등록된 연금 자산이 없습니다."
          columns={[
            { key: 'name', header: '연금명', render: (asset) => asset.name },
            {
              key: 'category',
              header: '유형',
              render: (asset) => pensionCategoryLabel[normalizePensionCategory(asset.category)],
            },
            {
              key: 'meta',
              header: '상세',
              render: (asset) => `월납입 ${Number(asset.pensionMonthlyContribution ?? 0).toLocaleString()}원`,
            },
            {
              key: 'value',
              header: '현재가치',
              align: 'right',
              render: (asset) => `${Number(asset.currentValue ?? 0).toLocaleString()}원`,
            },
            {
              key: 'actions',
              header: '관리',
              align: 'center',
              render: (asset) => (
                <div style={{ display: 'flex', justifyContent: 'center', gap: '0.4rem' }}>
                  <button onClick={() => onEdit(asset)} className="btn-primary">수정</button>
                  <button onClick={() => onDelete(asset.id)} className="btn-danger-outline">삭제</button>
                </div>
              ),
            },
          ]}
        />
      </SectionCard>
    </div>
  );
}
