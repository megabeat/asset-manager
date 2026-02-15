'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

type Asset = {
  id: string;
  name: string;
  currentValue: number;
  category: string;
};

export default function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getAssets().then((result) => {
      if (result.data) {
        setAssets(result.data);
      }
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <div style={{ padding: '2rem' }}>로딩 중...</div>;
  }

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>자산 관리</h1>
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
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
