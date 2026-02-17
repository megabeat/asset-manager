'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { EducationPlan } from '@/lib/api';
import { SectionCard } from '@/components/ui/SectionCard';
import { FormField } from '@/components/ui/FormField';
import { DataTable } from '@/components/ui/DataTable';

/* ── Types ─────────────────────────────────────── */

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

/* ── Constants ─────────────────────────────────── */

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

/* ── Pure helpers ──────────────────────────────── */

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
    if (scopedEnd < scopedStart) return;
    for (let year = scopedStart; year <= scopedEnd; year += 1) {
      const yearsFromPlanStart = year - plan.startYear;
      const cost = Math.round(plan.annualCost * Math.pow(1 + plan.inflationRate, yearsFromPlanStart));
      yearlyCosts[year] = (yearlyCosts[year] ?? 0) + cost;
    }
  });
  return yearlyCosts;
}

/* ── Component ─────────────────────────────────── */

interface AssetScenarioSimulatorProps {
  plans: EducationPlan[];
  initialNetWorth?: number;
  initialMonthlySaving?: number;
  initialMonthlyInvestment?: number;
}

export function AssetScenarioSimulator({
  plans,
  initialNetWorth,
  initialMonthlySaving,
  initialMonthlyInvestment
}: AssetScenarioSimulatorProps) {
  const [scenarioForm, setScenarioForm] = useState<AssetScenarioForm>(defaultScenarioForm);
  const [assetSimulation, setAssetSimulation] = useState<AssetSimulationResult | null>(null);
  const [scenarioErrors, setScenarioErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setScenarioForm((prev) => ({
      ...prev,
      ...(initialNetWorth !== undefined && prev.startingNetWorth === defaultScenarioForm.startingNetWorth
        ? { startingNetWorth: initialNetWorth }
        : {}),
      ...(initialMonthlySaving !== undefined && prev.monthlySaving === defaultScenarioForm.monthlySaving
        ? { monthlySaving: initialMonthlySaving }
        : {}),
      ...(initialMonthlyInvestment !== undefined && prev.monthlyInvestment === defaultScenarioForm.monthlyInvestment
        ? { monthlyInvestment: initialMonthlyInvestment }
        : {})
    }));
  }, [initialNetWorth, initialMonthlySaving, initialMonthlyInvestment]);

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

  function onRunAssetSimulation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

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
    if (Object.keys(nextErrors).length > 0) return;

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

      yearlyRows.push({ year, startAsset, contribution: annualContribution, educationCost, growthRate: expectedAnnualReturn, growthAmount, endAsset });
      totalContribution += annualContribution;
      totalEducationCost += educationCost;
      totalGrowth += growthAmount;
      currentAsset = endAsset;
    }

    setAssetSimulation({ expectedAnnualReturn, finalAsset: currentAsset, totalContribution, totalEducationCost, totalGrowth, yearly: yearlyRows });
  }

  return (
    <>
      <SectionCard className="mt-4 max-w-[980px]">
        <h2 className="mt-0">자산 시나리오 설정</h2>
        <form onSubmit={onRunAssetSimulation} className="mt-3 grid gap-4">
          <div className="form-grid [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
            <FormField label="현재 순자산" error={scenarioErrors.startingNetWorth}>
              <input
                type="number"
                value={scenarioForm.startingNetWorth}
                onChange={(event) =>
                  setScenarioForm((prev) => ({ ...prev, startingNetWorth: Number(event.target.value || 0) }))
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
                  setScenarioForm((prev) => ({ ...prev, startYear: Number(event.target.value || currentYear) }))
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
                  setScenarioForm((prev) => ({ ...prev, endYear: Number(event.target.value || currentYear) }))
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
                  setScenarioForm((prev) => ({ ...prev, monthlySaving: Number(event.target.value || 0) }))
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
                  setScenarioForm((prev) => ({ ...prev, monthlyInvestment: Number(event.target.value || 0) }))
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
                  setScenarioForm((prev) => ({ ...prev, includeEducationCosts: event.target.value === 'include' }))
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
                {(['cash', 'bond', 'stockKr', 'stockUs', 'pension'] as const).map((key) => (
                  <FormField key={key} label={{ cash: '현금', bond: '채권', stockKr: '국내주식', stockUs: '미국주식', pension: '연금' }[key]}>
                    <input
                      type="number"
                      min={0}
                      value={scenarioForm.customAllocation[key]}
                      onChange={(event) =>
                        setScenarioForm((prev) => ({
                          ...prev,
                          customAllocation: { ...prev.customAllocation, [key]: Number(event.target.value || 0) }
                        }))
                      }
                    />
                  </FormField>
                ))}
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
            연도별 계산식: (연초자산 + 연간납입 - 연간교육비) × (1 + 예상연수익률 {(assetSimulation.expectedAnnualReturn * 100).toFixed(2)}%)
          </p>

          <DataTable
            rows={assetSimulation.yearly}
            rowKey={(row) => String(row.year)}
            columns={[
              { key: 'year', header: '연도', render: (row) => row.year },
              { key: 'startAsset', header: '연초자산', align: 'right', render: (row) => `${row.startAsset.toLocaleString()}원` },
              { key: 'contribution', header: '연간납입', align: 'right', render: (row) => `${row.contribution.toLocaleString()}원` },
              { key: 'educationCost', header: '교육비', align: 'right', render: (row) => `${row.educationCost.toLocaleString()}원` },
              { key: 'growthAmount', header: '성장액', align: 'right', render: (row) => `${row.growthAmount.toLocaleString()}원` },
              { key: 'endAsset', header: '연말자산', align: 'right', render: (row) => `${row.endAsset.toLocaleString()}원` }
            ]}
          />
        </SectionCard>
      )}
    </>
  );
}
