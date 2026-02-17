'use client';

import { Dispatch, SetStateAction } from 'react';
import { Profile } from '@/lib/api';
import { FormField } from '@/components/ui/FormField';

type ProfileForm = Omit<
  Profile,
  | 'retirementTargetAge'
  | 'baseSalaryAnnual'
  | 'annualFixedExtra'
  | 'annualBonus'
  | 'annualRsu'
  | 'annualRaiseRatePct'
  | 'rsuShares'
  | 'rsuVestingPriceUsd'
  | 'child1TargetUniversityYear'
  | 'child2TargetUniversityYear'
  | 'spouseAnnualIncome'
  | 'spouseRetirementTargetAge'
> & {
  retirementTargetAge: number | '';
  baseSalaryAnnual: number | '';
  annualFixedExtra: number | '';
  annualBonus: number | '';
  annualRsu: number | '';
  annualRaiseRatePct: number | '';
  rsuShares: number | '';
  rsuVestingPriceUsd: number | '';
  child1TargetUniversityYear: number | '';
  child2TargetUniversityYear: number | '';
  spouseAnnualIncome: number | '';
  spouseRetirementTargetAge: number | '';
};

export type { ProfileForm };

interface TabProps {
  form: ProfileForm;
  setForm: Dispatch<SetStateAction<ProfileForm>>;
  errors: Record<string, string>;
}

const currentYear = new Date().getFullYear();

export function SelfTab({ form, setForm, errors }: TabProps) {
  return (
    <>
      <h3 className="mt-0 mb-1 text-base font-semibold text-[var(--fg)]">인적사항</h3>

      <FormField label="이름" error={errors.fullName}>
        <input
          value={form.fullName}
          onChange={(event) => setForm((prev) => ({ ...prev, fullName: event.target.value }))}
          placeholder="홍길동"
        />
      </FormField>

      <FormField label="생년월일" error={errors.birthDate}>
        <input
          type="date"
          value={form.birthDate}
          onChange={(event) => setForm((prev) => ({ ...prev, birthDate: event.target.value }))}
        />
      </FormField>

      <h3 className="mt-3 mb-1 text-base font-semibold text-[var(--fg)]">직장 / 소득</h3>

      <FormField label="직장명">
        <input
          value={form.employerName ?? ''}
          onChange={(event) => setForm((prev) => ({ ...prev, employerName: event.target.value }))}
          placeholder="예: Microsoft"
        />
      </FormField>

      <FormField label="직무/직급">
        <input
          value={form.jobTitle ?? ''}
          onChange={(event) => setForm((prev) => ({ ...prev, jobTitle: event.target.value }))}
          placeholder="예: Senior Software Engineer"
        />
      </FormField>

      <FormField label="직장 기본급(연)" error={errors.baseSalaryAnnual}>
        <input
          type="number"
          min={0}
          value={form.baseSalaryAnnual}
          onChange={(event) =>
            setForm((prev) => ({
              ...prev,
              baseSalaryAnnual: event.target.value === '' ? '' : Number(event.target.value)
            }))
          }
          placeholder="예: 120000000"
        />
      </FormField>

      <FormField label="추가지급-고정(연)" error={errors.annualFixedExtra}>
        <input
          type="number"
          min={0}
          value={form.annualFixedExtra}
          onChange={(event) =>
            setForm((prev) => ({
              ...prev,
              annualFixedExtra: event.target.value === '' ? '' : Number(event.target.value)
            }))
          }
          placeholder="예: 5000000"
        />
      </FormField>

      <FormField label="연간 보너스" error={errors.annualBonus}>
        <input
          type="number"
          min={0}
          value={form.annualBonus}
          onChange={(event) =>
            setForm((prev) => ({
              ...prev,
              annualBonus: event.target.value === '' ? '' : Number(event.target.value)
            }))
          }
          placeholder="예: 15000000"
        />
      </FormField>

      <FormField label="연간 RSU(원화 환산)" error={errors.annualRsu}>
        <input
          type="number"
          min={0}
          value={form.annualRsu}
          onChange={(event) =>
            setForm((prev) => ({
              ...prev,
              annualRsu: event.target.value === '' ? '' : Number(event.target.value)
            }))
          }
          placeholder="예: 20000000"
        />
      </FormField>

      <FormField label="RSU 주식수" error={errors.rsuShares}>
        <input
          type="number"
          min={0}
          step="0.0001"
          value={form.rsuShares}
          onChange={(event) =>
            setForm((prev) => ({
              ...prev,
              rsuShares: event.target.value === '' ? '' : Number(event.target.value)
            }))
          }
          placeholder="예: 240"
        />
      </FormField>

      <FormField label="RSU 베스팅 시가(USD)" error={errors.rsuVestingPriceUsd}>
        <input
          type="number"
          min={0}
          step="0.01"
          value={form.rsuVestingPriceUsd}
          onChange={(event) =>
            setForm((prev) => ({
              ...prev,
              rsuVestingPriceUsd: event.target.value === '' ? '' : Number(event.target.value)
            }))
          }
          placeholder="예: 420"
        />
      </FormField>

      <FormField label="RSU 베스팅 주기">
        <select
          value={form.rsuVestingCycle ?? 'quarterly'}
          onChange={(event) =>
            setForm((prev) => ({
              ...prev,
              rsuVestingCycle: event.target.value as Profile['rsuVestingCycle']
            }))
          }
        >
          <option value="monthly">월별</option>
          <option value="quarterly">분기별</option>
          <option value="yearly">연별</option>
          <option value="irregular">비정기</option>
        </select>
      </FormField>

      <FormField label="연간 연봉 상승률(기본급 기준, %)" error={errors.annualRaiseRatePct}>
        <input
          type="number"
          min={-20}
          max={100}
          step="0.1"
          value={form.annualRaiseRatePct}
          onChange={(event) =>
            setForm((prev) => ({
              ...prev,
              annualRaiseRatePct: event.target.value === '' ? '' : Number(event.target.value)
            }))
          }
          placeholder="예: 5"
        />
      </FormField>

      <h3 className="mt-3 mb-1 text-base font-semibold text-[var(--fg)]">은퇴 목표</h3>

      <FormField label="은퇴 목표 연령" error={errors.retirementTargetAge}>
        <input
          type="number"
          min={45}
          max={90}
          value={form.retirementTargetAge}
          onChange={(event) =>
            setForm((prev) => ({
              ...prev,
              retirementTargetAge: event.target.value === '' ? '' : Number(event.target.value)
            }))
          }
          placeholder="예: 60"
        />
      </FormField>
    </>
  );
}

export function SpouseTab({ form, setForm, errors }: TabProps) {
  return (
    <>
      <h3 className="mt-0 mb-1 text-base font-semibold text-[var(--fg)]">인적사항</h3>

      <FormField label="배우자 이름">
        <input
          value={form.spouseName ?? ''}
          onChange={(event) => setForm((prev) => ({ ...prev, spouseName: event.target.value }))}
          placeholder="예: 홍길순"
        />
      </FormField>

      <FormField label="배우자 생년월일">
        <input
          type="date"
          value={form.spouseBirthDate ?? ''}
          onChange={(event) => setForm((prev) => ({ ...prev, spouseBirthDate: event.target.value }))}
        />
      </FormField>

      <h3 className="mt-3 mb-1 text-base font-semibold text-[var(--fg)]">직장 / 소득</h3>

      <FormField label="배우자 직장명">
        <input
          value={form.spouseEmployerName ?? ''}
          onChange={(event) => setForm((prev) => ({ ...prev, spouseEmployerName: event.target.value }))}
          placeholder="예: OO초등학교"
        />
      </FormField>

      <FormField label="배우자 직무/직급">
        <input
          value={form.spouseJobTitle ?? ''}
          onChange={(event) => setForm((prev) => ({ ...prev, spouseJobTitle: event.target.value }))}
          placeholder="예: 초등학교 교사"
        />
      </FormField>

      <FormField label="배우자 연 소득(세전)">
        <input
          type="number"
          min={0}
          value={form.spouseAnnualIncome}
          onChange={(event) =>
            setForm((prev) => ({
              ...prev,
              spouseAnnualIncome: event.target.value === '' ? '' : Number(event.target.value)
            }))
          }
          placeholder="예: 60000000"
        />
      </FormField>

      <h3 className="mt-3 mb-1 text-base font-semibold text-[var(--fg)]">은퇴 목표</h3>

      <FormField label="배우자 은퇴 목표 연령" error={errors.spouseRetirementTargetAge}>
        <input
          type="number"
          min={45}
          max={90}
          value={form.spouseRetirementTargetAge}
          onChange={(event) =>
            setForm((prev) => ({
              ...prev,
              spouseRetirementTargetAge: event.target.value === '' ? '' : Number(event.target.value)
            }))
          }
          placeholder="예: 60"
        />
      </FormField>
    </>
  );
}

export function ChildrenTab({ form, setForm, errors }: TabProps) {
  return (
    <>
      <h3 className="mt-0 mb-1 text-base font-semibold text-[var(--fg)]">자녀 1</h3>

      <FormField label="이름" error={errors.child1Name}>
        <input
          value={form.child1Name ?? ''}
          onChange={(event) => setForm((prev) => ({ ...prev, child1Name: event.target.value }))}
          placeholder="예: 자녀1"
        />
      </FormField>

      <FormField label="생년월일" error={errors.child1BirthDate}>
        <input
          type="date"
          value={form.child1BirthDate ?? ''}
          onChange={(event) => setForm((prev) => ({ ...prev, child1BirthDate: event.target.value }))}
        />
      </FormField>

      <FormField label="예상 대학 진학년도" error={errors.child1TargetUniversityYear}>
        <input
          type="number"
          min={currentYear}
          max={currentYear + 40}
          value={form.child1TargetUniversityYear}
          onChange={(event) =>
            setForm((prev) => ({
              ...prev,
              child1TargetUniversityYear: event.target.value === '' ? '' : Number(event.target.value)
            }))
          }
          placeholder={`예: ${currentYear + 12}`}
        />
      </FormField>

      <h3 className="mt-3 mb-1 text-base font-semibold text-[var(--fg)]">자녀 2</h3>

      <FormField label="이름" error={errors.child2Name}>
        <input
          value={form.child2Name ?? ''}
          onChange={(event) => setForm((prev) => ({ ...prev, child2Name: event.target.value }))}
          placeholder="예: 자녀2"
        />
      </FormField>

      <FormField label="생년월일" error={errors.child2BirthDate}>
        <input
          type="date"
          value={form.child2BirthDate ?? ''}
          onChange={(event) => setForm((prev) => ({ ...prev, child2BirthDate: event.target.value }))}
        />
      </FormField>

      <FormField label="예상 대학 진학년도" error={errors.child2TargetUniversityYear}>
        <input
          type="number"
          min={currentYear}
          max={currentYear + 40}
          value={form.child2TargetUniversityYear}
          onChange={(event) =>
            setForm((prev) => ({
              ...prev,
              child2TargetUniversityYear: event.target.value === '' ? '' : Number(event.target.value)
            }))
          }
          placeholder={`예: ${currentYear + 14}`}
        />
      </FormField>
    </>
  );
}

export function SettingsTab({ form, setForm, errors }: TabProps) {
  return (
    <>
      <FormField label="가구원 수" error={errors.householdSize}>
        <input
          type="number"
          min={1}
          value={form.householdSize}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, householdSize: Number(event.target.value || 1) }))
          }
        />
      </FormField>

      <FormField label="통화" error={errors.currency}>
        <input
          value={form.currency}
          onChange={(event) => setForm((prev) => ({ ...prev, currency: event.target.value }))}
          placeholder="KRW"
        />
      </FormField>
    </>
  );
}
