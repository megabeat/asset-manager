const API_BASE = '/api';
const DEFAULT_USER_ID = 'demo-user';

export type ApiResponse<T> = {
  data: T | null;
  error: { code: string; message: string; details?: unknown } | null;
};

export type Profile = {
  id?: string;
  fullName: string;
  birthDate: string;
  householdSize: number;
  currency: string;
};

export type Asset = {
  id: string;
  name: string;
  category: string;
  currentValue: number;
  valuationDate: string;
  note?: string;
};

async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': DEFAULT_USER_ID,
        ...options?.headers
      }
    });

    let json: unknown = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }

    if (!response.ok) {
      const fallbackMessage = `HTTP ${response.status}`;
      const parsed = json as { error?: { code?: string; message?: string; details?: unknown } } | null;
      return {
        data: null,
        error: {
          code: parsed?.error?.code ?? 'API_ERROR',
          message: parsed?.error?.message ?? fallbackMessage,
          details: parsed?.error?.details
        }
      };
    }

    return (json as ApiResponse<T>) ?? { data: null, error: null };
  } catch (error) {
    return {
      data: null,
      error: {
        code: 'NETWORK_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error'
      }
    };
  }
}

export const api = {
  // Profile
  getProfile: () => fetchApi<Profile>('/profile'),
  createProfile: (data: Profile) =>
    fetchApi('/profile', { method: 'POST', body: JSON.stringify(data) }),
  updateProfile: (data: Partial<Profile>) =>
    fetchApi('/profile', { method: 'PUT', body: JSON.stringify(data) }),

  // Assets
  getAssets: (category?: string) => fetchApi<Asset[]>(`/assets${category ? `?category=${category}` : ''}`),
  createAsset: (data: unknown) => fetchApi('/assets', { method: 'POST', body: JSON.stringify(data) }),
  updateAsset: (id: string, data: unknown) => fetchApi(`/assets/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAsset: (id: string) => fetchApi(`/assets/${id}`, { method: 'DELETE' }),

  // Dashboard
  getDashboardSummary: () =>
    fetchApi<{ totalAssets: number; totalLiabilities: number; netWorth: number; monthlyFixedExpense: number }>('/dashboard/summary'),
  getAssetTrend: (range: '24h' | '7d' | '30d') =>
    fetchApi<Array<{ time: string; value: number }>>(`/dashboard/asset-trend?range=${range}`),

  // Children
  getChildren: () => fetchApi<Array<{ id: string; name: string; birthYear: number; grade: string }>>('/children'),
  createChild: (data: unknown) => fetchApi('/children', { method: 'POST', body: JSON.stringify(data) }),

  // Expenses
  getExpenses: (type?: string) => fetchApi<Array<{ id: string; name: string; amount: number }>>(`/expenses${type ? `?type=${type}` : ''}`),
  createExpense: (data: unknown) => fetchApi('/expenses', { method: 'POST', body: JSON.stringify(data) }),

  // Education Plans
  getEducationPlans: () => fetchApi<Array<{ id: string; childId: string; annualCost: number }>>('/education-plans'),
  simulateEducation: (planId: string, data: unknown) =>
    fetchApi(`/education-plans/${planId}/simulate`, { method: 'POST', body: JSON.stringify(data) }),

  // AI Conversations
  getConversations: () => fetchApi<Array<{ id: string; title: string; createdAt: string }>>('/ai/conversations'),
  createConversation: () => fetchApi<{ id: string }>('/ai/conversations', { method: 'POST', body: JSON.stringify({}) }),
  getMessages: (conversationId: string) =>
    fetchApi<Array<{ id: string; role: string; content: string }>>(`/ai/conversations/${conversationId}/messages`),
  sendMessage: (conversationId: string, message: string) =>
    fetchApi(`/ai/conversations/${conversationId}/messages`, { method: 'POST', body: JSON.stringify({ message }) })
};
