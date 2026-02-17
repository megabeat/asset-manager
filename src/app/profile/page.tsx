'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, Profile } from '@/lib/api';
import { FeedbackBanner } from '@/components/ui/FeedbackBanner';
import { useFeedbackMessage } from '@/hooks/useFeedbackMessage';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { SelfTab, SpouseTab, ChildrenTab, SettingsTab, ProfileForm } from '@/components/profile/ProfileTabs';

type ProfileTab = 'settings' | 'self' | 'spouse' | 'children';

const currentYear = new Date().getFullYear();

const defaultForm: ProfileForm = {
  fullName: '',
  birthDate: '',
  employerName: '',
  jobTitle: '',
  baseSalaryAnnual: '',
  annualFixedExtra: '',
  annualBonus: '',
  annualRsu: '',
  annualRaiseRatePct: '',
  rsuShares: '',
  rsuVestingPriceUsd: '',
  rsuVestingCycle: 'quarterly',
  spouseName: '',
  spouseBirthDate: '',
  spouseEmployerName: '',
  spouseJobTitle: '',
  spouseAnnualIncome: '',
  spouseRetirementTargetAge: '',
  child1Name: '',
  child1BirthDate: '',
  child1TargetUniversityYear: '',
  child2Name: '',
  child2BirthDate: '',
  child2TargetUniversityYear: '',
  retirementTargetAge: '',
  householdSize: 1,
  currency: 'KRW'
};

export default function ProfilePage() {
  const [form, setForm] = useState<ProfileForm>(defaultForm);
  const [activeTab, setActiveTab] = useState<ProfileTab>('self');
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [exists, setExists] = useState(false);
  const { message, feedback, clearMessage, setMessageText, setSuccessMessage, setErrorMessage } = useFeedbackMessage();
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let mounted = true;

    (async () => {
      let authenticated: boolean | null = null;

      try {
        const authResponse = await fetch('/.auth/me', { cache: 'no-store' });
        if (authResponse.ok) {
          const authData = (await authResponse.json()) as
            | Array<{ clientPrincipal?: Record<string, unknown> | null }>
            | { clientPrincipal?: Record<string, unknown> | null };

          const principal = Array.isArray(authData)
            ? authData?.[0]?.clientPrincipal
            : authData?.clientPrincipal;

          if (principal === null) {
            authenticated = false;
          } else if (principal && typeof principal === 'object') {
            authenticated = true;
          }
        }
      } catch {
        authenticated = null;
      }

      if (!mounted) return;

      if (authenticated === false) {
        setIsAuthenticated(false);
        setLoading(false);
        return;
      }

      const result = await api.getProfile();
      if (!mounted) return;

      if (result.error?.code === 'UNAUTHORIZED') {
        setIsAuthenticated(false);
        setLoading(false);
        return;
      }

      setIsAuthenticated(true);

      if (result.data) {
        setForm({
          fullName: result.data.fullName ?? '',
          birthDate: result.data.birthDate ?? '',
          employerName: result.data.employerName ?? '',
          jobTitle: result.data.jobTitle ?? '',
          baseSalaryAnnual: result.data.baseSalaryAnnual ?? '',
          annualFixedExtra: result.data.annualFixedExtra ?? '',
          annualBonus: result.data.annualBonus ?? '',
          annualRsu: result.data.annualRsu ?? '',
          annualRaiseRatePct: result.data.annualRaiseRatePct ?? '',
          rsuShares: result.data.rsuShares ?? '',
          rsuVestingPriceUsd: result.data.rsuVestingPriceUsd ?? '',
          rsuVestingCycle: result.data.rsuVestingCycle ?? 'quarterly',
          spouseName: result.data.spouseName ?? '',
          spouseBirthDate: result.data.spouseBirthDate ?? '',
          spouseEmployerName: result.data.spouseEmployerName ?? '',
          spouseJobTitle: result.data.spouseJobTitle ?? '',
          spouseAnnualIncome: result.data.spouseAnnualIncome ?? '',
          spouseRetirementTargetAge: result.data.spouseRetirementTargetAge ?? '',
          child1Name: result.data.child1Name ?? '',
          child1BirthDate: result.data.child1BirthDate ?? '',
          child1TargetUniversityYear: result.data.child1TargetUniversityYear ?? '',
          child2Name: result.data.child2Name ?? '',
          child2BirthDate: result.data.child2BirthDate ?? '',
          child2TargetUniversityYear: result.data.child2TargetUniversityYear ?? '',
          retirementTargetAge: result.data.retirementTargetAge ?? '',
          householdSize: result.data.householdSize ?? 1,
          currency: result.data.currency ?? 'KRW'
        });
        setExists(true);
      }

      if (result.error && result.error.code !== 'NOT_FOUND') {
        setErrorMessage('불러오기 실패', result.error);
      }

      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const isValid = useMemo(() => {
    return (
      form.fullName.trim().length > 0 &&
      form.birthDate.trim().length > 0 &&
      (form.baseSalaryAnnual === '' || Number(form.baseSalaryAnnual) >= 0) &&
      (form.annualFixedExtra === '' || Number(form.annualFixedExtra) >= 0) &&
      (form.annualBonus === '' || Number(form.annualBonus) >= 0) &&
      (form.annualRsu === '' || Number(form.annualRsu) >= 0) &&
      (form.rsuShares === '' || Number(form.rsuShares) >= 0) &&
      (form.rsuVestingPriceUsd === '' || Number(form.rsuVestingPriceUsd) >= 0) &&
      (form.annualRaiseRatePct === '' ||
        (Number.isFinite(form.annualRaiseRatePct) &&
          Number(form.annualRaiseRatePct) >= -20 &&
          Number(form.annualRaiseRatePct) <= 100)) &&
      Number.isFinite(form.householdSize) &&
      form.householdSize > 0 &&
      (form.retirementTargetAge === '' ||
        (Number.isFinite(form.retirementTargetAge) &&
          Number(form.retirementTargetAge) >= 45 &&
          Number(form.retirementTargetAge) <= 90)) &&
      (form.spouseRetirementTargetAge === '' ||
        (Number.isFinite(form.spouseRetirementTargetAge) &&
          Number(form.spouseRetirementTargetAge) >= 45 &&
          Number(form.spouseRetirementTargetAge) <= 90)) &&
      form.currency.trim().length > 0
    );
  }, [form]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearMessage();
    const nextErrors: Record<string, string> = {};

    if (!form.fullName.trim()) nextErrors.fullName = '이름을 입력해주세요.';
    if (!form.birthDate.trim()) nextErrors.birthDate = '생년월일을 입력해주세요.';
    if (!Number.isFinite(form.householdSize) || form.householdSize <= 0) {
      nextErrors.householdSize = '가구원 수는 1 이상이어야 합니다.';
    }

    if (form.baseSalaryAnnual !== '' && Number(form.baseSalaryAnnual) < 0) {
      nextErrors.baseSalaryAnnual = '기본급은 0 이상이어야 합니다.';
    }
    if (form.annualFixedExtra !== '' && Number(form.annualFixedExtra) < 0) {
      nextErrors.annualFixedExtra = '추가지급-고정은 0 이상이어야 합니다.';
    }
    if (form.annualBonus !== '' && Number(form.annualBonus) < 0) {
      nextErrors.annualBonus = '연간 보너스는 0 이상이어야 합니다.';
    }
    if (form.annualRsu !== '' && Number(form.annualRsu) < 0) {
      nextErrors.annualRsu = '연간 RSU는 0 이상이어야 합니다.';
    }
    if (form.rsuShares !== '' && Number(form.rsuShares) < 0) {
      nextErrors.rsuShares = 'RSU 주식수는 0 이상이어야 합니다.';
    }
    if (form.rsuVestingPriceUsd !== '' && Number(form.rsuVestingPriceUsd) < 0) {
      nextErrors.rsuVestingPriceUsd = '베스팅 시가는 0 이상이어야 합니다.';
    }
    if (
      form.annualRaiseRatePct !== '' &&
      (Number(form.annualRaiseRatePct) < -20 || Number(form.annualRaiseRatePct) > 100)
    ) {
      nextErrors.annualRaiseRatePct = '연봉 상승률은 -20% ~ 100% 범위로 입력해주세요.';
    }

    if (form.child1Name?.trim() && !form.child1BirthDate) {
      nextErrors.child1BirthDate = '자녀1 생년월일을 입력해주세요.';
    }
    if (!form.child1Name?.trim() && form.child1BirthDate) {
      nextErrors.child1Name = '자녀1 이름을 입력해주세요.';
    }
    if (form.child1Name?.trim() && form.child1TargetUniversityYear === '') {
      nextErrors.child1TargetUniversityYear = '자녀1 예상 대학 진학년도를 입력해주세요.';
    }
    if (!form.child1Name?.trim() && form.child1TargetUniversityYear !== '') {
      nextErrors.child1Name = '자녀1 이름을 입력해주세요.';
    }

    if (form.child2Name?.trim() && !form.child2BirthDate) {
      nextErrors.child2BirthDate = '자녀2 생년월일을 입력해주세요.';
    }
    if (!form.child2Name?.trim() && form.child2BirthDate) {
      nextErrors.child2Name = '자녀2 이름을 입력해주세요.';
    }
    if (form.child2Name?.trim() && form.child2TargetUniversityYear === '') {
      nextErrors.child2TargetUniversityYear = '자녀2 예상 대학 진학년도를 입력해주세요.';
    }
    if (!form.child2Name?.trim() && form.child2TargetUniversityYear !== '') {
      nextErrors.child2Name = '자녀2 이름을 입력해주세요.';
    }

    if (
      form.child1TargetUniversityYear !== '' &&
      (Number(form.child1TargetUniversityYear) < currentYear || Number(form.child1TargetUniversityYear) > currentYear + 40)
    ) {
      nextErrors.child1TargetUniversityYear = `진학년도는 ${currentYear}~${currentYear + 40} 범위로 입력해주세요.`;
    }

    if (
      form.child2TargetUniversityYear !== '' &&
      (Number(form.child2TargetUniversityYear) < currentYear || Number(form.child2TargetUniversityYear) > currentYear + 40)
    ) {
      nextErrors.child2TargetUniversityYear = `진학년도는 ${currentYear}~${currentYear + 40} 범위로 입력해주세요.`;
    }

    if (
      form.retirementTargetAge !== '' &&
      (!Number.isFinite(form.retirementTargetAge) ||
        Number(form.retirementTargetAge) < 45 ||
        Number(form.retirementTargetAge) > 90)
    ) {
      nextErrors.retirementTargetAge = '은퇴 목표 연령은 45~90세 범위로 입력해주세요.';
    }

    if (
      form.spouseRetirementTargetAge !== '' &&
      (!Number.isFinite(form.spouseRetirementTargetAge) ||
        Number(form.spouseRetirementTargetAge) < 45 ||
        Number(form.spouseRetirementTargetAge) > 90)
    ) {
      nextErrors.spouseRetirementTargetAge = '배우자 은퇴 목표 연령은 45~90세 범위로 입력해주세요.';
    }

    if (!form.currency.trim()) nextErrors.currency = '통화를 입력해주세요.';

    setErrors(nextErrors);

    if (!isValid || Object.keys(nextErrors).length > 0) {
      setMessageText('입력값을 확인해주세요.');
      return;
    }

    setSaving(true);
    const payload = {
      fullName: form.fullName.trim(),
      birthDate: form.birthDate,
      employerName: form.employerName?.trim() || undefined,
      jobTitle: form.jobTitle?.trim() || undefined,
      baseSalaryAnnual: form.baseSalaryAnnual === '' ? undefined : Number(form.baseSalaryAnnual),
      annualFixedExtra:
        form.annualFixedExtra === '' ? undefined : Number(form.annualFixedExtra),
      annualBonus: form.annualBonus === '' ? undefined : Number(form.annualBonus),
      annualRsu: form.annualRsu === '' ? undefined : Number(form.annualRsu),
      rsuShares: form.rsuShares === '' ? undefined : Number(form.rsuShares),
      rsuVestingPriceUsd:
        form.rsuVestingPriceUsd === '' ? undefined : Number(form.rsuVestingPriceUsd),
      rsuVestingCycle: form.rsuVestingCycle || undefined,
      annualRaiseRatePct:
        form.annualRaiseRatePct === '' ? undefined : Number(form.annualRaiseRatePct),
      spouseName: form.spouseName?.trim() || undefined,
      spouseBirthDate: form.spouseBirthDate || undefined,
      spouseEmployerName: form.spouseEmployerName?.trim() || undefined,
      spouseJobTitle: form.spouseJobTitle?.trim() || undefined,
      spouseAnnualIncome: form.spouseAnnualIncome === '' ? undefined : Number(form.spouseAnnualIncome),
      spouseRetirementTargetAge:
        form.spouseRetirementTargetAge === '' ? undefined : Number(form.spouseRetirementTargetAge),
      child1Name: form.child1Name?.trim() || undefined,
      child1BirthDate: form.child1BirthDate || undefined,
      child1TargetUniversityYear:
        form.child1TargetUniversityYear === '' ? undefined : Number(form.child1TargetUniversityYear),
      child2Name: form.child2Name?.trim() || undefined,
      child2BirthDate: form.child2BirthDate || undefined,
      child2TargetUniversityYear:
        form.child2TargetUniversityYear === '' ? undefined : Number(form.child2TargetUniversityYear),
      retirementTargetAge:
        form.retirementTargetAge === '' ? undefined : Number(form.retirementTargetAge),
      householdSize: Number(form.householdSize),
      currency: form.currency.trim().toUpperCase()
    };

    const result = exists
      ? await api.updateProfile(payload)
      : await api.createProfile(payload);

    if (result.error) {
      setErrorMessage('저장 실패', result.error);
    } else {
      setExists(true);
      setSuccessMessage('프로파일이 저장되었습니다.');
    }

    setSaving(false);
  }

  function getTabButtonClass(tab: ProfileTab): string {
    return activeTab === tab
      ? 'btn-primary flex-1 sm:flex-none'
      : 'btn-subtle flex-1 sm:flex-none';
  }

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="py-4">
      <div className="mx-auto grid w-full max-w-[860px] gap-5">
        <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_10px_24px_rgba(15,23,42,0.045)]">
          <h1>설정</h1>
          <p className="helper-text mt-2 leading-relaxed">
            로그인은 Azure Static Web Apps 인증을 사용합니다.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {!isAuthenticated ? (
              <>
                <a href="/.auth/login/aad" className="btn-primary no-underline">
                  Microsoft 로그인
                </a>
                <a href="/.auth/login/github" className="btn-danger-outline no-underline">
                  GitHub 로그인
                </a>
              </>
            ) : (
              <a href="/.auth/logout" className="btn-danger-outline no-underline">
                로그아웃
              </a>
            )}
          </div>
        </section>

        {!isAuthenticated ? (
          <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
            <p className="helper-text leading-relaxed">
              로그인 후 개인 프로파일 입력 폼이 표시됩니다.
            </p>
          </section>
        ) : null}

        {!isAuthenticated ? null : (
          <form
            onSubmit={onSubmit}
            className="grid gap-5 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_10px_24px_rgba(15,23,42,0.045)] md:p-6 [&_.helper-text]:text-[0.86rem] [&_.helper-text]:font-semibold [&_.helper-text]:leading-5 [&_.helper-text]:text-[var(--muted)]"
          >
            <div className="flex flex-wrap gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-1">
              <button
                type="button"
                className={getTabButtonClass('self')}
                onClick={() => setActiveTab('self')}
              >
                본인
              </button>
              <button
                type="button"
                className={getTabButtonClass('spouse')}
                onClick={() => setActiveTab('spouse')}
              >
                배우자
              </button>
              <button
                type="button"
                className={getTabButtonClass('children')}
                onClick={() => setActiveTab('children')}
              >
                자녀
              </button>
              <button
                type="button"
                className={getTabButtonClass('settings')}
                onClick={() => setActiveTab('settings')}
              >
                기본설정
              </button>
            </div>

            <div className="grid gap-4">
              {activeTab === 'self' ? <SelfTab form={form} setForm={setForm} errors={errors} /> : null}
              {activeTab === 'spouse' ? <SpouseTab form={form} setForm={setForm} errors={errors} /> : null}
              {activeTab === 'children' ? <ChildrenTab form={form} setForm={setForm} errors={errors} /> : null}
              {activeTab === 'settings' ? <SettingsTab form={form} setForm={setForm} errors={errors} /> : null}
            </div>

            <button
              type="submit"
              disabled={saving}
              className="btn-primary mt-1 w-full sm:w-auto"
            >
              {saving ? '저장 중...' : exists ? '프로파일 업데이트' : '프로파일 저장'}
            </button>
          </form>
        )}

        <FeedbackBanner feedback={feedback} />
      </div>
    </div>
  );
}
