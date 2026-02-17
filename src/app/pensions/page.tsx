'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, Asset } from '@/lib/api';
import { FeedbackBanner } from '@/components/ui/FeedbackBanner';
import { useFeedbackMessage } from '@/hooks/useFeedbackMessage';
import { SectionCard } from '@/components/ui/SectionCard';
import { FormField } from '@/components/ui/FormField';
import { DataTable } from '@/components/ui/DataTable';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from 'recharts';

type NumericInput = number | '';
type PensionCategory = 'pension_national' | 'pension_personal' | 'pension_retirement' | 'pension_government';

type PensionForm = {
  category: PensionCategory;
  name: string;
  currentValue: NumericInput;
  valuationDate: string;
  pensionMonthlyContribution: NumericInput;
  pensionReceiveAge: NumericInput;
  pensionReceiveStart: string;
  note: string;
  owner: string;
};

const pensionCategoryLabel: Record<PensionCategory, string> = {
  pension_national: '국민연금',
  pension_personal: '개인연금',
  pension_retirement: '퇴직연금(IPA)',
  pension_government: '공무원연금'
};

const defaultForm: PensionForm = {
  category: 'pension_national',
  name: '국민연금',
  currentValue: '',
  valuationDate: new Date().toISOString().slice(0, 10),
  pensionMonthlyContribution: '',
  pensionReceiveAge: 60,
  pensionReceiveStart: '',
  note: '',
  owner: '본인'
};

const COLORS = ['#0b63ce', '#2e7d32', '#f57c00', '#8e24aa'];

function isPensionCategory(category?: string): boolean {
  return (
    category === 'pension' ||
    category === 'pension_national' ||
    category === 'pension_personal' ||
    category === 'pension_retirement' ||
    category === 'pension_government'
  );
}

function normalizePensionCategory(category?: string): PensionCategory {
  if (category === 'pension_personal') return 'pension_personal';
  if (category === 'pension_retirement') return 'pension_retirement';
  if (category === 'pension_government') return 'pension_government';
  return 'pension_national';
}

export default function PensionsPage() {
  const [pensions, setPensions] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [form, setForm] = useState<PensionForm>(defaultForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { message, feedback, clearMessage, setMessageText, setSuccessMessage, setErrorMessage } = useFeedbackMessage();

  async function loadPensions() {
    const result = await api.getAssets();
    if (result.data) {
      setPensions(result.data.filter((asset) => isPensionCategory(asset.category)));
    }
    if (result.error) {
      setErrorMessage('조회 실패', result.error);
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

  const governmentPensionValue = useMemo(
    () =>
      pensions
        .filter((item) => normalizePensionCategory(item.category) === 'pension_government')
        .reduce((sum, item) => sum + Number(item.currentValue ?? 0), 0),
    [pensions]
  );

  const nationalPensionRatio = totalPensionValue > 0 ? (nationalPensionValue / totalPensionValue) * 100 : 0;
  const personalPensionRatio = totalPensionValue > 0 ? (personalPensionValue / totalPensionValue) * 100 : 0;
  const retirementPensionRatio = totalPensionValue > 0 ? (retirementPensionValue / totalPensionValue) * 100 : 0;
  const governmentPensionRatio = totalPensionValue > 0 ? (governmentPensionValue / totalPensionValue) * 100 : 0;

  const pensionSplitData = useMemo(
    () => [
      { name: '국민연금', value: nationalPensionValue },
      { name: '개인연금', value: personalPensionValue },
      { name: '퇴직연금(IPA)', value: retirementPensionValue },
      { name: '공무원연금', value: governmentPensionValue }
    ].filter((item) => item.value > 0),
    [nationalPensionValue, personalPensionValue, retirementPensionValue, governmentPensionValue]
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearMessage();

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
      setMessageText('입력값을 확인해주세요.');
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
      pensionReceiveStart: form.pensionReceiveStart,
      owner: form.owner
    };

    const result = editingAssetId
      ? await api.updateAsset(editingAssetId, payload)
      : await api.createAsset(payload);

    if (result.error) {
      setErrorMessage(editingAssetId ? '수정 실패' : '저장 실패', result.error);
    } else {
      setEditingAssetId(null);
      setForm(defaultForm);
      setSuccessMessage(editingAssetId ? '연금 자산이 수정되었습니다.' : '연금 자산이 저장되었습니다.');
      await loadPensions();
    }

    setSaving(false);
  }

  function onEdit(asset: Asset) {
    setEditingAssetId(asset.id);
    setErrors({});
    clearMessage();
    setForm({
      category: normalizePensionCategory(asset.category),
      name: asset.name ?? '',
      currentValue: Number(asset.currentValue ?? 0),
      valuationDate: asset.valuationDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
      pensionMonthlyContribution: Number(asset.pensionMonthlyContribution ?? 0),
      pensionReceiveAge: Number(asset.pensionReceiveAge ?? 60),
      pensionReceiveStart: asset.pensionReceiveStart ?? '',
      note: asset.note ?? '',
      owner: asset.owner ?? '본인'
    });
  }

  function onCancelEdit() {
    setEditingAssetId(null);
    setErrors({});
    setForm(defaultForm);
  }

  async function onDelete(id: string) {
    if (!confirm('이 연금 자산을 삭제하시겠습니까?')) return;
    clearMessage();
    const result = await api.deleteAsset(id);
    if (result.error) {
      setErrorMessage('삭제 실패', result.error);
      return;
    }
    setPensions((prev) => prev.filter((item) => item.id !== id));
  }

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="py-4">
      <h1>연금관리</h1>
      <p className="helper-text mt-1.5">
        국민연금 / 개인연금 / 퇴직연금(IPA) / 공무원연금을 분리 관리하고, 총액과 비중을 한 화면에서 확인합니다.
      </p>

      <div className="form-grid mt-4">
        <SectionCard>
          <p className="helper-text">전체 연금 자산</p>
          <h2 className="m-0">{totalPensionValue.toLocaleString()}원</h2>
          <p className="helper-text mt-1.5">연금 4유형 합산</p>
        </SectionCard>
        <SectionCard>
          <p className="helper-text">국민연금</p>
          <h2 className="m-0">{nationalPensionValue.toLocaleString()}원</h2>
          <p className="helper-text mt-1.5">{nationalPensionRatio.toFixed(1)}%</p>
        </SectionCard>
        <SectionCard>
          <p className="helper-text">개인연금</p>
          <h2 className="m-0">{personalPensionValue.toLocaleString()}원</h2>
          <p className="helper-text mt-1.5">{personalPensionRatio.toFixed(1)}%</p>
        </SectionCard>
        <SectionCard>
          <p className="helper-text">퇴직연금(IPA)</p>
          <h2 className="m-0">{retirementPensionValue.toLocaleString()}원</h2>
          <p className="helper-text mt-1.5">{retirementPensionRatio.toFixed(1)}%</p>
        </SectionCard>
        <SectionCard>
          <p className="helper-text">공무원연금</p>
          <h2 className="m-0">{governmentPensionValue.toLocaleString()}원</h2>
          <p className="helper-text mt-1.5">{governmentPensionRatio.toFixed(1)}%</p>
        </SectionCard>
      </div>

      <SectionCard className="mt-4">
        <h3 className="mb-3 mt-0">연금 자산 입력</h3>
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
              <option value="pension_government">공무원연금</option>
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

          <div className="flex items-end gap-2">
            <button type="submit" disabled={saving} className="btn-primary w-[180px]">
              {saving ? '저장 중...' : editingAssetId ? '연금 수정' : '연금 추가'}
            </button>
            {editingAssetId ? (
              <button type="button" onClick={onCancelEdit} className="btn-danger-outline w-[120px]">
                취소
              </button>
            ) : null}
          </div>
        </form>
      </SectionCard>

      <FeedbackBanner feedback={feedback} />

      <SectionCard className="mt-4">
        <h3 className="mb-3 mt-0">연금 자산 목록</h3>
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
              render: (asset) =>
                `월납입 ${Number(asset.pensionMonthlyContribution ?? 0).toLocaleString()}원 / 수령 ${Number(asset.pensionReceiveAge ?? 0)}세`,
            },
            {
              key: 'start',
              header: '수령시작',
              render: (asset) => asset.pensionReceiveStart || '-',
            },
            {
              key: 'value',
              header: '현재가치',
              align: 'right',
              render: (asset) => `${Number(asset.currentValue ?? 0).toLocaleString()}원`,
            },
            {
              key: 'owner',
              header: '소유자',
              align: 'center',
              render: (asset) => asset.owner ?? '본인',
            },
            {
              key: 'actions',
              header: '관리',
              align: 'center',
              render: (asset) => (
                <div className="flex justify-center gap-1.5">
                  <button onClick={() => onEdit(asset)} className="btn-primary">수정</button>
                  <button onClick={() => onDelete(asset.id)} className="btn-danger-outline">삭제</button>
                </div>
              ),
            },
          ]}
        />
      </SectionCard>

      <SectionCard className="mt-4">
        <h3 className="mb-3 mt-0">연금 유형별 비중</h3>
        {pensionSplitData.length === 0 ? (
          <p>연금 데이터가 없습니다.</p>
        ) : (
          <div className="h-[300px] w-full">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={pensionSplitData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={95}
                  paddingAngle={2}
                >
                  {pensionSplitData.map((_, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => `${Number(value).toLocaleString()}원`} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
