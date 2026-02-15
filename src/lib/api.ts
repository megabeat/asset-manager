const API_BASE = '/api';

export type ApiResponse<T> = {
  data: T | null;
  error: { code: string; message: string; details?: unknown } | null;
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
        ...options?.headers
      }
    });

    const json = await response.json();
    return json as ApiResponse<T>;
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
  getProfile: () => fetchApi<{ fullName: string; birthDate: string; householdSize: number; currency: string }>('/profile'),
  createProfile: (data: { fullName: string; birthDate: string; householdSize: number; currency: string }) =>
    fetchApi('/profile', { method: 'POST', body: JSON.stringify(data) }),
  updateProfile: (data: Partial<{ fullName: string; birthDate: string; householdSize: number; currency: string }>) =>
    fetchApi('/profile', { method: 'PUT', body: JSON.stringify(data) }),

  // Assets
  getAssets: (category?: string) =>
    fetchApi<Array<{ id: string; name: string; currentValue: number; category: string }>>(`/assets${category ? `?category=${category}` : ''}`),
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
