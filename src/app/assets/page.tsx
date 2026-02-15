'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, Asset } from '@/lib/api';

type AssetForm = {
  category: string;
  name: string;
  currentValue: number;
  valuationDate: string;
  note: string;
};

const defaultForm: AssetForm = {
  category: 'cash',
  name: '',
  currentValue: 0,
  valuationDate: new Date().toISOString().slice(0, 10),
  note: ''
};

export default function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<AssetForm>(defaultForm);
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function loadAssets() {
    const result = await api.getAssets();
    if (result.data) {
      setAssets(result.data);
    }
    if (result.error) {
      setMessage(`목록 조회 실패: ${result.error.message}`);
    }
  }

  useEffect(() => {
    loadAssets().finally(() => {
      setLoading(false);
    });
  }, []);

  const totalAssetValue = useMemo(
    () => assets.reduce((sum, asset) => sum + (asset.currentValue ?? 0), 0),
    [assets]
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const nextErrors: Record<string, string> = {};

    if (!form.name.trim()) nextErrors.name = '자산명을 입력해주세요.';
    if (form.currentValue < 0) nextErrors.currentValue = '금액은 0 이상이어야 합니다.';
    if (!form.valuationDate) nextErrors.valuationDate = '평가일을 선택해주세요.';
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      setMessage('자산명, 평가일, 금액을 확인해주세요.');
      return;
    }

    setSaving(true);
    const result = await api.createAsset({
      category: form.category,
      name: form.name.trim(),
      currentValue: Number(form.currentValue),
      valuationDate: form.valuationDate,
      note: form.note.trim()
    });

    if (result.error) {
      setMessage(`저장 실패: ${result.error.message}`);
    } else {
      setForm(defaultForm);
      setMessage('자산이 저장되었습니다.');
      await loadAssets();
    }

    setSaving(false);
  }

  async function onDelete(id: string) {
    setMessage(null);
    const result = await api.deleteAsset(id);
    if (result.error) {
      setMessage(`삭제 실패: ${result.error.message}`);
      return;
    }

    setAssets((prev) => prev.filter((asset) => asset.id !== id));
    setMessage('자산을 삭제했습니다.');
  }

  if (loading) {
    return <div style={{ padding: '2rem' }}>로딩 중...</div>;
  }

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>자산 관리</h1>

      <form
        onSubmit={onSubmit}
        style={{
          marginTop: '1.25rem',
          display: 'grid',
          gap: '0.75rem',
          maxWidth: 720,
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))'
        }}
      >
        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <span>카테고리</span>
          <select
            value={form.category}
            onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
            style={{ padding: '0.6rem', border: '1px solid #d0d0d0', borderRadius: 8 }}
          >
            <option value="cash">현금</option>
            <option value="deposit">예금</option>
            <option value="investment">투자</option>
            <option value="real_estate">부동산</option>
            <option value="etc">기타</option>
          </select>
        </label>

        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <span>자산명</span>
          <input
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="예: CMA 통장"
            style={{ padding: '0.6rem', border: '1px solid #d0d0d0', borderRadius: 8 }}
          />
          {errors.name && <p className="form-error">{errors.name}</p>}
        </label>

        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <span>현재가치(원)</span>
          <input
            type="number"
            min={0}
            value={form.currentValue}
            onChange={(event) => setForm((prev) => ({ ...prev, currentValue: Number(event.target.value || 0) }))}
            style={{ padding: '0.6rem', border: '1px solid #d0d0d0', borderRadius: 8 }}
          />
          {errors.currentValue && <p className="form-error">{errors.currentValue}</p>}
        </label>

        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <span>평가일</span>
          <input
            type="date"
            value={form.valuationDate}
            onChange={(event) => setForm((prev) => ({ ...prev, valuationDate: event.target.value }))}
            style={{ padding: '0.6rem', border: '1px solid #d0d0d0', borderRadius: 8 }}
          />
          {errors.valuationDate && <p className="form-error">{errors.valuationDate}</p>}
        </label>

        <label style={{ display: 'grid', gap: '0.35rem', gridColumn: '1 / -1' }}>
          <span>메모</span>
          <input
            value={form.note}
            onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
            placeholder="선택 입력"
            style={{ padding: '0.6rem', border: '1px solid #d0d0d0', borderRadius: 8 }}
          />
        </label>

        <button
          type="submit"
          disabled={saving}
          style={{
            width: 180,
            padding: '0.7rem 1rem',
            borderRadius: 8,
            border: '1px solid #0b63ce',
            backgroundColor: '#0b63ce',
            color: '#fff',
            cursor: saving ? 'not-allowed' : 'pointer'
          }}
        >
          {saving ? '저장 중...' : '자산 추가'}
        </button>
      </form>

      <p style={{ marginTop: '1rem', fontWeight: 600 }}>
        총 자산: {totalAssetValue.toLocaleString()}원
      </p>

      {message && <p>{message}</p>}

      <div style={{ marginTop: '2rem' }}>
        {assets.length === 0 ? (
          <p>등록된 자산이 없습니다.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #ddd' }}>
                <th style={{ padding: '1rem', textAlign: 'left' }}>자산명</th>
                <th style={{ padding: '1rem', textAlign: 'left' }}>카테고리</th>
                <th style={{ padding: '1rem', textAlign: 'right' }}>현재가치</th>
                <th style={{ padding: '1rem', textAlign: 'center' }}>관리</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((asset) => (
                <tr key={asset.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '1rem' }}>{asset.name}</td>
                  <td style={{ padding: '1rem' }}>{asset.category}</td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    {asset.currentValue.toLocaleString()}원
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'center' }}>
                    <button
                      onClick={() => onDelete(asset.id)}
                      style={{
                        padding: '0.45rem 0.7rem',
                        border: '1px solid #d32f2f',
                        color: '#d32f2f',
                        backgroundColor: '#fff',
                        borderRadius: 6,
                        cursor: 'pointer'
                      }}
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
