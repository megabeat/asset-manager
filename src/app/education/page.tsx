'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

type Child = {
  id: string;
  name: string;
  birthYear: number;
  grade: string;
};

export default function EducationPage() {
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getChildren().then((result) => {
      if (result.data) {
        setChildren(result.data);
      }
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <div style={{ padding: '2rem' }}>로딩 중...</div>;
  }

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>교육비 시뮬레이션</h1>
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
    </div>
  );
}
