'use client';

import { useUserStore } from '@/hooks/useUserStore';

export function UserSwitcher() {
  const { userId, setUserId, options } = useUserStore();

  return (
    <div className="user-switcher">
      <select
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
        className="user-switcher-select"
        aria-label="사용자 전환"
      >
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}{opt.description ? ` — ${opt.description}` : ''}
          </option>
        ))}
      </select>
    </div>
  );
}
