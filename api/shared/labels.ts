const EXPENSE_TYPE_LABELS: Record<string, string> = {
  fixed: "고정",
  subscription: "구독",
  one_time: "일회성"
};

const CYCLE_LABELS: Record<string, string> = {
  monthly: "매월",
  yearly: "매년",
  one_time: "일회성"
};

export function expenseTypeLabel(value: string | undefined): string {
  return EXPENSE_TYPE_LABELS[value ?? ""] ?? "고정";
}

export function cycleLabel(value: string | undefined): string {
  return CYCLE_LABELS[value ?? ""] ?? "매월";
}

export function attachExpenseLabels<T extends Record<string, unknown>>(expense: T): T & { expenseTypeLabel: string; cycleLabel: string } {
  return {
    ...expense,
    expenseTypeLabel: expenseTypeLabel(String(expense.expenseType ?? "")),
    cycleLabel: cycleLabel(String(expense.cycle ?? ""))
  };
}

export function attachIncomeLabels<T extends Record<string, unknown>>(income: T): T & { cycleLabel: string } {
  return {
    ...income,
    cycleLabel: cycleLabel(String(income.cycle ?? ""))
  };
}
