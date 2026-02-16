'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, GoalFund, GoalFundLog } from '@/lib/api';
import { SectionCard } from '@/components/ui/SectionCard';
import { FormField } from '@/components/ui/FormField';
import { FeedbackBanner } from '@/components/ui/FeedbackBanner';
import { useFeedbackMessage } from '@/hooks/useFeedbackMessage';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { formatCompact } from '@/lib/formatCompact';

type HorizonType = GoalFund['horizon'];
type VehicleType = GoalFund['vehicle'];
type StatusType = GoalFund['status'];

const horizonLabel: Record<HorizonType, string> = {
  short: '단기 (6개월 이내)',
  mid: '중기 (6~24개월)',
  long: '장기 (24개월 이상)'
};

const vehicleLabel: Record<VehicleType, string> = {
  savings: '적금',
  deposit: '예금',
  etf: 'ETF',
  stock: '주식',
  fund: '펀드',
  crypto: '암호화폐',
  cash: '현금',
  other: '기타'
};

const statusLabel: Record<StatusType, string> = {
  active: '진행중',
  paused: '일시중지',
  completed: '달성완료',
  cancelled: '취소'
};

const statusColor: Record<StatusType, string> = {
  active: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  paused: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  cancelled: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
};

const horizonColor: Record<HorizonType, string> = {
  short: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  mid: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  long: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300'
};

type GoalFundForm = {
  name: string;
  horizon: HorizonType;
  vehicle: VehicleType;
  targetAmount: number | '';
  currentAmount: number | '';
  monthlyContribution: number | '';
  targetDate: string;
  note: string;
  status: StatusType;
};

const defaultForm: GoalFundForm = {
  name: '',
  horizon: 'short',
  vehicle: 'savings',
  targetAmount: '',
  currentAmount: '',
  monthlyContribution: '',
  targetDate: '',
  note: '',
  status: 'active'
};

export default function GoalFundsPage() {
  const [funds, setFunds] = useState<GoalFund[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<GoalFundForm>(defaultForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { message, feedback, clearMessage, setSuccessMessage, setErrorMessage } = useFeedbackMessage();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [logMonth, setLogMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [logAmount, setLogAmount] = useState<number | ''>('');
  const [logNote, setLogNote] = useState('');
  const [filterHorizon, setFilterHorizon] = useState<'all' | HorizonType>('all');

  useEffect(() => {
    api.getGoalFunds().then((res) => {
      if (res.data) setFunds(res.data);
      setLoading(false);
    });
  }, []);

  const grouped = useMemo(() => {
    const filtered = filterHorizon === 'all' ? funds : funds.filter((f) => f.horizon === filterHorizon);
    const groups: Record<HorizonType, GoalFund[]> = { short: [], mid: [], long: [] };
    filtered.forEach((f) => groups[f.horizon].push(f));
    return groups;
  }, [funds, filterHorizon]);

  const summaryStats = useMemo(() => {
    const active = funds.filter((f) => f.status === 'active');
    const totalTarget = active.reduce((s, f) => s + f.targetAmount, 0);
    const totalCurrent = active.reduce((s, f) => s + f.currentAmount, 0);
    const totalMonthly = active.reduce((s, f) => s + f.monthlyContribution, 0);
    return { count: active.length, totalTarget, totalCurrent, totalMonthly };
  }, [funds]);

  function resetForm() {
    setForm(defaultForm);
    setEditingId(null);
    setErrors({});
    setShowForm(false);
  }

  function startEdit(fund: GoalFund) {
    setForm({
      name: fund.name,
      horizon: fund.horizon,
      vehicle: fund.vehicle,
      targetAmount: fund.targetAmount,
      currentAmount: fund.currentAmount,
      monthlyContribution: fund.monthlyContribution,
      targetDate: fund.targetDate ?? '',
      note: fund.note ?? '',
      status: fund.status
    });
    setEditingId(fund.id);
    setShowForm(true);
    clearMessage();
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    clearMessage();
    const nextErrors: Record<string, string> = {};
    if (!form.name.trim()) nextErrors.name = '목적자금명을 입력해주세요.';
    if (!form.targetAmount || form.targetAmount <= 0) nextErrors.targetAmount = '목표금액을 입력해주세요.';
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        horizon: form.horizon,
        vehicle: form.vehicle,
        targetAmount: Number(form.targetAmount),
        currentAmount: Number(form.currentAmount || 0),
        monthlyContribution: Number(form.monthlyContribution || 0),
        targetDate: form.targetDate || null,
        note: form.note.trim() || null,
        status: form.status
      };

      if (editingId) {
        const res = await api.updateGoalFund(editingId, payload);
        if (res.data) {
          setFunds((prev) => prev.map((f) => (f.id === editingId ? res.data! : f)));
          setSuccessMessage('수정 완료');
          resetForm();
        } else {
          setErrorMessage('수정 실패', res.error);
        }
      } else {
        const res = await api.createGoalFund(payload);
        if (res.data) {
          setFunds((prev) => [res.data!, ...prev]);
          setSuccessMessage('등록 완료');
          resetForm();
        } else {
          setErrorMessage('등록 실패', res.error);
        }
      }
    } catch {
      setErrorMessage('저장 중 오류', '알 수 없는 오류');
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm('이 목적자금을 삭제하시겠습니까?')) return;
    const res = await api.deleteGoalFund(id);
    if (res.data) {
      setFunds((prev) => prev.filter((f) => f.id !== id));
      setSuccessMessage('삭제 완료');
    } else {
      setErrorMessage('삭제 실패', res.error);
    }
  }

  async function onAddLog(fundId: string) {
    if (!logMonth || !logAmount || logAmount <= 0) return;
    const res = await api.updateGoalFund(fundId, {
      action: 'add-log',
      month: logMonth,
      amount: Number(logAmount),
      note: logNote.trim() || null
    });
    if (res.data) {
      setFunds((prev) => prev.map((f) => (f.id === fundId ? res.data! : f)));
      setLogAmount('');
      setLogNote('');
      setSuccessMessage('월별 기록 추가');
    }
  }

  async function onRemoveLog(fundId: string, month: string) {
    const res = await api.updateGoalFund(fundId, { action: 'remove-log', month });
    if (res.data) {
      setFunds((prev) => prev.map((f) => (f.id === fundId ? res.data! : f)));
    }
  }

  function getProgress(fund: GoalFund) {
    if (fund.targetAmount <= 0) return 0;
    return Math.min(100, Math.round((fund.currentAmount / fund.targetAmount) * 100));
  }

  function getProgressColor(pct: number): string {
    if (pct >= 100) return 'bg-green-500';
    if (pct >= 70) return 'bg-blue-500';
    if (pct >= 40) return 'bg-yellow-500';
    return 'bg-orange-500';
  }

  if (loading) return <LoadingSpinner />;

  return (
    <div className="py-4">
      <FeedbackBanner feedback={feedback} />

      {/* Summary KPIs */}
      <section className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]">
        <div className="kpi-card">
          <h3 className="kpi-label">진행중 목적자금</h3>
          <p className="kpi-value">{summaryStats.count}건</p>
        </div>
        <div className="kpi-card">
          <h3 className="kpi-label">목표 합계</h3>
          <p className="kpi-value">{formatCompact(summaryStats.totalTarget)}</p>
        </div>
        <div className="kpi-card">
          <h3 className="kpi-label">현재 합계</h3>
          <p className="kpi-value">{formatCompact(summaryStats.totalCurrent)}</p>
        </div>
        <div className="kpi-card">
          <h3 className="kpi-label">월 적립 합계</h3>
          <p className="kpi-value">{formatCompact(summaryStats.totalMonthly)}</p>
        </div>
      </section>

      {/* Add / Filter controls */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn-primary"
          onClick={() => { resetForm(); setShowForm(true); }}
        >
          + 목적자금 추가
        </button>
        <div className="flex gap-1 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-0.5">
          {(['all', 'short', 'mid', 'long'] as const).map((h) => (
            <button
              key={h}
              type="button"
              className={filterHorizon === h ? 'btn-primary px-3 py-1 text-xs' : 'btn-subtle px-3 py-1 text-xs'}
              onClick={() => setFilterHorizon(h)}
            >
              {h === 'all' ? '전체' : horizonLabel[h].split(' ')[0]}
            </button>
          ))}
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <SectionCard className="mt-4">
          <h3 className="mt-0">{editingId ? '목적자금 수정' : '목적자금 등록'}</h3>
          <form onSubmit={onSubmit} className="mt-3 grid gap-3 sm:grid-cols-2">
            <FormField label="목적자금명" error={errors.name}>
              <input
                className="form-input"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="예: 여행자금, 전세대출 상환, 자동차 구입"
              />
            </FormField>
            <FormField label="기간구분">
              <select
                className="form-input"
                value={form.horizon}
                onChange={(e) => setForm((p) => ({ ...p, horizon: e.target.value as HorizonType }))}
              >
                {(Object.keys(horizonLabel) as HorizonType[]).map((k) => (
                  <option key={k} value={k}>{horizonLabel[k]}</option>
                ))}
              </select>
            </FormField>
            <FormField label="투자수단">
              <select
                className="form-input"
                value={form.vehicle}
                onChange={(e) => setForm((p) => ({ ...p, vehicle: e.target.value as VehicleType }))}
              >
                {(Object.keys(vehicleLabel) as VehicleType[]).map((k) => (
                  <option key={k} value={k}>{vehicleLabel[k]}</option>
                ))}
              </select>
            </FormField>
            <FormField label="목표금액" error={errors.targetAmount}>
              <input
                type="number"
                className="form-input"
                value={form.targetAmount}
                onChange={(e) => setForm((p) => ({ ...p, targetAmount: e.target.value ? Number(e.target.value) : '' }))}
                placeholder="10,000,000"
              />
            </FormField>
            <FormField label="현재금액">
              <input
                type="number"
                className="form-input"
                value={form.currentAmount}
                onChange={(e) => setForm((p) => ({ ...p, currentAmount: e.target.value ? Number(e.target.value) : '' }))}
              />
            </FormField>
            <FormField label="월 적립액">
              <input
                type="number"
                className="form-input"
                value={form.monthlyContribution}
                onChange={(e) => setForm((p) => ({ ...p, monthlyContribution: e.target.value ? Number(e.target.value) : '' }))}
              />
            </FormField>
            <FormField label="목표일">
              <input
                type="date"
                className="form-input"
                value={form.targetDate}
                onChange={(e) => setForm((p) => ({ ...p, targetDate: e.target.value }))}
              />
            </FormField>
            <FormField label="상태">
              <select
                className="form-input"
                value={form.status}
                onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as StatusType }))}
              >
                {(Object.keys(statusLabel) as StatusType[]).map((k) => (
                  <option key={k} value={k}>{statusLabel[k]}</option>
                ))}
              </select>
            </FormField>
            <div className="sm:col-span-2">
              <FormField label="메모">
                <textarea
                  className="form-input"
                  rows={2}
                  value={form.note}
                  onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
                  placeholder="참고사항"
                />
              </FormField>
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? '저장 중...' : editingId ? '수정' : '등록'}
              </button>
              <button type="button" className="btn-subtle" onClick={resetForm}>취소</button>
            </div>
          </form>
        </SectionCard>
      )}

      {/* Fund cards grouped by horizon */}
      {(['short', 'mid', 'long'] as const).map((horizon) => {
        const items = grouped[horizon];
        if (items.length === 0) return null;
        return (
          <SectionCard key={horizon} className="mt-4">
            <h3 className="mt-0 flex items-center gap-2">
              <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${horizonColor[horizon]}`}>
                {horizonLabel[horizon].split(' ')[0]}
              </span>
              {horizonLabel[horizon]}
              <span className="text-sm font-normal text-[var(--muted)]">({items.length}건)</span>
            </h3>

            <div className="mt-3 grid gap-3">
              {items.map((fund) => {
                const pct = getProgress(fund);
                const isExpanded = expandedId === fund.id;
                return (
                  <div
                    key={fund.id}
                    className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 transition-shadow hover:shadow-md"
                  >
                    {/* Header row */}
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="m-0 text-base font-semibold">{fund.name}</h4>
                          <span className={`rounded-full px-2 py-0.5 text-[0.7rem] font-medium ${statusColor[fund.status]}`}>
                            {statusLabel[fund.status]}
                          </span>
                          <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[0.7rem] font-medium text-[var(--muted)]">
                            {vehicleLabel[fund.vehicle]}
                          </span>
                        </div>
                        {fund.targetDate && (
                          <p className="helper-text mt-1">목표일: {fund.targetDate}</p>
                        )}
                        {fund.note && (
                          <p className="helper-text mt-0.5">{fund.note}</p>
                        )}
                      </div>
                      <div className="flex gap-1.5">
                        <button type="button" className="btn-subtle px-2 py-1 text-xs" onClick={() => setExpandedId(isExpanded ? null : fund.id)}>
                          {isExpanded ? '접기' : '월별기록'}
                        </button>
                        <button type="button" className="btn-subtle px-2 py-1 text-xs" onClick={() => startEdit(fund)}>수정</button>
                        <button type="button" className="btn-subtle px-2 py-1 text-xs text-red-500" onClick={() => onDelete(fund.id)}>삭제</button>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="mt-3">
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="font-semibold">{formatCompact(fund.currentAmount)}</span>
                        <span className="text-[var(--muted)]">/ {formatCompact(fund.targetAmount)}</span>
                      </div>
                      <div className="mt-1.5 h-3 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${getProgressColor(pct)}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="mt-1 flex justify-between text-xs text-[var(--muted)]">
                        <span>{pct}% 달성</span>
                        {fund.monthlyContribution > 0 && (
                          <span>월 {formatCompact(fund.monthlyContribution)} 적립</span>
                        )}
                      </div>
                    </div>

                    {/* Monthly logs (expanded) */}
                    {isExpanded && (
                      <div className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-3">
                        <h5 className="m-0 mb-2 text-sm font-semibold">월별 적립 기록</h5>

                        {/* Add log form */}
                        <div className="flex flex-wrap items-end gap-2">
                          <div>
                            <label className="mb-0.5 block text-xs text-[var(--muted)]">월</label>
                            <input
                              type="month"
                              className="form-input !py-1 text-sm"
                              value={logMonth}
                              onChange={(e) => setLogMonth(e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="mb-0.5 block text-xs text-[var(--muted)]">금액</label>
                            <input
                              type="number"
                              className="form-input !py-1 text-sm w-28"
                              value={logAmount}
                              onChange={(e) => setLogAmount(e.target.value ? Number(e.target.value) : '')}
                              placeholder="500,000"
                            />
                          </div>
                          <div>
                            <label className="mb-0.5 block text-xs text-[var(--muted)]">메모</label>
                            <input
                              className="form-input !py-1 text-sm w-32"
                              value={logNote}
                              onChange={(e) => setLogNote(e.target.value)}
                              placeholder="선택"
                            />
                          </div>
                          <button
                            type="button"
                            className="btn-primary px-3 py-1 text-sm"
                            onClick={() => onAddLog(fund.id)}
                          >
                            기록
                          </button>
                        </div>

                        {/* Logs table */}
                        {fund.monthlyLogs.length > 0 ? (
                          <table className="ui-table mt-3">
                            <thead>
                              <tr className="ui-table-head-row">
                                <th className="ui-table-th text-left">월</th>
                                <th className="ui-table-th text-right">금액</th>
                                <th className="ui-table-th text-left">메모</th>
                                <th className="ui-table-th text-center">삭제</th>
                              </tr>
                            </thead>
                            <tbody>
                              {fund.monthlyLogs.map((log: GoalFundLog, idx: number) => (
                                <tr key={log.month} className={idx % 2 === 0 ? 'ui-table-row-even' : 'ui-table-row-odd'}>
                                  <td className="ui-table-td text-left">{log.month}</td>
                                  <td className="ui-table-td text-right">{log.amount.toLocaleString()}원</td>
                                  <td className="ui-table-td text-left text-[var(--muted)]">{log.note ?? '-'}</td>
                                  <td className="ui-table-td text-center">
                                    <button
                                      type="button"
                                      className="text-xs text-red-500 hover:underline"
                                      onClick={() => onRemoveLog(fund.id, log.month)}
                                    >
                                      ✕
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <p className="helper-text mt-2">아직 월별 기록이 없습니다.</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </SectionCard>
        );
      })}

      {funds.length === 0 && !showForm && (
        <SectionCard className="mt-4">
          <p className="text-center text-[var(--muted)]">
            등록된 목적자금이 없습니다. 위 버튼으로 추가해보세요.
          </p>
        </SectionCard>
      )}
    </div>
  );
}
