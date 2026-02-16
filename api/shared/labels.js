"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.expenseTypeLabel = expenseTypeLabel;
exports.cycleLabel = cycleLabel;
exports.attachExpenseLabels = attachExpenseLabels;
exports.attachIncomeLabels = attachIncomeLabels;
const EXPENSE_TYPE_LABELS = {
    fixed: "고정",
    subscription: "구독",
    one_time: "일회성"
};
const CYCLE_LABELS = {
    monthly: "매월",
    yearly: "매년",
    one_time: "일회성"
};
function expenseTypeLabel(value) {
    return EXPENSE_TYPE_LABELS[value ?? ""] ?? "고정";
}
function cycleLabel(value) {
    return CYCLE_LABELS[value ?? ""] ?? "매월";
}
function attachExpenseLabels(expense) {
    return {
        ...expense,
        expenseTypeLabel: expenseTypeLabel(String(expense.expenseType ?? "")),
        cycleLabel: cycleLabel(String(expense.cycle ?? ""))
    };
}
function attachIncomeLabels(income) {
    return {
        ...income,
        cycleLabel: cycleLabel(String(income.cycle ?? ""))
    };
}
