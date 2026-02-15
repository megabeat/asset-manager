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
  symbol?: string;
  exchangeRate?: number;
  usdAmount?: number;
  pensionMonthlyContribution?: number;
  pensionReceiveStart?: string;
  pensionReceiveAge?: number;
  note?: string;
};

export type Expense = {
  id: string;
  name: string;
  amount: number;
  expenseType: 'fixed' | 'subscription';
  cycle: 'monthly' | 'yearly';
  billingDay?: number | null;
  category?: string;
};

export type Income = {
  id: string;
  name: string;
  amount: number;
  cycle: 'monthly' | 'yearly' | 'one_time';
  category?: string;
  note?: string;
};

export type Liability = {
  id: string;
  name: string;
  amount: number;
  category?: string;
  note?: string;
};

export type Child = {
  id: string;
  name: string;
  birthYear: number;
  grade: string;
  targetUniversityYear: number;
};

export type EducationPlan = {
  id: string;
  childId: string;
  annualCost: number;
  inflationRate: number;
  startYear: number;
  endYear: number;
};

export type EducationSimulationResult = {
  totalCost: number;
  yearly: Array<{ year: number; cost: number }>;
};

export type Conversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | string;
  content: string;
  createdAt?: string;
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
  getChildren: () => fetchApi<Child[]>('/children'),
  createChild: (data: unknown) => fetchApi('/children', { method: 'POST', body: JSON.stringify(data) }),

  // Expenses
  getExpenses: (type?: string) => fetchApi<Expense[]>(`/expenses${type ? `?type=${type}` : ''}`),
  createExpense: (data: unknown) => fetchApi('/expenses', { method: 'POST', body: JSON.stringify(data) }),
  updateExpense: (id: string, data: unknown) =>
    fetchApi(`/expenses/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteExpense: (id: string) => fetchApi(`/expenses/${id}`, { method: 'DELETE' }),

  // Incomes
  getIncomes: () => fetchApi<Income[]>('/incomes'),
  createIncome: (data: unknown) => fetchApi('/incomes', { method: 'POST', body: JSON.stringify(data) }),
  updateIncome: (id: string, data: unknown) =>
    fetchApi(`/incomes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteIncome: (id: string) => fetchApi(`/incomes/${id}`, { method: 'DELETE' }),

  // Liabilities
  getLiabilities: () => fetchApi<Liability[]>('/liabilities'),
  createLiability: (data: unknown) =>
    fetchApi('/liabilities', { method: 'POST', body: JSON.stringify(data) }),
  updateLiability: (id: string, data: unknown) =>
    fetchApi(`/liabilities/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteLiability: (id: string) => fetchApi(`/liabilities/${id}`, { method: 'DELETE' }),

  // Education Plans
  getEducationPlans: () => fetchApi<EducationPlan[]>('/education-plans'),
  createEducationPlan: (data: unknown) =>
    fetchApi('/education-plans', { method: 'POST', body: JSON.stringify(data) }),
  updateEducationPlan: (id: string, data: unknown) =>
    fetchApi(`/education-plans/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteEducationPlan: (id: string) => fetchApi(`/education-plans/${id}`, { method: 'DELETE' }),
  simulateEducation: (planId: string, data: unknown) =>
    fetchApi<EducationSimulationResult>(`/education-plans/${planId}/simulate`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  // AI Conversations
  getConversations: () => fetchApi<Conversation[]>('/ai/conversations'),
  createConversation: () => fetchApi<{ id: string }>('/ai/conversations', { method: 'POST', body: JSON.stringify({}) }),
  getMessages: (conversationId: string) => fetchApi<ChatMessage[]>(`/ai/conversations/${conversationId}/messages`),
  sendMessage: (conversationId: string, message: string) =>
    fetchApi(`/ai/conversations/${conversationId}/messages`, { method: 'POST', body: JSON.stringify({ message }) })
};
