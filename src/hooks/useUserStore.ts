'use client';

import { useCallback, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'asset-app-user-id';
const DEFAULT_USER = 'demo-user';

type UserOption = { id: string; label: string; description?: string };

export const USER_OPTIONS: UserOption[] = [
  { id: 'demo-user', label: 'Kevin', description: '실제 데이터' },
  { id: 'demo-visitor', label: 'Demo User', description: '데모 데이터' },
];

// ---------- tiny pub-sub for cross-component sync ----------
const listeners = new Set<() => void>();
function emitChange() {
  listeners.forEach((fn) => fn());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): string {
  if (typeof window === 'undefined') return DEFAULT_USER;
  return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_USER;
}

function getServerSnapshot(): string {
  return DEFAULT_USER;
}

// ---------- public hook ----------

export function useUserStore() {
  const userId = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setUserId = useCallback((id: string) => {
    localStorage.setItem(STORAGE_KEY, id);
    emitChange();
    // Force full page data refresh
    window.location.reload();
  }, []);

  return { userId, setUserId, options: USER_OPTIONS };
}

/** Non-hook helper for api.ts (runs outside React) */
export function getCurrentUserId(): string {
  if (typeof window === 'undefined') return DEFAULT_USER;
  return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_USER;
}
