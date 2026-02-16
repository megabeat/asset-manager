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

type PortfolioType = 'conservative' | 'balanced' | 'aggressive' | 'custom';

type PortfolioAllocation = {
  cash: number;
  bond: number;
  stockKr: number;
  stockUs: number;
  pension: number;
};

type AssetScenarioForm = {
  startingNetWorth: number;
  startYear: number;
  endYear: number;
  monthlySaving: number;
  monthlyInvestment: number;
  includeEducationCosts: boolean;
  portfolioType: PortfolioType;
  customAllocation: PortfolioAllocation;
};

type AssetProjectionRow = {
  year: number;
  startAsset: number;
  contribution: number;
  educationCost: number;
  growthRate: number;
  growthAmount: number;
  endAsset: number;
};

type AssetSimulationResult = {
  expectedAnnualReturn: number;
  finalAsset: number;
  totalContribution: number;
  totalEducationCost: number;
  totalGrowth: number;
  yearly: AssetProjectionRow[];
};

const currentYear = new Date().getFullYear();

const ASSET_CLASS_EXPECTED_RETURN: Record<keyof PortfolioAllocation, number> = {
  cash: 0.02,
  bond: 0.035,
  stockKr: 0.07,
  stockUs: 0.075,
  pension: 0.05
};

const PORTFOLIO_PRESETS: Record<Exclude<PortfolioType, 'custom'>, PortfolioAllocation> = {
  conservative: { cash: 25, bond: 45, stockKr: 15, stockUs: 10, pension: 5 },
  balanced: { cash: 10, bond: 30, stockKr: 25, stockUs: 25, pension: 10 },
  aggressive: { cash: 5, bond: 15, stockKr: 35, stockUs: 35, pension: 10 }
};

const defaultPlanForm: PlanForm = {
  childId: '',
  annualCost: 10000000,
  inflationRate: 0.03,
  startYear: currentYear,
  endYear: currentYear + 4
};

const defaultScenarioForm: AssetScenarioForm = {
  startingNetWorth: 0,
  startYear: currentYear,
  endYear: currentYear + 15,
  monthlySaving: 1000000,
  monthlyInvestment: 1000000,
  includeEducationCosts: true,
  portfolioType: 'balanced',
  customAllocation: { ...PORTFOLIO_PRESETS.balanced }
};

function getSelectedAllocation(form: AssetScenarioForm): PortfolioAllocation {
  if (form.portfolioType === 'custom') {
    return form.customAllocation;
  }
  return PORTFOLIO_PRESETS[form.portfolioType];
}

function getExpectedAnnualReturn(allocation: PortfolioAllocation): number {
  return Object.entries(allocation).reduce((sum, [key, weight]) => {
    const rate = ASSET_CLASS_EXPECTED_RETURN[key as keyof PortfolioAllocation] ?? 0;
    return sum + (rate * weight) / 100;
  }, 0);
}

function buildEducationCostByYear(
  plans: EducationPlan[],
  startYear: number,
  endYear: number
): Record<number, number> {
  const yearlyCosts: Record<number, number> = {};

  plans.forEach((plan) => {
    const scopedStart = Math.max(startYear, plan.startYear);
    const scopedEnd = Math.min(endYear, plan.endYear);
    if (scopedEnd < scopedStart) {
      return;
    }

    for (let year = scopedStart; year <= scopedEnd; year += 1) {
      const yearsFromPlanStart = year - plan.startYear;
      const cost = Math.round(plan.annualCost * Math.pow(1 + plan.inflationRate, yearsFromPlanStart));
      yearlyCosts[year] = (yearlyCosts[year] ?? 0) + cost;
    }
  });

  return yearlyCosts;
}

export default function EducationPage() {
  const [children, setChildren] = useState<ProfileChild[]>([]);
  const [plans, setPlans] = useState<EducationPlan[]>([]);
  const [planForm, setPlanForm] = useState<PlanForm>(defaultPlanForm);
  const [scenarioForm, setScenarioForm] = useState<AssetScenarioForm>(defaultScenarioForm);
  const [simulation, setSimulation] = useState<EducationSimulationResult | null>(null);
  const [assetSimulation, setAssetSimulation] = useState<AssetSimulationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [planErrors, setPlanErrors] = useState<Record<string, string>>({});
  const [scenarioErrors, setScenarioErrors] = useState<Record<string, string>>({});
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

  const selectedAllocation = useMemo(() => getSelectedAllocation(scenarioForm), [scenarioForm]);
  const selectedExpectedReturn = useMemo(
    () => getExpectedAnnualReturn(selectedAllocation),
    [selectedAllocation]
  );

  const educationCostPreview = useMemo(
    () => buildEducationCostByYear(plans, scenarioForm.startYear, scenarioForm.endYear),
    [plans, scenarioForm.startYear, scenarioForm.endYear]
  );

  const totalEducationCostPreview = useMemo(
    () => Object.values(educationCostPreview).reduce((sum, cost) => sum + cost, 0),
    [educationCostPreview]
  );

  async function loadAll() {
    const [profileResult, plansResult, summaryResult] = await Promise.all([
      api.getProfile(),
      api.getEducationPlans(),
      api.getDashboardSummary()
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

    if (summaryResult.data) {
      const netWorth = summaryResult.data.netWorth;
      const monthlyFixedExpense = Number(summaryResult.data.monthlyFixedExpense ?? 0);
      const annualCompensation =
        Number(profileResult.data?.baseSalaryAnnual ?? 0) +
        Number(profileResult.data?.annualFixedExtra ?? 0) +
        Number(profileResult.data?.annualBonus ?? 0) +
        Number(profileResult.data?.annualRsu ?? 0);
      const estimatedMonthlyIncome = annualCompensation > 0 ? annualCompensation / 12 : 0;
      const estimatedMonthlySurplus = Math.max(0, estimatedMonthlyIncome - monthlyFixedExpense);
      const suggestedMonthlySaving = Math.round(estimatedMonthlySurplus * 0.5);
      const suggestedMonthlyInvestment = Math.max(0, estimatedMonthlySurplus - suggestedMonthlySaving);

      setScenarioForm((prev) => ({
        ...prev,
        startingNetWorth:
          prev.startingNetWorth === defaultScenarioForm.startingNetWorth
            ? netWorth
            : prev.startingNetWorth,
        monthlySaving:
          prev.monthlySaving === defaultScenarioForm.monthlySaving && estimatedMonthlySurplus > 0
            ? suggestedMonthlySaving
            : prev.monthlySaving,
        monthlyInvestment:
          prev.monthlyInvestment === defaultScenarioForm.monthlyInvestment && estimatedMonthlySurplus > 0
            ? suggestedMonthlyInvestment
            : prev.monthlyInvestment
      }));
    }

    const profileError = profileResult.error?.code === 'NOT_FOUND' ? null : profileResult.error;
    const firstError = profileError ?? plansResult.error ?? summaryResult.error;
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
      startYear: currentYear,
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
    if (!Number.isFinite(planForm.endYear)) {
      nextErrors.years = '종료연도를 확인해주세요.';
    } else if (planForm.endYear < currentYear) {
      nextErrors.years = '종료연도는 현재 연도 이후여야 합니다.';
    }

    setPlanErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setMessageText('계획 입력값을 확인해주세요.');
      return;
    }

    const result = await api.createEducationPlan({
      ...planForm,
      startYear: currentYear
    });
    if (result.error) {
      setErrorMessage('계획 저장 실패', result.error);
      return;
    }

    setSuccessMessage('교육비 계획이 저장되었습니다.');
    await loadAll();
  }

  function onRunAssetSimulation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearMessage();

    const nextErrors: Record<string, string> = {};
    if (!Number.isFinite(scenarioForm.startYear) || !Number.isFinite(scenarioForm.endYear)) {
      nextErrors.years = '시작/종료 연도를 확인해주세요.';
    } else if (scenarioForm.endYear < scenarioForm.startYear) {
      nextErrors.years = '종료 연도는 시작 연도 이후여야 합니다.';
    }

    if (!Number.isFinite(scenarioForm.startingNetWorth)) {
      nextErrors.startingNetWorth = '현재 순자산을 숫자로 입력해주세요.';
    }

    if (!Number.isFinite(scenarioForm.monthlySaving) || scenarioForm.monthlySaving < 0) {
      nextErrors.monthlySaving = '월 저축은 0 이상이어야 합니다.';
    }

    if (!Number.isFinite(scenarioForm.monthlyInvestment) || scenarioForm.monthlyInvestment < 0) {
      nextErrors.monthlyInvestment = '월 투자는 0 이상이어야 합니다.';
    }

    const allocation = getSelectedAllocation(scenarioForm);
    const totalWeight = Object.values(allocation).reduce((sum, value) => sum + value, 0);
    const hasNegativeWeight = Object.values(allocation).some((value) => value < 0);

    if (hasNegativeWeight) {
      nextErrors.portfolio = '포트폴리오 비중은 음수가 될 수 없습니다.';
    } else if (Math.round(totalWeight * 100) / 100 !== 100) {
      nextErrors.portfolio = '포트폴리오 비중 합계는 100이어야 합니다.';
    }

    setScenarioErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setMessageText('자산 시뮬레이션 입력값을 확인해주세요.');
      return;
    }

    const expectedAnnualReturn = getExpectedAnnualReturn(allocation);
    const annualContribution = (scenarioForm.monthlySaving + scenarioForm.monthlyInvestment) * 12;
    const yearlyEducationCosts = scenarioForm.includeEducationCosts
      ? buildEducationCostByYear(plans, scenarioForm.startYear, scenarioForm.endYear)
      : {};

    const yearlyRows: AssetProjectionRow[] = [];
    let currentAsset = scenarioForm.startingNetWorth;
    let totalContribution = 0;
    let totalEducationCost = 0;
    let totalGrowth = 0;

    for (let year = scenarioForm.startYear; year <= scenarioForm.endYear; year += 1) {
      const startAsset = currentAsset;
      const educationCost = yearlyEducationCosts[year] ?? 0;
      const beforeGrowth = startAsset + annualContribution - educationCost;
      const growthAmount = Math.round(beforeGrowth * expectedAnnualReturn);
      const endAsset = Math.round(beforeGrowth + growthAmount);

      yearlyRows.push({
        year,
        startAsset,
        contribution: annualContribution,
        educationCost,
        growthRate: expectedAnnualReturn,
        growthAmount,
        endAsset
      });

      totalContribution += annualContribution;
      totalEducationCost += educationCost;
      totalGrowth += growthAmount;
      currentAsset = endAsset;
    }

    setAssetSimulation({
      expectedAnnualReturn,
      finalAsset: currentAsset,
      totalContribution,
      totalEducationCost,
      totalGrowth,
      yearly: yearlyRows
    });
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
      <h1>자산시뮬레이션</h1>
      <p className="helper-text mt-2">연도, 월 저축/투자, 포트폴리오 옵션, 교육비 계획을 함께 반영해 미래 자산을 예측합니다.</p>

      <SectionCard className="mt-5 max-w-[980px]">
        <h3 className="mb-3 mt-0">설정에서 불러온 교육 정보</h3>
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
          <FormField label="종료연도" error={planErrors.years}>
            <input type="number" min={currentYear} value={planForm.endYear} onChange={(e) => setPlanForm((p) => ({ ...p, endYear: Number(e.target.value || currentYear) }))} placeholder="종료연도" className={planErrors.years ? 'border-red-700' : ''} />
          </FormField>
          <button type="submit" className="btn-primary w-[140px] self-end">계획 추가</button>
        </form>
      </SectionCard>

      {message && <p className="mt-4">{message}</p>}

      <SectionCard className="mt-4 max-w-[980px]">
        <h2 className="mt-0">자산 시나리오 설정</h2>
        <form onSubmit={onRunAssetSimulation} className="mt-3 grid gap-4">
          <div className="form-grid [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
            <FormField label="현재 순자산" error={scenarioErrors.startingNetWorth}>
              <input
                type="number"
                value={scenarioForm.startingNetWorth}
                onChange={(event) =>
                  setScenarioForm((prev) => ({
                    ...prev,
                    startingNetWorth: Number(event.target.value || 0)
                  }))
                }
                placeholder="현재 순자산"
                className={scenarioErrors.startingNetWorth ? 'border-red-700' : ''}
              />
            </FormField>

            <FormField label="시작 연도" error={scenarioErrors.years}>
              <input
                type="number"
                value={scenarioForm.startYear}
                min={currentYear}
                onChange={(event) =>
                  setScenarioForm((prev) => ({
                    ...prev,
                    startYear: Number(event.target.value || currentYear)
                  }))
                }
                className={scenarioErrors.years ? 'border-red-700' : ''}
              />
            </FormField>

            <FormField label="종료 연도" error={scenarioErrors.years}>
              <input
                type="number"
                value={scenarioForm.endYear}
                min={scenarioForm.startYear}
                onChange={(event) =>
                  setScenarioForm((prev) => ({
                    ...prev,
                    endYear: Number(event.target.value || currentYear)
                  }))
                }
                className={scenarioErrors.years ? 'border-red-700' : ''}
              />
            </FormField>

            <FormField label="월 저축" error={scenarioErrors.monthlySaving}>
              <input
                type="number"
                min={0}
                value={scenarioForm.monthlySaving}
                onChange={(event) =>
                  setScenarioForm((prev) => ({
                    ...prev,
                    monthlySaving: Number(event.target.value || 0)
                  }))
                }
                className={scenarioErrors.monthlySaving ? 'border-red-700' : ''}
              />
            </FormField>

            <FormField label="월 투자" error={scenarioErrors.monthlyInvestment}>
              <input
                type="number"
                min={0}
                value={scenarioForm.monthlyInvestment}
                onChange={(event) =>
                  setScenarioForm((prev) => ({
                    ...prev,
                    monthlyInvestment: Number(event.target.value || 0)
                  }))
                }
                className={scenarioErrors.monthlyInvestment ? 'border-red-700' : ''}
              />
            </FormField>

            <FormField label="포트폴리오 옵션" error={scenarioErrors.portfolio}>
              <select
                value={scenarioForm.portfolioType}
                onChange={(event) => {
                  const nextType = event.target.value as PortfolioType;
                  setScenarioForm((prev) => ({
                    ...prev,
                    portfolioType: nextType,
                    customAllocation:
                      nextType === 'custom'
                        ? prev.customAllocation
                        : { ...PORTFOLIO_PRESETS[nextType as Exclude<PortfolioType, 'custom'>] }
                  }));
                }}
                className={scenarioErrors.portfolio ? 'border-red-700' : ''}
              >
                <option value="conservative">보수형</option>
                <option value="balanced">중립형</option>
                <option value="aggressive">공격형</option>
                <option value="custom">사용자 정의</option>
              </select>
            </FormField>

            <FormField label="교육비 반영 여부">
              <select
                value={scenarioForm.includeEducationCosts ? 'include' : 'exclude'}
                onChange={(event) =>
                  setScenarioForm((prev) => ({
                    ...prev,
                    includeEducationCosts: event.target.value === 'include'
                  }))
                }
              >
                <option value="include">반영</option>
                <option value="exclude">제외</option>
              </select>
            </FormField>
          </div>

          {scenarioForm.portfolioType === 'custom' ? (
            <div className="rounded-xl border border-[var(--line)] p-4">
              <h3 className="mb-3 mt-0">사용자 정의 포트폴리오 비중(%)</h3>
              <div className="form-grid [grid-template-columns:repeat(auto-fit,minmax(140px,1fr))]">
                <FormField label="현금">
                  <input
                    type="number"
                    min={0}
                    value={scenarioForm.customAllocation.cash}
                    onChange={(event) =>
                      setScenarioForm((prev) => ({
                        ...prev,
                        customAllocation: {
                          ...prev.customAllocation,
                          cash: Number(event.target.value || 0)
                        }
                      }))
                    }
                  />
                </FormField>
                <FormField label="채권">
                  <input
                    type="number"
                    min={0}
                    value={scenarioForm.customAllocation.bond}
                    onChange={(event) =>
                      setScenarioForm((prev) => ({
                        ...prev,
                        customAllocation: {
                          ...prev.customAllocation,
                          bond: Number(event.target.value || 0)
                        }
                      }))
                    }
                  />
                </FormField>
                <FormField label="국내주식">
                  <input
                    type="number"
                    min={0}
                    value={scenarioForm.customAllocation.stockKr}
                    onChange={(event) =>
                      setScenarioForm((prev) => ({
                        ...prev,
                        customAllocation: {
                          ...prev.customAllocation,
                          stockKr: Number(event.target.value || 0)
                        }
                      }))
                    }
                  />
                </FormField>
                <FormField label="미국주식">
                  <input
                    type="number"
                    min={0}
                    value={scenarioForm.customAllocation.stockUs}
                    onChange={(event) =>
                      setScenarioForm((prev) => ({
                        ...prev,
                        customAllocation: {
                          ...prev.customAllocation,
                          stockUs: Number(event.target.value || 0)
                        }
                      }))
                    }
                  />
                </FormField>
                <FormField label="연금">
                  <input
                    type="number"
                    min={0}
                    value={scenarioForm.customAllocation.pension}
                    onChange={(event) =>
                      setScenarioForm((prev) => ({
                        ...prev,
                        customAllocation: {
                          ...prev.customAllocation,
                          pension: Number(event.target.value || 0)
                        }
                      }))
                    }
                  />
                </FormField>
              </div>
            </div>
          ) : null}

          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-4">
            <p className="helper-text m-0">
              예상 연 수익률: <strong>{(selectedExpectedReturn * 100).toFixed(2)}%</strong> /
              시뮬레이션 기간 예상 교육비 합계: <strong>{totalEducationCostPreview.toLocaleString()}원</strong>
            </p>
          </div>

          <button type="submit" className="btn-primary w-[180px]">자산 시뮬레이션 실행</button>
        </form>
      </SectionCard>

      <SectionCard className="mt-4 max-w-[980px]">
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
        <SectionCard className="mt-4 max-w-[980px]">
          <h3 className="mt-0">교육비 시뮬레이션 결과 ({selectedChildName})</h3>
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

      {assetSimulation && (
        <SectionCard className="mt-4 max-w-[980px]">
          <h3 className="mt-0">미래 자산 시뮬레이션 결과</h3>

          <div className="mt-3 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
            <div className="rounded-xl border border-[var(--line)] p-3">
              <p className="helper-text m-0">최종 예상 자산</p>
              <p className="m-0 mt-1 text-[1.15rem] font-bold">{assetSimulation.finalAsset.toLocaleString()}원</p>
            </div>
            <div className="rounded-xl border border-[var(--line)] p-3">
              <p className="helper-text m-0">총 납입(저축+투자)</p>
              <p className="m-0 mt-1 text-[1.15rem] font-bold">{assetSimulation.totalContribution.toLocaleString()}원</p>
            </div>
            <div className="rounded-xl border border-[var(--line)] p-3">
              <p className="helper-text m-0">총 교육비 반영액</p>
              <p className="m-0 mt-1 text-[1.15rem] font-bold">{assetSimulation.totalEducationCost.toLocaleString()}원</p>
            </div>
            <div className="rounded-xl border border-[var(--line)] p-3">
              <p className="helper-text m-0">총 투자 성장액</p>
              <p className="m-0 mt-1 text-[1.15rem] font-bold">{assetSimulation.totalGrowth.toLocaleString()}원</p>
            </div>
          </div>

          <p className="helper-text mt-3">
            연도별 계산식: (연초자산 + 연간납입 - 연간교육비) × (1 + 예상연수익률 { (assetSimulation.expectedAnnualReturn * 100).toFixed(2)}%)
          </p>

          <DataTable
            rows={assetSimulation.yearly}
            rowKey={(row) => String(row.year)}
            columns={[
              { key: 'year', header: '연도', render: (row) => row.year },
              {
                key: 'startAsset',
                header: '연초자산',
                align: 'right',
                render: (row) => `${row.startAsset.toLocaleString()}원`
              },
              {
                key: 'contribution',
                header: '연간납입',
                align: 'right',
                render: (row) => `${row.contribution.toLocaleString()}원`
              },
              {
                key: 'educationCost',
                header: '교육비',
                align: 'right',
                render: (row) => `${row.educationCost.toLocaleString()}원`
              },
              {
                key: 'growthAmount',
                header: '성장액',
                align: 'right',
                render: (row) => `${row.growthAmount.toLocaleString()}원`
              },
              {
                key: 'endAsset',
                header: '연말자산',
                align: 'right',
                render: (row) => `${row.endAsset.toLocaleString()}원`
              }
            ]}
          />
        </SectionCard>
      )}
    </div>
  );
}
