'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, Profile } from '@/lib/api';

const defaultForm: Profile = {
  fullName: '',
  birthDate: '',
  householdSize: 1,
  currency: 'KRW'
};

export default function ProfilePage() {
  const [form, setForm] = useState<Profile>(defaultForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exists, setExists] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    api.getProfile().then((result) => {
      if (!mounted) return;

      if (result.data) {
        setForm({
          fullName: result.data.fullName ?? '',
          birthDate: result.data.birthDate ?? '',
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
      Number.isFinite(form.householdSize) &&
      form.householdSize > 0 &&
      form.currency.trim().length > 0
    );
  }, [form]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!isValid) {
      setMessage('입력값을 확인해주세요.');
      return;
    }

    setSaving(true);
    const payload = {
      fullName: form.fullName.trim(),
      birthDate: form.birthDate,
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
      <h1>프로파일</h1>

      <form onSubmit={onSubmit} style={{ marginTop: '1.5rem', maxWidth: 520, display: 'grid', gap: '0.9rem' }}>
        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <span>이름</span>
          <input
            value={form.fullName}
            onChange={(event) => setForm((prev) => ({ ...prev, fullName: event.target.value }))}
            placeholder="홍길동"
            style={{ padding: '0.65rem', border: '1px solid #d0d0d0', borderRadius: 8 }}
          />
        </label>

        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <span>생년월일</span>
          <input
            type="date"
            value={form.birthDate}
            onChange={(event) => setForm((prev) => ({ ...prev, birthDate: event.target.value }))}
            style={{ padding: '0.65rem', border: '1px solid #d0d0d0', borderRadius: 8 }}
          />
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
        </label>

        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <span>통화</span>
          <input
            value={form.currency}
            onChange={(event) => setForm((prev) => ({ ...prev, currency: event.target.value }))}
            placeholder="KRW"
            style={{ padding: '0.65rem', border: '1px solid #d0d0d0', borderRadius: 8 }}
          />
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
