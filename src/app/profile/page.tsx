'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, Profile } from '@/lib/api';

type ProfileForm = Omit<
  Profile,
  'retirementTargetAge' | 'baseSalaryAnnual' | 'annualBonus' | 'annualRsu' | 'annualRaiseRatePct'
> & {
  retirementTargetAge: number | '';
  baseSalaryAnnual: number | '';
  annualBonus: number | '';
  annualRsu: number | '';
  annualRaiseRatePct: number | '';
};

const defaultForm: ProfileForm = {
  fullName: '',
  birthDate: '',
  employerName: '',
  jobTitle: '',
  baseSalaryAnnual: '',
  annualBonus: '',
  annualRsu: '',
  annualRaiseRatePct: '',
  child1Name: '',
  child1BirthDate: '',
  child2Name: '',
  child2BirthDate: '',
  retirementTargetAge: '',
  householdSize: 1,
  currency: 'KRW'
};

export default function ProfilePage() {
  const [form, setForm] = useState<ProfileForm>(defaultForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exists, setExists] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let mounted = true;

    api.getProfile().then((result) => {
      if (!mounted) return;

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
          child1Name: result.data.child1Name ?? '',
          child1BirthDate: result.data.child1BirthDate ?? '',
          child2Name: result.data.child2Name ?? '',
          child2BirthDate: result.data.child2BirthDate ?? '',
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
    });

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

    if (form.child2Name?.trim() && !form.child2BirthDate) {
      nextErrors.child2BirthDate = '자녀2 생년월일을 입력해주세요.';
    }
    if (!form.child2Name?.trim() && form.child2BirthDate) {
      nextErrors.child2Name = '자녀2 이름을 입력해주세요.';
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
      annualRaiseRatePct:
        form.annualRaiseRatePct === '' ? undefined : Number(form.annualRaiseRatePct),
      child1Name: form.child1Name?.trim() || undefined,
      child1BirthDate: form.child1BirthDate || undefined,
      child2Name: form.child2Name?.trim() || undefined,
      child2BirthDate: form.child2BirthDate || undefined,
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

  if (loading) {
    return <div style={{ padding: '2rem' }}>로딩 중...</div>;
  }

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>설정</h1>
      <p className="helper-text" style={{ marginTop: '0.5rem' }}>
        로그인은 Azure Static Web Apps 인증을 사용합니다.
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
        <a href="/.auth/login/aad" className="btn-primary" style={{ textDecoration: 'none' }}>
          Microsoft 로그인
        </a>
        <a href="/.auth/login/github" className="btn-danger-outline" style={{ textDecoration: 'none' }}>
          GitHub 로그인
        </a>
        <a href="/.auth/logout" className="btn-danger-outline" style={{ textDecoration: 'none' }}>
          로그아웃
        </a>
      </div>

      <form onSubmit={onSubmit} style={{ marginTop: '1.5rem', maxWidth: 520, display: 'grid', gap: '0.9rem' }}>
        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <span>이름</span>
          <input
            value={form.fullName}
            onChange={(event) => setForm((prev) => ({ ...prev, fullName: event.target.value }))}
            placeholder="홍길동"
            style={{ padding: '0.65rem', border: '1px solid #d0d0d0', borderRadius: 8 }}
          />
          {errors.fullName && <p className="form-error">{errors.fullName}</p>}
        </label>

        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <span>생년월일</span>
          <input
            type="date"
            value={form.birthDate}
            onChange={(event) => setForm((prev) => ({ ...prev, birthDate: event.target.value }))}
            style={{ padding: '0.65rem', border: '1px solid #d0d0d0', borderRadius: 8 }}
          />
          {errors.birthDate && <p className="form-error">{errors.birthDate}</p>}
        </label>

        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <span>직장명</span>
          <input
            value={form.employerName ?? ''}
            onChange={(event) => setForm((prev) => ({ ...prev, employerName: event.target.value }))}
            placeholder="예: Microsoft"
          />
        </label>

        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <span>직무/직급</span>
          <input
            value={form.jobTitle ?? ''}
            onChange={(event) => setForm((prev) => ({ ...prev, jobTitle: event.target.value }))}
            placeholder="예: Senior Software Engineer"
          />
        </label>

        <label style={{ display: 'grid', gap: '0.35rem' }}>
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

        <label style={{ display: 'grid', gap: '0.35rem' }}>
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

        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <span>연간 RSU</span>
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

        <label style={{ display: 'grid', gap: '0.35rem' }}>
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

        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <span>자녀1 이름</span>
          <input
            value={form.child1Name ?? ''}
            onChange={(event) => setForm((prev) => ({ ...prev, child1Name: event.target.value }))}
            placeholder="예: 자녀1"
          />
          {errors.child1Name && <p className="form-error">{errors.child1Name}</p>}
        </label>

        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <span>자녀1 생년월일</span>
          <input
            type="date"
            value={form.child1BirthDate ?? ''}
            onChange={(event) => setForm((prev) => ({ ...prev, child1BirthDate: event.target.value }))}
          />
          {errors.child1BirthDate && <p className="form-error">{errors.child1BirthDate}</p>}
        </label>

        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <span>자녀2 이름</span>
          <input
            value={form.child2Name ?? ''}
            onChange={(event) => setForm((prev) => ({ ...prev, child2Name: event.target.value }))}
            placeholder="예: 자녀2"
          />
          {errors.child2Name && <p className="form-error">{errors.child2Name}</p>}
        </label>

        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <span>자녀2 생년월일</span>
          <input
            type="date"
            value={form.child2BirthDate ?? ''}
            onChange={(event) => setForm((prev) => ({ ...prev, child2BirthDate: event.target.value }))}
          />
          {errors.child2BirthDate && <p className="form-error">{errors.child2BirthDate}</p>}
        </label>

        <label style={{ display: 'grid', gap: '0.35rem' }}>
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

        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <span>가구원 수</span>
          <input
            type="number"
            min={1}
            value={form.householdSize}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, householdSize: Number(event.target.value || 1) }))
            }
            style={{ padding: '0.65rem', border: '1px solid #d0d0d0', borderRadius: 8 }}
          />
          {errors.householdSize && <p className="form-error">{errors.householdSize}</p>}
        </label>

        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <span>통화</span>
          <input
            value={form.currency}
            onChange={(event) => setForm((prev) => ({ ...prev, currency: event.target.value }))}
            placeholder="KRW"
            style={{ padding: '0.65rem', border: '1px solid #d0d0d0', borderRadius: 8 }}
          />
          {errors.currency && <p className="form-error">{errors.currency}</p>}
        </label>

        <button
          type="submit"
          disabled={saving}
          style={{
            marginTop: '0.35rem',
            padding: '0.75rem 1rem',
            borderRadius: 8,
            border: '1px solid #0b63ce',
            backgroundColor: '#0b63ce',
            color: '#fff',
            cursor: saving ? 'not-allowed' : 'pointer'
          }}
        >
          {saving ? '저장 중...' : exists ? '프로파일 업데이트' : '프로파일 저장'}
        </button>
      </form>

      {message && <p style={{ marginTop: '1rem' }}>{message}</p>}
    </div>
  );
}
