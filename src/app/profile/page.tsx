'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, Profile } from '@/lib/api';

type ProfileForm = Omit<
  Profile,
  | 'retirementTargetAge'
  | 'baseSalaryAnnual'
  | 'annualBonus'
  | 'annualRsu'
  | 'annualRaiseRatePct'
  | 'rsuShares'
  | 'rsuVestingPriceUsd'
  | 'child1TargetUniversityYear'
  | 'child2TargetUniversityYear'
> & {
  retirementTargetAge: number | '';
  baseSalaryAnnual: number | '';
  annualBonus: number | '';
  annualRsu: number | '';
  annualRaiseRatePct: number | '';
  rsuShares: number | '';
  rsuVestingPriceUsd: number | '';
  child1TargetUniversityYear: number | '';
  child2TargetUniversityYear: number | '';
};

type ProfileTab = 'basic' | 'income' | 'family';

const currentYear = new Date().getFullYear();

const defaultForm: ProfileForm = {
  fullName: '',
  birthDate: '',
  employerName: '',
  jobTitle: '',
  baseSalaryAnnual: '',
  annualBonus: '',
  annualRsu: '',
  annualRaiseRatePct: '',
  rsuShares: '',
  rsuVestingPriceUsd: '',
  rsuVestingCycle: 'quarterly',
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
  const [activeTab, setActiveTab] = useState<ProfileTab>('basic');
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [exists, setExists] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
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
          annualBonus: result.data.annualBonus ?? '',
          annualRsu: result.data.annualRsu ?? '',
          annualRaiseRatePct: result.data.annualRaiseRatePct ?? '',
          rsuShares: result.data.rsuShares ?? '',
          rsuVestingPriceUsd: result.data.rsuVestingPriceUsd ?? '',
          rsuVestingCycle: result.data.rsuVestingCycle ?? 'quarterly',
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
        setMessage(`불러오기 실패: ${result.error.message}`);
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
      form.currency.trim().length > 0
    );
  }, [form]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const nextErrors: Record<string, string> = {};

    if (!form.fullName.trim()) nextErrors.fullName = '이름을 입력해주세요.';
    if (!form.birthDate.trim()) nextErrors.birthDate = '생년월일을 입력해주세요.';
    if (!Number.isFinite(form.householdSize) || form.householdSize <= 0) {
      nextErrors.householdSize = '가구원 수는 1 이상이어야 합니다.';
    }

    if (form.baseSalaryAnnual !== '' && Number(form.baseSalaryAnnual) < 0) {
      nextErrors.baseSalaryAnnual = '기본급은 0 이상이어야 합니다.';
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

    if (!form.currency.trim()) nextErrors.currency = '통화를 입력해주세요.';

    setErrors(nextErrors);

    if (!isValid || Object.keys(nextErrors).length > 0) {
      setMessage('입력값을 확인해주세요.');
      return;
    }

    setSaving(true);
    const payload = {
      fullName: form.fullName.trim(),
      birthDate: form.birthDate,
      employerName: form.employerName?.trim() || undefined,
      jobTitle: form.jobTitle?.trim() || undefined,
      baseSalaryAnnual: form.baseSalaryAnnual === '' ? undefined : Number(form.baseSalaryAnnual),
      annualBonus: form.annualBonus === '' ? undefined : Number(form.annualBonus),
      annualRsu: form.annualRsu === '' ? undefined : Number(form.annualRsu),
      rsuShares: form.rsuShares === '' ? undefined : Number(form.rsuShares),
      rsuVestingPriceUsd:
        form.rsuVestingPriceUsd === '' ? undefined : Number(form.rsuVestingPriceUsd),
      rsuVestingCycle: form.rsuVestingCycle || undefined,
      annualRaiseRatePct:
        form.annualRaiseRatePct === '' ? undefined : Number(form.annualRaiseRatePct),
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
      setMessage(`저장 실패: ${result.error.message}`);
    } else {
      setExists(true);
      setMessage('프로파일이 저장되었습니다.');
    }

    setSaving(false);
  }

  function getTabButtonClass(tab: ProfileTab): string {
    return activeTab === tab
      ? 'btn-primary flex-1 sm:flex-none'
      : 'btn-subtle flex-1 sm:flex-none';
  }

  if (loading) {
    return <div className="p-5 sm:p-8">로딩 중...</div>;
  }

  return (
    <div className="p-5 sm:p-8">
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
            className="grid gap-5 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_10px_24px_rgba(15,23,42,0.045)] md:p-6 [&_.form-field>span]:text-[0.86rem] [&_.form-field>span]:font-semibold [&_.form-field>span]:leading-5 [&_.form-field>span]:text-[var(--muted)]"
          >
            <div className="flex flex-wrap gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-1">
              <button
                type="button"
                className={getTabButtonClass('basic')}
                onClick={() => setActiveTab('basic')}
              >
                기본정보
              </button>
              <button
                type="button"
                className={getTabButtonClass('income')}
                onClick={() => setActiveTab('income')}
              >
                소득정보
              </button>
              <button
                type="button"
                className={getTabButtonClass('family')}
                onClick={() => setActiveTab('family')}
              >
                가족/은퇴
              </button>
            </div>

            <div className="grid gap-4">
              {activeTab === 'basic' ? (
                <>
            <label className="form-field">
              <span>이름</span>
              <input
                value={form.fullName}
                onChange={(event) => setForm((prev) => ({ ...prev, fullName: event.target.value }))}
                placeholder="홍길동"
              />
              {errors.fullName && <p className="form-error">{errors.fullName}</p>}
            </label>

            <label className="form-field">
              <span>생년월일</span>
              <input
                type="date"
                value={form.birthDate}
                onChange={(event) => setForm((prev) => ({ ...prev, birthDate: event.target.value }))}
              />
              {errors.birthDate && <p className="form-error">{errors.birthDate}</p>}
            </label>

            <label className="form-field">
              <span>가구원 수</span>
              <input
                type="number"
                min={1}
                value={form.householdSize}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, householdSize: Number(event.target.value || 1) }))
                }
              />
              {errors.householdSize && <p className="form-error">{errors.householdSize}</p>}
            </label>

            <label className="form-field">
              <span>통화</span>
              <input
                value={form.currency}
                onChange={(event) => setForm((prev) => ({ ...prev, currency: event.target.value }))}
                placeholder="KRW"
              />
              {errors.currency && <p className="form-error">{errors.currency}</p>}
            </label>
                </>
              ) : null}

              {activeTab === 'income' ? (
                <>
            <label className="form-field">
              <span>직장명</span>
              <input
                value={form.employerName ?? ''}
                onChange={(event) => setForm((prev) => ({ ...prev, employerName: event.target.value }))}
                placeholder="예: Microsoft"
              />
            </label>

            <label className="form-field">
              <span>직무/직급</span>
              <input
                value={form.jobTitle ?? ''}
                onChange={(event) => setForm((prev) => ({ ...prev, jobTitle: event.target.value }))}
                placeholder="예: Senior Software Engineer"
              />
            </label>

            <label className="form-field">
              <span>직장 기본급(연)</span>
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
              {errors.baseSalaryAnnual && <p className="form-error">{errors.baseSalaryAnnual}</p>}
            </label>

            <label className="form-field">
              <span>연간 보너스</span>
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
              {errors.annualBonus && <p className="form-error">{errors.annualBonus}</p>}
            </label>

            <label className="form-field">
              <span>연간 RSU(원화 환산)</span>
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
              {errors.annualRsu && <p className="form-error">{errors.annualRsu}</p>}
            </label>

            <label className="form-field">
              <span>RSU 주식수</span>
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
              {errors.rsuShares && <p className="form-error">{errors.rsuShares}</p>}
            </label>

            <label className="form-field">
              <span>RSU 베스팅 시가(USD)</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.rsuVestingPriceUsd}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    rsuVestingPriceUsd:
                      event.target.value === '' ? '' : Number(event.target.value)
                  }))
                }
                placeholder="예: 420"
              />
              {errors.rsuVestingPriceUsd && <p className="form-error">{errors.rsuVestingPriceUsd}</p>}
            </label>

            <label className="form-field">
              <span>RSU 베스팅 주기</span>
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
            </label>

            <label className="form-field">
              <span>연간 연봉 상승률(%)</span>
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
              {errors.annualRaiseRatePct && <p className="form-error">{errors.annualRaiseRatePct}</p>}
            </label>
                </>
              ) : null}

              {activeTab === 'family' ? (
                <>
            <label className="form-field">
              <span>자녀1 이름</span>
              <input
                value={form.child1Name ?? ''}
                onChange={(event) => setForm((prev) => ({ ...prev, child1Name: event.target.value }))}
                placeholder="예: 자녀1"
              />
              {errors.child1Name && <p className="form-error">{errors.child1Name}</p>}
            </label>

            <label className="form-field">
              <span>자녀1 생년월일</span>
              <input
                type="date"
                value={form.child1BirthDate ?? ''}
                onChange={(event) => setForm((prev) => ({ ...prev, child1BirthDate: event.target.value }))}
              />
              {errors.child1BirthDate && <p className="form-error">{errors.child1BirthDate}</p>}
            </label>

            <label className="form-field">
              <span>자녀1 예상 대학 진학년도</span>
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
              {errors.child1TargetUniversityYear && <p className="form-error">{errors.child1TargetUniversityYear}</p>}
            </label>

            <label className="form-field">
              <span>자녀2 이름</span>
              <input
                value={form.child2Name ?? ''}
                onChange={(event) => setForm((prev) => ({ ...prev, child2Name: event.target.value }))}
                placeholder="예: 자녀2"
              />
              {errors.child2Name && <p className="form-error">{errors.child2Name}</p>}
            </label>

            <label className="form-field">
              <span>자녀2 생년월일</span>
              <input
                type="date"
                value={form.child2BirthDate ?? ''}
                onChange={(event) => setForm((prev) => ({ ...prev, child2BirthDate: event.target.value }))}
              />
              {errors.child2BirthDate && <p className="form-error">{errors.child2BirthDate}</p>}
            </label>

            <label className="form-field">
              <span>자녀2 예상 대학 진학년도</span>
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
              {errors.child2TargetUniversityYear && <p className="form-error">{errors.child2TargetUniversityYear}</p>}
            </label>

            <label className="form-field">
              <span>은퇴 목표 연령</span>
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
              {errors.retirementTargetAge && <p className="form-error">{errors.retirementTargetAge}</p>}
            </label>
                </>
              ) : null}
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

        {message && (
          <p className={message.includes('실패') ? 'form-error m-0' : 'helper-text leading-relaxed'}>
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
