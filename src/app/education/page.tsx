'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, Child, EducationPlan, EducationSimulationResult } from '@/lib/api';

type ChildForm = {
  name: string;
  birthYear: number;
  grade: string;
  targetUniversityYear: number;
};

type PlanForm = {
  childId: string;
  annualCost: number;
  inflationRate: number;
  startYear: number;
  endYear: number;
};

const currentYear = new Date().getFullYear();

const defaultChildForm: ChildForm = {
  name: '',
  birthYear: currentYear - 10,
  grade: '초등 4',
  targetUniversityYear: currentYear + 8
};

const defaultPlanForm: PlanForm = {
  childId: '',
  annualCost: 10000000,
  inflationRate: 0.03,
  startYear: currentYear,
  endYear: currentYear + 4
};

export default function EducationPage() {
  const [children, setChildren] = useState<Child[]>([]);
  const [plans, setPlans] = useState<EducationPlan[]>([]);
  const [childForm, setChildForm] = useState<ChildForm>(defaultChildForm);
  const [planForm, setPlanForm] = useState<PlanForm>(defaultPlanForm);
  const [simulation, setSimulation] = useState<EducationSimulationResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const selectedChildName = useMemo(
    () => children.find((child) => child.id === planForm.childId)?.name ?? '-',
    [children, planForm.childId]
  );

  async function loadAll() {
    const [childrenResult, plansResult] = await Promise.all([
      api.getChildren(),
      api.getEducationPlans()
    ]);

    if (childrenResult.data) {
      const childrenData = childrenResult.data;
      setChildren(childrenData);
      if (!planForm.childId && childrenData.length > 0) {
        setPlanForm((prev) => ({ ...prev, childId: childrenData[0].id }));
      }
    }

    if (plansResult.data) {
      setPlans(plansResult.data);
    }

    const firstError = childrenResult.error ?? plansResult.error;
    if (firstError) {
      setMessage(`조회 실패: ${firstError.message}`);
    }
  }

  useEffect(() => {
    loadAll().finally(() => {
      setLoading(false);
    });
  }, []);

  async function onCreateChild(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    const result = await api.createChild({
      name: childForm.name.trim(),
      birthYear: childForm.birthYear,
      grade: childForm.grade.trim(),
      targetUniversityYear: childForm.targetUniversityYear
    });

    if (result.error) {
      setMessage(`자녀 저장 실패: ${result.error.message}`);
      return;
    }

    setChildForm(defaultChildForm);
    setMessage('자녀 정보가 저장되었습니다.');
    await loadAll();
  }

  async function onCreatePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    if (!planForm.childId) {
      setMessage('대상 자녀를 선택해주세요.');
      return;
    }

    const result = await api.createEducationPlan(planForm);
    if (result.error) {
      setMessage(`계획 저장 실패: ${result.error.message}`);
      return;
    }

    setMessage('교육비 계획이 저장되었습니다.');
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
      setMessage(`시뮬레이션 실패: ${result.error.message}`);
      return;
    }

    setSimulation(result.data);
  }

  async function onDeletePlan(planId: string) {
    const result = await api.deleteEducationPlan(planId);
    if (result.error) {
      setMessage(`삭제 실패: ${result.error.message}`);
      return;
    }

    setPlans((prev) => prev.filter((plan) => plan.id !== planId));
  }

  if (loading) {
    return <div style={{ padding: '2rem' }}>로딩 중...</div>;
  }

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>교육비 시뮬레이션</h1>

      <form
        onSubmit={onCreateChild}
        style={{ marginTop: '1.25rem', display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', maxWidth: 840 }}
      >
        <h3 style={{ gridColumn: '1 / -1', marginBottom: 0 }}>자녀 등록</h3>
        <input placeholder="이름" value={childForm.name} onChange={(e) => setChildForm((p) => ({ ...p, name: e.target.value }))} style={{ padding: '0.6rem', border: '1px solid #d0d0d0', borderRadius: 8 }} />
        <input type="number" placeholder="출생연도" value={childForm.birthYear} onChange={(e) => setChildForm((p) => ({ ...p, birthYear: Number(e.target.value || currentYear) }))} style={{ padding: '0.6rem', border: '1px solid #d0d0d0', borderRadius: 8 }} />
        <input placeholder="학년" value={childForm.grade} onChange={(e) => setChildForm((p) => ({ ...p, grade: e.target.value }))} style={{ padding: '0.6rem', border: '1px solid #d0d0d0', borderRadius: 8 }} />
        <input type="number" placeholder="대학진학 예상연도" value={childForm.targetUniversityYear} onChange={(e) => setChildForm((p) => ({ ...p, targetUniversityYear: Number(e.target.value || currentYear) }))} style={{ padding: '0.6rem', border: '1px solid #d0d0d0', borderRadius: 8 }} />
        <button type="submit" style={{ width: 140, padding: '0.65rem 0.9rem', borderRadius: 8, border: '1px solid #0b63ce', backgroundColor: '#0b63ce', color: '#fff' }}>자녀 추가</button>
      </form>

      <form
        onSubmit={onCreatePlan}
        style={{ marginTop: '1.5rem', display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', maxWidth: 980 }}
      >
        <h3 style={{ gridColumn: '1 / -1', marginBottom: 0 }}>교육비 계획 등록</h3>
        <select value={planForm.childId} onChange={(e) => setPlanForm((p) => ({ ...p, childId: e.target.value }))} style={{ padding: '0.6rem', border: '1px solid #d0d0d0', borderRadius: 8 }}>
          <option value="">자녀 선택</option>
          {children.map((child) => (
            <option key={child.id} value={child.id}>{child.name}</option>
          ))}
        </select>
        <input type="number" value={planForm.annualCost} onChange={(e) => setPlanForm((p) => ({ ...p, annualCost: Number(e.target.value || 0) }))} placeholder="연간비용" style={{ padding: '0.6rem', border: '1px solid #d0d0d0', borderRadius: 8 }} />
        <input type="number" step="0.01" min="0" max="1" value={planForm.inflationRate} onChange={(e) => setPlanForm((p) => ({ ...p, inflationRate: Number(e.target.value || 0) }))} placeholder="물가상승률" style={{ padding: '0.6rem', border: '1px solid #d0d0d0', borderRadius: 8 }} />
        <input type="number" value={planForm.startYear} onChange={(e) => setPlanForm((p) => ({ ...p, startYear: Number(e.target.value || currentYear) }))} placeholder="시작연도" style={{ padding: '0.6rem', border: '1px solid #d0d0d0', borderRadius: 8 }} />
        <input type="number" value={planForm.endYear} onChange={(e) => setPlanForm((p) => ({ ...p, endYear: Number(e.target.value || currentYear) }))} placeholder="종료연도" style={{ padding: '0.6rem', border: '1px solid #d0d0d0', borderRadius: 8 }} />
        <button type="submit" style={{ width: 140, padding: '0.65rem 0.9rem', borderRadius: 8, border: '1px solid #0b63ce', backgroundColor: '#0b63ce', color: '#fff' }}>계획 추가</button>
      </form>

      {message && <p style={{ marginTop: '1rem' }}>{message}</p>}

      <div style={{ marginTop: '2rem' }}>
        {children.length === 0 ? (
          <p>등록된 자녀가 없습니다.</p>
        ) : (
          <div style={{ display: 'grid', gap: '1rem' }}>
            {children.map((child) => (
              <div key={child.id} style={{ padding: '1.5rem', border: '1px solid #ddd', borderRadius: '8px' }}>
                <h3>{child.name}</h3>
                <p>출생연도: {child.birthYear}</p>
                <p>학년: {child.grade}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: '2rem' }}>
        <h2>교육비 계획 목록</h2>
        {plans.length === 0 ? (
          <p>등록된 계획이 없습니다.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #ddd' }}>
                <th style={{ padding: '0.8rem', textAlign: 'left' }}>자녀</th>
                <th style={{ padding: '0.8rem', textAlign: 'right' }}>연간비용</th>
                <th style={{ padding: '0.8rem', textAlign: 'center' }}>기간</th>
                <th style={{ padding: '0.8rem', textAlign: 'center' }}>관리</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => {
                const childName = children.find((child) => child.id === plan.childId)?.name ?? plan.childId;
                return (
                  <tr key={plan.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '0.8rem' }}>{childName}</td>
                    <td style={{ padding: '0.8rem', textAlign: 'right' }}>{plan.annualCost.toLocaleString()}원</td>
                    <td style={{ padding: '0.8rem', textAlign: 'center' }}>{plan.startYear}~{plan.endYear}</td>
                    <td style={{ padding: '0.8rem', textAlign: 'center', display: 'flex', justifyContent: 'center', gap: '0.4rem' }}>
                      <button onClick={() => onSimulate(plan.id)} style={{ padding: '0.35rem 0.6rem' }}>시뮬</button>
                      <button onClick={() => onDeletePlan(plan.id)} style={{ padding: '0.35rem 0.6rem', border: '1px solid #d32f2f', color: '#d32f2f', background: '#fff' }}>삭제</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {simulation && (
        <div style={{ marginTop: '2rem', border: '1px solid #ddd', borderRadius: 8, padding: '1rem' }}>
          <h3 style={{ marginTop: 0 }}>시뮬레이션 결과 ({selectedChildName})</h3>
          <p>총 예상 비용: {simulation.totalCost.toLocaleString()}원</p>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #ddd' }}>
                <th style={{ padding: '0.6rem', textAlign: 'left' }}>연도</th>
                <th style={{ padding: '0.6rem', textAlign: 'right' }}>예상비용</th>
              </tr>
            </thead>
            <tbody>
              {simulation.yearly.map((row) => (
                <tr key={row.year} style={{ borderBottom: '1px solid #f1f1f1' }}>
                  <td style={{ padding: '0.6rem' }}>{row.year}</td>
                  <td style={{ padding: '0.6rem', textAlign: 'right' }}>{row.cost.toLocaleString()}원</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
