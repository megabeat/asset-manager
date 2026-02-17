"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.expensesHandler = expensesHandler;
const crypto_1 = require("crypto");
const auth_1 = require("../shared/auth");
const cosmosClient_1 = require("../shared/cosmosClient");
const responses_1 = require("../shared/responses");
const validators_1 = require("../shared/validators");
const request_body_1 = require("../shared/request-body");
const labels_1 = require("../shared/labels");
const expenseTypes = ["fixed", "subscription", "one_time"];
const billingCycles = ["monthly", "yearly", "one_time"];
const INVESTMENT_TARGET_DEFAULT_NAME = {
    stock_kr: "국내주식",
    stock_us: "미국주식",
    deposit: "예금",
    cash: "현금",
    pension: "연금",
    pension_personal: "개인연금",
    pension_retirement: "퇴직연금",
    etc: "기타 투자"
};
function resolveOccurredAt(value) {
    const candidate = (0, validators_1.ensureOptionalString)(value, "occurredAt") ?? new Date().toISOString().slice(0, 10);
    const date = new Date(candidate);
    if (Number.isNaN(date.getTime())) {
        throw new Error("Invalid occurredAt");
    }
    return date.toISOString().slice(0, 10);
}
async function syncGoalFundLog(userId, goalFundId, occurredAt, amount, action) {
    const goalFundsContainer = (0, cosmosClient_1.getContainer)("goalFunds");
    try {
        const { resource: fund } = await goalFundsContainer.item(goalFundId, userId).read();
        if (!fund || fund.userId !== userId)
            return;
        const month = occurredAt.slice(0, 7); // yyyy-MM
        let logs = fund.monthlyLogs || [];
        if (action === "add") {
            const existingIdx = logs.findIndex((l) => l.month === month);
            if (existingIdx >= 0) {
                logs[existingIdx] = { month, amount: logs[existingIdx].amount + amount, note: "지출연동" };
            }
            else {
                logs.push({ month, amount, note: "지출연동" });
                logs.sort((a, b) => a.month.localeCompare(b.month));
            }
        }
        else {
            const existingIdx = logs.findIndex((l) => l.month === month);
            if (existingIdx >= 0) {
                const newAmount = logs[existingIdx].amount - amount;
                if (newAmount <= 0) {
                    logs = logs.filter((_, i) => i !== existingIdx);
                }
                else {
                    logs[existingIdx] = { ...logs[existingIdx], amount: newAmount };
                }
            }
        }
        const totalFromLogs = logs.reduce((s, l) => s + l.amount, 0);
        const updated = {
            ...fund,
            monthlyLogs: logs,
            currentAmount: totalFromLogs,
            updatedAt: new Date().toISOString()
        };
        await goalFundsContainer.item(goalFundId, userId).replace(updated);
    }
    catch {
        // Goal fund sync failure should not block expense creation
    }
}
function shouldReflectNow(reflectToLiquidAsset, occurredAt) {
    if (!reflectToLiquidAsset) {
        return false;
    }
    const today = new Date().toISOString().slice(0, 10);
    return occurredAt <= today;
}
async function resolveLiquidAsset(assetsContainer, userId, preferredAssetId) {
    if (preferredAssetId) {
        const { resource } = await assetsContainer.item(preferredAssetId, userId).read();
        if (resource) {
            return resource;
        }
    }
    const query = {
        query: "SELECT TOP 1 * FROM c WHERE c.userId = @userId AND c.type = 'Asset' AND (c.category = 'deposit' OR c.category = 'cash') ORDER BY c.updatedAt DESC",
        parameters: [{ name: "@userId", value: userId }]
    };
    const { resources } = await assetsContainer.items.query(query).fetchAll();
    if (resources.length > 0) {
        return resources[0];
    }
    const nowIso = new Date().toISOString();
    const newLiquidAsset = {
        id: (0, crypto_1.randomUUID)(),
        userId,
        type: "Asset",
        category: "deposit",
        name: "입출금 통장",
        currentValue: 0,
        valuationDate: nowIso.slice(0, 10),
        note: "지출 반영용 자동 생성",
        createdAt: nowIso,
        updatedAt: nowIso
    };
    const { resource } = await assetsContainer.items.create(newLiquidAsset);
    return resource;
}
async function applyLiquidAssetDelta(assetsContainer, userId, delta, preferredAssetId) {
    if (!Number.isFinite(delta) || delta === 0) {
        return null;
    }
    const liquidAsset = await resolveLiquidAsset(assetsContainer, userId, preferredAssetId);
    const nextValue = Math.max(0, Number(liquidAsset.currentValue ?? 0) + delta);
    const nowIso = new Date().toISOString();
    const updated = {
        ...liquidAsset,
        currentValue: nextValue,
        valuationDate: nowIso.slice(0, 10),
        updatedAt: nowIso
    };
    await assetsContainer.item(liquidAsset.id, userId).replace(updated);
    return { assetId: liquidAsset.id, appliedDelta: delta };
}
async function resolveInvestmentTargetAsset(assetsContainer, userId, targetCategory, preferredAssetId) {
    if (preferredAssetId) {
        const { resource } = await assetsContainer.item(preferredAssetId, userId).read();
        if (resource) {
            return resource;
        }
    }
    const query = {
        query: "SELECT TOP 1 * FROM c WHERE c.userId = @userId AND c.type = 'Asset' AND c.category = @category ORDER BY c.updatedAt DESC",
        parameters: [
            { name: "@userId", value: userId },
            { name: "@category", value: targetCategory }
        ]
    };
    const { resources } = await assetsContainer.items.query(query).fetchAll();
    if (resources.length > 0) {
        return resources[0];
    }
    const nowIso = new Date().toISOString();
    const newAsset = {
        id: (0, crypto_1.randomUUID)(),
        userId,
        type: "Asset",
        category: targetCategory,
        name: INVESTMENT_TARGET_DEFAULT_NAME[targetCategory] ?? "투자자산",
        currentValue: 0,
        acquiredValue: null,
        quantity: null,
        valuationDate: nowIso.slice(0, 10),
        symbol: "",
        exchangeRate: null,
        usdAmount: null,
        pensionMonthlyContribution: null,
        pensionReceiveStart: "",
        pensionReceiveAge: null,
        carYear: null,
        exchange: "",
        priceSource: "",
        autoUpdate: false,
        note: "투자이체 반영용 자동 생성",
        createdAt: nowIso,
        updatedAt: nowIso
    };
    const { resource } = await assetsContainer.items.create(newAsset);
    return resource;
}
async function applyInvestmentAssetDelta(assetsContainer, userId, delta, targetCategory, preferredAssetId) {
    if (!Number.isFinite(delta) || delta === 0) {
        return null;
    }
    const targetAsset = await resolveInvestmentTargetAsset(assetsContainer, userId, targetCategory, preferredAssetId);
    const nextValue = Math.max(0, Number(targetAsset.currentValue ?? 0) + delta);
    const nowIso = new Date().toISOString();
    const updated = {
        ...targetAsset,
        currentValue: nextValue,
        valuationDate: nowIso.slice(0, 10),
        updatedAt: nowIso
    };
    await assetsContainer.item(targetAsset.id, userId).replace(updated);
    return { assetId: targetAsset.id, appliedDelta: delta };
}
function getQueryValue(req, key) {
    const query = req.query;
    if (query && typeof query.get === "function") {
        return query.get(key) ?? undefined;
    }
    if (query && typeof query === "object") {
        const record = query;
        return record[key] ?? record[key.toLowerCase()] ?? record[key.toUpperCase()];
    }
    return undefined;
}
function resolveTargetMonth(raw) {
    const month = (0, validators_1.ensureString)(raw, "targetMonth").trim();
    if (!/^\d{4}-\d{2}$/.test(month)) {
        throw new Error("Invalid targetMonth");
    }
    const [yearText, monthText] = month.split("-");
    const year = Number(yearText);
    const monthNumber = Number(monthText);
    if (!Number.isFinite(year) || !Number.isFinite(monthNumber) || monthNumber < 1 || monthNumber > 12) {
        throw new Error("Invalid targetMonth");
    }
    return `${yearText}-${monthText}`;
}
function resolveDateByMonthAndBillingDay(targetMonth, billingDay) {
    const [yearText, monthText] = targetMonth.split("-");
    const year = Number(yearText);
    const month = Number(monthText);
    const safeDay = Math.min(31, Math.max(1, Math.trunc(billingDay)));
    const lastDay = new Date(year, month, 0).getDate();
    const day = Math.min(safeDay, lastDay);
    return new Date(year, month - 1, day).toISOString().slice(0, 10);
}
async function expensesHandler(context, req) {
    const { userId } = (0, auth_1.getAuthContext)(req.headers);
    try {
        (0, validators_1.requireUserId)(userId);
    }
    catch {
        return (0, responses_1.fail)("UNAUTHORIZED", "Authentication required", 401);
    }
    let container;
    let assetsContainer;
    try {
        container = (0, cosmosClient_1.getContainer)("expenses");
        assetsContainer = (0, cosmosClient_1.getContainer)("assets");
    }
    catch (error) {
        context.log(error);
        return (0, responses_1.fail)("SERVER_ERROR", "Cosmos DB configuration error", 500);
    }
    const expenseId = req.params.expenseId;
    switch (req.method.toUpperCase()) {
        case "GET": {
            if (expenseId) {
                try {
                    const { resource } = await container.item(expenseId, userId).read();
                    if (!resource) {
                        return (0, responses_1.fail)("NOT_FOUND", "Expense not found", 404);
                    }
                    return (0, responses_1.ok)((0, labels_1.attachExpenseLabels)(resource));
                }
                catch (error) {
                    const status = error.statusCode;
                    if (status === 404) {
                        return (0, responses_1.fail)("NOT_FOUND", "Expense not found", 404);
                    }
                    context.log(error);
                    return (0, responses_1.fail)("SERVER_ERROR", "Failed to fetch expense", 500);
                }
            }
            try {
                const type = getQueryValue(req, "type");
                const query = type
                    ? {
                        query: "SELECT * FROM c WHERE c.userId = @userId AND c.type = 'Expense' AND c.expenseType = @expenseType",
                        parameters: [
                            { name: "@userId", value: userId },
                            { name: "@expenseType", value: type }
                        ]
                    }
                    : {
                        query: "SELECT * FROM c WHERE c.userId = @userId AND c.type = 'Expense'",
                        parameters: [{ name: "@userId", value: userId }]
                    };
                const { resources } = await container.items.query(query).fetchAll();
                return (0, responses_1.ok)(resources.map(labels_1.attachExpenseLabels));
            }
            catch (error) {
                context.log(error);
                return (0, responses_1.fail)("SERVER_ERROR", "Failed to list expenses", 500);
            }
        }
        case "POST": {
            let body;
            try {
                body = await (0, request_body_1.parseJsonBody)(req);
            }
            catch {
                return (0, responses_1.fail)("INVALID_JSON", "Invalid JSON body", 400);
            }
            if (expenseId === "rollback-month") {
                try {
                    const targetMonth = resolveTargetMonth(body.targetMonth);
                    const autoQuery = {
                        query: "SELECT * FROM c WHERE c.userId = @userId AND c.type = 'Expense' AND c.entrySource = 'auto_settlement' AND c.settledMonth = @settledMonth",
                        parameters: [
                            { name: "@userId", value: userId },
                            { name: "@settledMonth", value: targetMonth }
                        ]
                    };
                    const { resources } = await container.items.query(autoQuery).fetchAll();
                    const autoExpenses = resources;
                    if (autoExpenses.length === 0) {
                        return (0, responses_1.fail)("NOT_FOUND", `${targetMonth} 정산 내역이 없습니다.`, 404);
                    }
                    let deletedCount = 0;
                    let reversedAmount = 0;
                    for (const expense of autoExpenses) {
                        const reflectedAmount = Number(expense.reflectedAmount ?? 0);
                        if (reflectedAmount > 0) {
                            await applyLiquidAssetDelta(assetsContainer, userId, reflectedAmount, expense.reflectedAssetId || undefined);
                        }
                        const transferredAmount = Number(expense.transferredAmount ?? 0);
                        const targetCategory = String(expense.investmentTargetCategory ?? "");
                        if (transferredAmount > 0 && targetCategory) {
                            await applyInvestmentAssetDelta(assetsContainer, userId, -transferredAmount, targetCategory, expense.investmentTargetAssetId || undefined);
                        }
                        await container.item(String(expense.id), userId).delete();
                        deletedCount += 1;
                        reversedAmount += Number(expense.amount ?? 0);
                        // Reverse goal fund log on rollback
                        const rollbackGoalFundId = String(expense.goalFundId ?? "");
                        const rollbackOccurredAt = String(expense.occurredAt ?? "");
                        const rollbackAmount = Number(expense.amount ?? 0);
                        if (rollbackGoalFundId && expense.isInvestmentTransfer && rollbackAmount > 0 && rollbackOccurredAt) {
                            await syncGoalFundLog(userId, rollbackGoalFundId, rollbackOccurredAt, rollbackAmount, "remove");
                        }
                    }
                    return (0, responses_1.ok)({ targetMonth, deletedCount, reversedAmount });
                }
                catch (error) {
                    if (error instanceof Error && error.message.startsWith("Invalid")) {
                        return (0, responses_1.fail)("VALIDATION_ERROR", error.message, 400);
                    }
                    context.log(error);
                    return (0, responses_1.fail)("SERVER_ERROR", "Failed to rollback expense settlement", 500);
                }
            }
            if (expenseId === "check-settled") {
                try {
                    const targetMonth = resolveTargetMonth(body.targetMonth);
                    const checkQuery = {
                        query: "SELECT TOP 1 c.id FROM c WHERE c.userId = @userId AND c.type = 'Expense' AND c.entrySource = 'auto_settlement' AND c.settledMonth = @settledMonth",
                        parameters: [
                            { name: "@userId", value: userId },
                            { name: "@settledMonth", value: targetMonth }
                        ]
                    };
                    const { resources } = await container.items.query(checkQuery).fetchAll();
                    return (0, responses_1.ok)({ targetMonth, settled: resources.length > 0 });
                }
                catch (error) {
                    if (error instanceof Error && error.message.startsWith("Invalid")) {
                        return (0, responses_1.fail)("VALIDATION_ERROR", error.message, 400);
                    }
                    context.log(error);
                    return (0, responses_1.fail)("SERVER_ERROR", "Failed to check settlement status", 500);
                }
            }
            if (expenseId === "settle-month") {
                try {
                    const targetMonth = resolveTargetMonth(body.targetMonth);
                    const alreadySettledQuery = {
                        query: "SELECT TOP 1 c.id FROM c WHERE c.userId = @userId AND c.type = 'Expense' AND c.entrySource = 'auto_settlement' AND c.settledMonth = @settledMonth",
                        parameters: [
                            { name: "@userId", value: userId },
                            { name: "@settledMonth", value: targetMonth }
                        ]
                    };
                    const alreadySettled = await container.items.query(alreadySettledQuery).fetchAll();
                    if ((alreadySettled.resources ?? []).length > 0) {
                        return (0, responses_1.fail)("ALREADY_SETTLED", `${targetMonth}은(는) 이미 정산이 완료된 월입니다. 재정산하려면 먼저 정산 취소를 해주세요.`, 409);
                    }
                    const recurringQuery = {
                        query: "SELECT * FROM c WHERE c.userId = @userId AND c.type = 'Expense' AND c.cycle = 'monthly' AND (c.expenseType = 'fixed' OR c.expenseType = 'subscription') AND (NOT IS_DEFINED(c.isCardIncluded) OR c.isCardIncluded = false)",
                        parameters: [{ name: "@userId", value: userId }]
                    };
                    const { resources } = await container.items.query(recurringQuery).fetchAll();
                    const recurringTemplates = resources;
                    let createdCount = 0;
                    let skippedCount = 0;
                    let reflectedCount = 0;
                    let totalSettledAmount = 0;
                    for (const template of recurringTemplates) {
                        const billingDay = Number(template.billingDay ?? 0);
                        if (!Number.isFinite(billingDay) || billingDay < 1 || billingDay > 31) {
                            skippedCount += 1;
                            continue;
                        }
                        const isInvestmentTransfer = Boolean(template.isInvestmentTransfer ?? false);
                        const investmentTargetCategory = String(template.investmentTargetCategory ?? "");
                        const templateGoalFundId = String(template.goalFundId ?? "");
                        if (isInvestmentTransfer && !investmentTargetCategory) {
                            skippedCount += 1;
                            continue;
                        }
                        const occurredAt = resolveDateByMonthAndBillingDay(targetMonth, billingDay);
                        const amount = Number(template.amount ?? 0);
                        const nowIso = new Date().toISOString();
                        const autoExpense = {
                            id: (0, crypto_1.randomUUID)(),
                            userId,
                            type: "Expense",
                            expenseType: "one_time",
                            name: (0, validators_1.ensureString)(template.name ?? "정기지출", "name"),
                            amount,
                            cycle: "one_time",
                            billingDay,
                            occurredAt,
                            reflectToLiquidAsset: true,
                            isInvestmentTransfer,
                            investmentTargetCategory,
                            investmentTargetAssetId: "",
                            transferredAmount: 0,
                            goalFundId: templateGoalFundId,
                            reflectedAmount: 0,
                            reflectedAssetId: "",
                            reflectedAt: "",
                            category: (0, validators_1.ensureOptionalString)(template.category ?? "", "category") ?? "",
                            isCardIncluded: false,
                            entrySource: "auto_settlement",
                            sourceExpenseId: template.id,
                            settledMonth: targetMonth,
                            createdAt: nowIso,
                            updatedAt: nowIso
                        };
                        const { resource: created } = await container.items.create(autoExpense);
                        if (!created) {
                            skippedCount += 1;
                            continue;
                        }
                        createdCount += 1;
                        totalSettledAmount += amount;
                        if (shouldReflectNow(true, occurredAt)) {
                            const reflected = await applyLiquidAssetDelta(assetsContainer, userId, -amount);
                            let targetAssetId = "";
                            let transferredAmount = 0;
                            if (isInvestmentTransfer && investmentTargetCategory) {
                                const transferred = await applyInvestmentAssetDelta(assetsContainer, userId, amount, investmentTargetCategory);
                                targetAssetId = transferred?.assetId ?? "";
                                transferredAmount = transferred?.appliedDelta ?? 0;
                            }
                            if (reflected) {
                                reflectedCount += 1;
                                const updatedExpense = {
                                    ...created,
                                    reflectedAmount: amount,
                                    reflectedAssetId: reflected.assetId,
                                    investmentTargetAssetId: targetAssetId,
                                    transferredAmount,
                                    reflectedAt: new Date().toISOString(),
                                    updatedAt: new Date().toISOString()
                                };
                                await container.item(String(created.id), userId).replace(updatedExpense);
                            }
                            // Sync goal fund progress for settled expense
                            if (templateGoalFundId && isInvestmentTransfer && amount > 0) {
                                await syncGoalFundLog(userId, templateGoalFundId, occurredAt, amount, "add");
                            }
                        }
                    }
                    return (0, responses_1.ok)({
                        targetMonth,
                        createdCount,
                        skippedCount,
                        reflectedCount,
                        totalSettledAmount
                    }, 201);
                }
                catch (error) {
                    if (error instanceof Error && error.message.startsWith("Invalid")) {
                        return (0, responses_1.fail)("VALIDATION_ERROR", error.message, 400);
                    }
                    context.log(error);
                    return (0, responses_1.fail)("SERVER_ERROR", "Failed to settle recurring expenses", 500);
                }
            }
            try {
                const amount = (0, validators_1.ensureNumberInRange)(body.amount, "amount", 0, Number.MAX_SAFE_INTEGER);
                const reflectToLiquidAsset = (0, validators_1.ensureOptionalBoolean)(body.reflectToLiquidAsset, "reflectToLiquidAsset") ?? false;
                const occurredAt = resolveOccurredAt(body.occurredAt);
                const cycle = (0, validators_1.ensureEnum)(body.cycle, "cycle", billingCycles);
                const expenseType = (0, validators_1.ensureEnum)(body.type, "type", expenseTypes);
                const billingDay = (0, validators_1.ensureOptionalNumberInRange)(body.billingDay, "billingDay", 1, 31) ?? null;
                const isInvestmentTransfer = (0, validators_1.ensureOptionalBoolean)(body.isInvestmentTransfer, "isInvestmentTransfer") ?? false;
                const investmentTargetCategory = (0, validators_1.ensureOptionalString)(body.investmentTargetCategory, "investmentTargetCategory") ?? "";
                const goalFundId = (0, validators_1.ensureOptionalString)(body.goalFundId, "goalFundId") ?? "";
                if ((expenseType === "subscription" || expenseType === "fixed") && billingDay === null) {
                    return (0, responses_1.fail)("VALIDATION_ERROR", "billingDay is required for recurring expenses", 400);
                }
                if (isInvestmentTransfer && !investmentTargetCategory) {
                    return (0, responses_1.fail)("VALIDATION_ERROR", "investmentTargetCategory is required for investment transfer", 400);
                }
                const expense = {
                    id: (0, crypto_1.randomUUID)(),
                    userId,
                    type: "Expense",
                    expenseType,
                    name: (0, validators_1.ensureString)(body.name, "name"),
                    amount,
                    cycle,
                    billingDay,
                    occurredAt,
                    reflectToLiquidAsset,
                    isInvestmentTransfer,
                    investmentTargetCategory,
                    investmentTargetAssetId: "",
                    transferredAmount: 0,
                    goalFundId,
                    isCardIncluded: (0, validators_1.ensureOptionalBoolean)(body.isCardIncluded, "isCardIncluded") ?? false,
                    reflectedAmount: 0,
                    reflectedAssetId: "",
                    reflectedAt: "",
                    entrySource: "manual",
                    sourceExpenseId: "",
                    settledMonth: "",
                    category: (0, validators_1.ensureOptionalString)(body.category, "category") ?? "",
                    owner: (0, validators_1.ensureOptionalString)(body.owner, "owner") ?? "본인",
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                const { resource } = await container.items.create(expense);
                if (!resource) {
                    return (0, responses_1.fail)("SERVER_ERROR", "Failed to create expense", 500);
                }
                if (!shouldReflectNow(reflectToLiquidAsset, occurredAt)) {
                    // Still sync goal fund even if asset reflection is deferred
                    if (goalFundId && isInvestmentTransfer && amount > 0) {
                        await syncGoalFundLog(userId, goalFundId, occurredAt, amount, "add");
                    }
                    return (0, responses_1.ok)(resource, 201);
                }
                const reflected = await applyLiquidAssetDelta(assetsContainer, userId, -amount);
                let targetAssetId = "";
                let transferredAmount = 0;
                if (isInvestmentTransfer && investmentTargetCategory) {
                    const transferred = await applyInvestmentAssetDelta(assetsContainer, userId, amount, investmentTargetCategory);
                    targetAssetId = transferred?.assetId ?? "";
                    transferredAmount = transferred?.appliedDelta ?? 0;
                }
                const nowIso = new Date().toISOString();
                const updatedExpense = {
                    ...resource,
                    reflectedAmount: reflected ? amount : 0,
                    reflectedAssetId: reflected?.assetId ?? "",
                    investmentTargetAssetId: targetAssetId,
                    transferredAmount,
                    reflectedAt: reflected ? nowIso : "",
                    updatedAt: nowIso
                };
                const { resource: savedExpense } = await container.item(updatedExpense.id, userId).replace(updatedExpense);
                // Sync goal fund progress
                if (goalFundId && isInvestmentTransfer && amount > 0) {
                    await syncGoalFundLog(userId, goalFundId, occurredAt, amount, "add");
                }
                return (0, responses_1.ok)(savedExpense ?? updatedExpense, 201);
            }
            catch (error) {
                if (error instanceof Error && error.message.startsWith("Invalid")) {
                    return (0, responses_1.fail)("VALIDATION_ERROR", error.message, 400);
                }
                context.log(error);
                return (0, responses_1.fail)("SERVER_ERROR", "Failed to create expense", 500);
            }
        }
        case "PUT": {
            if (!expenseId) {
                return (0, responses_1.fail)("VALIDATION_ERROR", "Missing expenseId", 400);
            }
            let body;
            try {
                body = await (0, request_body_1.parseJsonBody)(req);
            }
            catch {
                return (0, responses_1.fail)("INVALID_JSON", "Invalid JSON body", 400);
            }
            try {
                const { resource } = await container.item(expenseId, userId).read();
                if (!resource) {
                    return (0, responses_1.fail)("NOT_FOUND", "Expense not found", 404);
                }
                const existing = resource;
                const nextAmount = (0, validators_1.ensureOptionalNumberInRange)(body.amount, "amount", 0, Number.MAX_SAFE_INTEGER) ??
                    Number(existing.amount ?? 0);
                const nextOccurredAt = resolveOccurredAt(body.occurredAt ?? existing.occurredAt);
                const nextReflectSetting = (0, validators_1.ensureOptionalBoolean)(body.reflectToLiquidAsset, "reflectToLiquidAsset") ??
                    (existing.reflectToLiquidAsset ?? false);
                const nextIsInvestmentTransfer = (0, validators_1.ensureOptionalBoolean)(body.isInvestmentTransfer, "isInvestmentTransfer") ??
                    Boolean(existing.isInvestmentTransfer ?? false);
                const nextInvestmentTargetCategory = (0, validators_1.ensureOptionalString)(body.investmentTargetCategory, "investmentTargetCategory") ??
                    String(existing.investmentTargetCategory ?? "");
                const nextExpenseType = (0, validators_1.ensureOptionalEnum)(body.type, "type", expenseTypes) ??
                    String(existing.expenseType ?? "fixed");
                const existingBillingDay = Number(existing.billingDay ?? 0);
                const nextBillingDay = (0, validators_1.ensureOptionalNumberInRange)(body.billingDay, "billingDay", 1, 31) ??
                    (existingBillingDay >= 1 && existingBillingDay <= 31 ? existingBillingDay : null);
                if ((nextExpenseType === "subscription" || nextExpenseType === "fixed") && nextBillingDay === null) {
                    return (0, responses_1.fail)("VALIDATION_ERROR", "billingDay is required for recurring expenses", 400);
                }
                if (nextIsInvestmentTransfer && !nextInvestmentTargetCategory) {
                    return (0, responses_1.fail)("VALIDATION_ERROR", "investmentTargetCategory is required for investment transfer", 400);
                }
                const prevReflectedAmount = Number(existing.reflectedAmount ?? 0);
                const nextReflectedAmount = shouldReflectNow(nextReflectSetting, nextOccurredAt) ? nextAmount : 0;
                const reflectDelta = nextReflectedAmount - prevReflectedAmount;
                let reflectedAssetId = (existing.reflectedAssetId ?? "");
                let reflectedAt = (existing.reflectedAt ?? "");
                if (reflectDelta !== 0) {
                    const reflected = await applyLiquidAssetDelta(assetsContainer, userId, -reflectDelta, reflectedAssetId || undefined);
                    reflectedAssetId = reflected?.assetId ?? reflectedAssetId;
                    reflectedAt = reflected ? new Date().toISOString() : reflectedAt;
                }
                if (nextReflectedAmount === 0) {
                    reflectedAt = "";
                }
                const prevTransferredAmount = Number(existing.transferredAmount ?? 0);
                const prevTargetCategory = String(existing.investmentTargetCategory ?? "");
                const prevTargetAssetId = String(existing.investmentTargetAssetId ?? "");
                const nextTransferredAmount = nextIsInvestmentTransfer && shouldReflectNow(nextReflectSetting, nextOccurredAt)
                    ? nextAmount
                    : 0;
                let nextTargetAssetId = prevTargetAssetId;
                if (prevTransferredAmount > 0 && prevTargetCategory) {
                    await applyInvestmentAssetDelta(assetsContainer, userId, -prevTransferredAmount, prevTargetCategory, prevTargetAssetId || undefined);
                    nextTargetAssetId = "";
                }
                if (nextTransferredAmount > 0 && nextInvestmentTargetCategory) {
                    const transferred = await applyInvestmentAssetDelta(assetsContainer, userId, nextTransferredAmount, nextInvestmentTargetCategory, prevTargetCategory === nextInvestmentTargetCategory && prevTargetAssetId
                        ? prevTargetAssetId
                        : undefined);
                    nextTargetAssetId = transferred?.assetId ?? nextTargetAssetId;
                }
                const updated = {
                    ...existing,
                    expenseType: nextExpenseType,
                    name: (0, validators_1.ensureOptionalString)(body.name, "name") ?? existing.name,
                    amount: nextAmount,
                    cycle: (0, validators_1.ensureOptionalEnum)(body.cycle, "cycle", billingCycles) ?? existing.cycle,
                    billingDay: nextBillingDay,
                    occurredAt: nextOccurredAt,
                    reflectToLiquidAsset: nextReflectSetting,
                    isInvestmentTransfer: nextIsInvestmentTransfer,
                    investmentTargetCategory: nextInvestmentTargetCategory,
                    investmentTargetAssetId: nextTargetAssetId,
                    transferredAmount: nextTransferredAmount,
                    isCardIncluded: (0, validators_1.ensureOptionalBoolean)(body.isCardIncluded, "isCardIncluded") ??
                        Boolean(existing.isCardIncluded ?? false),
                    reflectedAmount: nextReflectedAmount,
                    reflectedAssetId,
                    reflectedAt,
                    category: (0, validators_1.ensureOptionalString)(body.category, "category") ?? existing.category,
                    goalFundId: (0, validators_1.ensureOptionalString)(body.goalFundId, "goalFundId") ?? String(existing.goalFundId ?? ""),
                    owner: (0, validators_1.ensureOptionalString)(body.owner, "owner") ?? existing.owner ?? "본인",
                    updatedAt: new Date().toISOString()
                };
                const { resource: saved } = await container.item(expenseId, userId).replace(updated);
                return (0, responses_1.ok)(saved);
            }
            catch (error) {
                const status = error.statusCode;
                if (status === 404) {
                    return (0, responses_1.fail)("NOT_FOUND", "Expense not found", 404);
                }
                if (error instanceof Error && error.message.startsWith("Invalid")) {
                    return (0, responses_1.fail)("VALIDATION_ERROR", error.message, 400);
                }
                context.log(error);
                return (0, responses_1.fail)("SERVER_ERROR", "Failed to update expense", 500);
            }
        }
        case "DELETE": {
            if (!expenseId) {
                return (0, responses_1.fail)("VALIDATION_ERROR", "Missing expenseId", 400);
            }
            try {
                const { resource } = await container.item(expenseId, userId).read();
                if (!resource) {
                    return (0, responses_1.fail)("NOT_FOUND", "Expense not found", 404);
                }
                const expense = resource;
                const reflectedAmount = Number(expense.reflectedAmount ?? 0);
                if (reflectedAmount > 0) {
                    await applyLiquidAssetDelta(assetsContainer, userId, reflectedAmount, expense.reflectedAssetId || undefined);
                }
                const transferredAmount = Number(expense.transferredAmount ?? 0);
                const targetCategory = String(expense.investmentTargetCategory ?? "");
                if (transferredAmount > 0 && targetCategory) {
                    await applyInvestmentAssetDelta(assetsContainer, userId, -transferredAmount, targetCategory, expense.investmentTargetAssetId || undefined);
                }
                await container.item(expenseId, userId).delete();
                // Reverse goal fund log on delete
                const expenseGoalFundId = String(expense.goalFundId ?? "");
                const expenseOccurredAt = String(expense.occurredAt ?? "");
                const expenseAmount = Number(expense.amount ?? 0);
                if (expenseGoalFundId && expense.isInvestmentTransfer && expenseAmount > 0 && expenseOccurredAt) {
                    await syncGoalFundLog(userId, expenseGoalFundId, expenseOccurredAt, expenseAmount, "remove");
                }
                return (0, responses_1.ok)({ id: expenseId });
            }
            catch (error) {
                const status = error.statusCode;
                if (status === 404) {
                    return (0, responses_1.fail)("NOT_FOUND", "Expense not found", 404);
                }
                context.log(error);
                return (0, responses_1.fail)("SERVER_ERROR", "Failed to delete expense", 500);
            }
        }
        default:
            context.log(`Unsupported method: ${req.method}`);
            return (0, responses_1.fail)("METHOD_NOT_ALLOWED", "Method not allowed", 405);
    }
}
