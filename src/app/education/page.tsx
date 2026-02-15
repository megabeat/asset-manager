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
        age: getAgeFromBirthDate(profile.child1BirthDate)
      });
    }

    if (profile.child2Name && profile.child2BirthDate) {
      rows.push({
        id: 'profile-child-2',
        name: profile.child2Name,
        birthDate: profile.child2BirthDate,
        age: getAgeFromBirthDate(profile.child2BirthDate)
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
    return <div style={{ padding: '2rem' }}>로딩 중...</div>;
  }

  return (
    <div style={{ padding: '1rem 0' }}>
      <h1>교육비 시뮬레이션</h1>

      <SectionCard style={{ marginTop: '1.25rem', maxWidth: 980 }}>
        <h3 style={{ marginTop: 0, marginBottom: '0.75rem' }}>설정에서 불러온 자녀 정보</h3>
        {children.length === 0 ? (
          <p className="helper-text">설정 페이지에서 자녀 이름/생년월일을 입력하면 여기 자동 반영됩니다.</p>
        ) : (
          <div style={{ display: 'grid', gap: '0.7rem' }}>
            {children.map((child) => (
              <div key={child.id} style={{ padding: '0.9rem', border: '1px solid var(--line)', borderRadius: 10 }}>
                <strong>{child.name}</strong>
                <p className="helper-text" style={{ marginTop: '0.35rem' }}>
                  생년월일: {child.birthDate} / 나이: {child.age !== null ? `${child.age}세` : '-'}
                </p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard style={{ marginTop: '1.5rem', maxWidth: 980 }}>
        <h3 style={{ marginTop: 0, marginBottom: '0.75rem' }}>교육비 계획 등록</h3>
        <form onSubmit={onCreatePlan} className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          <FormField label="자녀" error={planErrors.childId}>
            <select value={planForm.childId} onChange={(e) => setPlanForm((p) => ({ ...p, childId: e.target.value }))} style={planErrors.childId ? { borderColor: '#b91c1c' } : undefined}>
              <option value="">자녀 선택</option>
              {children.map((child) => (
                <option key={child.id} value={child.id}>{child.name}</option>
              ))}
            </select>
          </FormField>
          <FormField label="연간비용" error={planErrors.annualCost}>
            <input type="number" value={planForm.annualCost} onChange={(e) => setPlanForm((p) => ({ ...p, annualCost: Number(e.target.value || 0) }))} placeholder="연간비용" style={planErrors.annualCost ? { borderColor: '#b91c1c' } : undefined} />
          </FormField>
          <FormField label="물가상승률(0~1)" error={planErrors.inflationRate}>
            <input type="number" step="0.01" min="0" max="1" value={planForm.inflationRate} onChange={(e) => setPlanForm((p) => ({ ...p, inflationRate: Number(e.target.value || 0) }))} placeholder="물가상승률" style={planErrors.inflationRate ? { borderColor: '#b91c1c' } : undefined} />
          </FormField>
          <FormField label="시작연도" error={planErrors.years}>
            <input type="number" value={planForm.startYear} onChange={(e) => setPlanForm((p) => ({ ...p, startYear: Number(e.target.value || currentYear) }))} placeholder="시작연도" style={planErrors.years ? { borderColor: '#b91c1c' } : undefined} />
          </FormField>
          <FormField label="종료연도" error={planErrors.years}>
            <input type="number" value={planForm.endYear} onChange={(e) => setPlanForm((p) => ({ ...p, endYear: Number(e.target.value || currentYear) }))} placeholder="종료연도" style={planErrors.years ? { borderColor: '#b91c1c' } : undefined} />
          </FormField>
          <button type="submit" className="btn-primary" style={{ width: 140, alignSelf: 'end' }}>계획 추가</button>
        </form>
      </SectionCard>

      {message && <p style={{ marginTop: '1rem' }}>{message}</p>}

      <SectionCard style={{ marginTop: '1rem' }}>
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
                <div style={{ display: 'flex', justifyContent: 'center', gap: '0.4rem' }}>
                  <button className="btn-subtle" onClick={() => onSimulate(plan.id)} style={{ padding: '0.35rem 0.6rem' }}>시뮬</button>
                  <button className="btn-danger-outline" onClick={() => onDeletePlan(plan.id)}>삭제</button>
                </div>
              ),
            },
          ]}
        />
      </SectionCard>

      {simulation && (
        <SectionCard style={{ marginTop: '1rem' }}>
          <h3 style={{ marginTop: 0 }}>시뮬레이션 결과 ({selectedChildName})</h3>
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
