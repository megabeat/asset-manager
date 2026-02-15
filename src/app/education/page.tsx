'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, EducationPlan, EducationSimulationResult, Profile } from '@/lib/api';
import { SectionCard } from '@/components/ui/SectionCard';
import { FormField } from '@/components/ui/FormField';
import { DataTable } from '@/components/ui/DataTable';
import { useFeedbackMessage } from '@/hooks/useFeedbackMessage';

type ProfileChild = {
  id: string;
  name: string;
  birthDate: string;
  age: number | null;
  targetUniversityYear?: number;
};

type PlanForm = {
  childId: string;
  annualCost: number;
  inflationRate: number;
  startYear: number;
  endYear: number;
};

const currentYear = new Date().getFullYear();

const defaultPlanForm: PlanForm = {
  childId: '',
  annualCost: 10000000,
  inflationRate: 0.03,
  startYear: currentYear,
  endYear: currentYear + 4
};

export default function EducationPage() {
  const [children, setChildren] = useState<ProfileChild[]>([]);
  const [plans, setPlans] = useState<EducationPlan[]>([]);
  const [planForm, setPlanForm] = useState<PlanForm>(defaultPlanForm);
  const [simulation, setSimulation] = useState<EducationSimulationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [planErrors, setPlanErrors] = useState<Record<string, string>>({});
  const { message, clearMessage, setMessageText, setSuccessMessage, setErrorMessage } = useFeedbackMessage();

  function getAgeFromBirthDate(birthDate?: string): number | null {
    if (!birthDate) return null;
    const birth = new Date(birthDate);
    if (Number.isNaN(birth.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    const dayDiff = today.getDate() - birth.getDate();
    if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
      age -= 1;
    }
    return age >= 0 ? age : null;
  }

  function buildProfileChildren(profile: Profile | null): ProfileChild[] {
    if (!profile) return [];

    const rows: ProfileChild[] = [];
    if (profile.child1Name && profile.child1BirthDate) {
      rows.push({
        id: 'profile-child-1',
        name: profile.child1Name,
        birthDate: profile.child1BirthDate,
        age: getAgeFromBirthDate(profile.child1BirthDate),
        targetUniversityYear: profile.child1TargetUniversityYear
      });
    }

    if (profile.child2Name && profile.child2BirthDate) {
      rows.push({
        id: 'profile-child-2',
        name: profile.child2Name,
        birthDate: profile.child2BirthDate,
        age: getAgeFromBirthDate(profile.child2BirthDate),
        targetUniversityYear: profile.child2TargetUniversityYear
      });
    }

    return rows;
  }

  const selectedChildName = useMemo(
    () => children.find((child) => child.id === planForm.childId)?.name ?? '-',
    [children, planForm.childId]
  );

  async function loadAll() {
    const [profileResult, plansResult] = await Promise.all([
      api.getProfile(),
      api.getEducationPlans()
    ]);

    if (profileResult.data) {
      const childrenData = buildProfileChildren(profileResult.data);
      setChildren(childrenData);
      if (!planForm.childId && childrenData.length > 0) {
        setPlanForm((prev) => ({ ...prev, childId: childrenData[0].id }));
      }
    } else {
      setChildren([]);
    }

    if (plansResult.data) {
      setPlans(plansResult.data);
    }

    const profileError = profileResult.error?.code === 'NOT_FOUND' ? null : profileResult.error;
    const firstError = profileError ?? plansResult.error;
    if (firstError) {
      setErrorMessage('조회 실패', firstError);
    }
  }

  useEffect(() => {
    loadAll().finally(() => {
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!planForm.childId) return;
    const selectedChild = children.find((child) => child.id === planForm.childId);
    if (!selectedChild?.targetUniversityYear) return;
    setPlanForm((prev) => ({
      ...prev,
      startYear: selectedChild.targetUniversityYear!,
      endYear: selectedChild.targetUniversityYear! + 4
    }));
  }, [planForm.childId, children]);

  async function onCreatePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearMessage();
    const nextErrors: Record<string, string> = {};
    if (!planForm.childId) nextErrors.childId = '대상 자녀를 선택해주세요.';
    if (!Number.isFinite(planForm.annualCost) || planForm.annualCost <= 0) {
      nextErrors.annualCost = '연간비용은 0보다 커야 합니다.';
    }
    if (!Number.isFinite(planForm.inflationRate) || planForm.inflationRate < 0 || planForm.inflationRate > 1) {
      nextErrors.inflationRate = '물가상승률은 0~1 사이여야 합니다.';
    }
    if (!Number.isFinite(planForm.startYear) || !Number.isFinite(planForm.endYear)) {
      nextErrors.years = '기간을 확인해주세요.';
    } else if (planForm.endYear < planForm.startYear) {
      nextErrors.years = '종료연도는 시작연도 이후여야 합니다.';
    }

    setPlanErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setMessageText('계획 입력값을 확인해주세요.');
      return;
    }

    const result = await api.createEducationPlan(planForm);
    if (result.error) {
      setErrorMessage('계획 저장 실패', result.error);
      return;
    }

    setSuccessMessage('교육비 계획이 저장되었습니다.');
    await loadAll();
  }

  async function onSimulate(planId: string) {
    const plan = plans.find((item) => item.id === planId);
    if (!plan) return;

    const result = await api.simulateEducation(planId, {
      startYear: plan.startYear,
      endYear: plan.endYear,
      annualCost: plan.annualCost,
      inflationRate: plan.inflationRate
    });

    if (result.error) {
      setErrorMessage('시뮬레이션 실패', result.error);
      return;
    }

    setSimulation(result.data);
  }

  async function onDeletePlan(planId: string) {
    const result = await api.deleteEducationPlan(planId);
    if (result.error) {
      setErrorMessage('삭제 실패', result.error);
      return;
    }

    setPlans((prev) => prev.filter((plan) => plan.id !== planId));
  }

  if (loading) {
    return <div className="p-8">로딩 중...</div>;
  }

  return (
    <div className="py-4">
      <h1>교육비 시뮬레이션</h1>

      <SectionCard className="mt-5 max-w-[980px]">
        <h3 className="mb-3 mt-0">설정에서 불러온 자녀 정보</h3>
        {children.length === 0 ? (
          <p className="helper-text">설정 페이지에서 자녀 이름/생년월일을 입력하면 여기 자동 반영됩니다.</p>
        ) : (
          <div className="grid gap-3">
            {children.map((child) => (
              <div key={child.id} className="rounded-xl border border-[var(--line)] p-4">
                <strong>{child.name}</strong>
                <p className="helper-text mt-1.5">
                  생년월일: {child.birthDate} / 나이: {child.age !== null ? `${child.age}세` : '-'}
                </p>
                <p className="helper-text mt-0.5">
                  예상 대학 진학년도: {child.targetUniversityYear ? `${child.targetUniversityYear}년` : '-'}
                </p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard className="mt-6 max-w-[980px]">
        <h3 className="mb-3 mt-0">교육비 계획 등록</h3>
        <form onSubmit={onCreatePlan} className="form-grid [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]">
          <FormField label="자녀" error={planErrors.childId}>
            <select value={planForm.childId} onChange={(e) => setPlanForm((p) => ({ ...p, childId: e.target.value }))} className={planErrors.childId ? 'border-red-700' : ''}>
              <option value="">자녀 선택</option>
              {children.map((child) => (
                <option key={child.id} value={child.id}>{child.name}</option>
              ))}
            </select>
          </FormField>
          <FormField label="연간비용" error={planErrors.annualCost}>
            <input type="number" value={planForm.annualCost} onChange={(e) => setPlanForm((p) => ({ ...p, annualCost: Number(e.target.value || 0) }))} placeholder="연간비용" className={planErrors.annualCost ? 'border-red-700' : ''} />
          </FormField>
          <FormField label="물가상승률(0~1)" error={planErrors.inflationRate}>
            <input type="number" step="0.01" min="0" max="1" value={planForm.inflationRate} onChange={(e) => setPlanForm((p) => ({ ...p, inflationRate: Number(e.target.value || 0) }))} placeholder="물가상승률" className={planErrors.inflationRate ? 'border-red-700' : ''} />
          </FormField>
          <FormField label="시작연도" error={planErrors.years}>
            <input type="number" value={planForm.startYear} onChange={(e) => setPlanForm((p) => ({ ...p, startYear: Number(e.target.value || currentYear) }))} placeholder="시작연도" className={planErrors.years ? 'border-red-700' : ''} />
          </FormField>
          <FormField label="종료연도" error={planErrors.years}>
            <input type="number" value={planForm.endYear} onChange={(e) => setPlanForm((p) => ({ ...p, endYear: Number(e.target.value || currentYear) }))} placeholder="종료연도" className={planErrors.years ? 'border-red-700' : ''} />
          </FormField>
          <button type="submit" className="btn-primary w-[140px] self-end">계획 추가</button>
        </form>
      </SectionCard>

      {message && <p className="mt-4">{message}</p>}

      <SectionCard className="mt-4">
        <h2>교육비 계획 목록</h2>
        <DataTable
          rows={plans}
          rowKey={(plan) => plan.id}
          emptyMessage="등록된 계획이 없습니다."
          columns={[
            {
              key: 'child',
              header: '자녀',
              render: (plan) => children.find((child) => child.id === plan.childId)?.name ?? plan.childId,
            },
            {
              key: 'annualCost',
              header: '연간비용',
              align: 'right',
              render: (plan) => `${plan.annualCost.toLocaleString()}원`,
            },
            {
              key: 'years',
              header: '기간',
              align: 'center',
              render: (plan) => `${plan.startYear}~${plan.endYear}`,
            },
            {
              key: 'actions',
              header: '관리',
              align: 'center',
              render: (plan) => (
                <div className="flex justify-center gap-1.5">
                  <button className="btn-subtle" onClick={() => onSimulate(plan.id)}>시뮬</button>
                  <button className="btn-danger-outline" onClick={() => onDeletePlan(plan.id)}>삭제</button>
                </div>
              ),
            },
          ]}
        />
      </SectionCard>

      {simulation && (
        <SectionCard className="mt-4">
          <h3 className="mt-0">시뮬레이션 결과 ({selectedChildName})</h3>
          <p>총 예상 비용: {simulation.totalCost.toLocaleString()}원</p>
          <DataTable
            rows={simulation.yearly}
            rowKey={(row) => String(row.year)}
            columns={[
              { key: 'year', header: '연도', render: (row) => row.year },
              {
                key: 'cost',
                header: '예상비용',
                align: 'right',
                render: (row) => `${row.cost.toLocaleString()}원`,
              },
            ]}
          />
        </SectionCard>
      )}
    </div>
  );
}
