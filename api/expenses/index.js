"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.expensesHandler = expensesHandler;
const crypto_1 = require("crypto");
const auth_1 = require("../shared/auth");
const cosmosClient_1 = require("../shared/cosmosClient");
const responses_1 = require("../shared/responses");
const validators_1 = require("../shared/validators");
const request_body_1 = require("../shared/request-body");
const expenseTypes = ["고정", "구독", "일회성", "fixed", "subscription", "one_time"];
const billingCycles = ["매월", "매년", "일회성", "monthly", "yearly", "one_time"];
function normalizeExpenseType(value) {
    switch (value) {
        case "고정":
        case "fixed":
            return "고정";
        case "구독":
        case "subscription":
            return "구독";
        case "일회성":
        case "one_time":
            return "일회성";
        default:
            return "고정";
    }
}
function normalizeBillingCycle(value) {
    switch (value) {
        case "매월":
        case "monthly":
            return "매월";
        case "매년":
        case "yearly":
            return "매년";
        case "일회성":
        case "one_time":
            return "일회성";
        default:
            return "매월";
    }
}
function toLegacyExpenseType(value) {
    switch (value) {
        case "고정":
            return "fixed";
        case "구독":
            return "subscription";
        case "일회성":
            return "one_time";
    }
}
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
                    return (0, responses_1.ok)(resource);
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
                const normalizedExpenseType = type ? normalizeExpenseType(type) : null;
                const legacyExpenseType = normalizedExpenseType ? toLegacyExpenseType(normalizedExpenseType) : null;
                const query = type
                    ? {
                        query: "SELECT * FROM c WHERE c.userId = @userId AND c.type = 'Expense' AND (c.expenseType = @expenseType OR c.expenseType = @legacyExpenseType)",
                        parameters: [
                            { name: "@userId", value: userId },
                            { name: "@expenseType", value: normalizedExpenseType },
                            { name: "@legacyExpenseType", value: legacyExpenseType }
                        ]
                    }
                    : {
                        query: "SELECT * FROM c WHERE c.userId = @userId AND c.type = 'Expense'",
                        parameters: [{ name: "@userId", value: userId }]
                    };
                const { resources } = await container.items.query(query).fetchAll();
                return (0, responses_1.ok)(resources);
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
            if (expenseId === "settle-month") {
                try {
                    const targetMonth = resolveTargetMonth(body.targetMonth);
                    const recurringQuery = {
                        query: "SELECT * FROM c WHERE c.userId = @userId AND c.type = 'Expense' AND (c.cycle = '매월' OR c.cycle = 'monthly') AND (c.expenseType = '고정' OR c.expenseType = '구독' OR c.expenseType = 'fixed' OR c.expenseType = 'subscription') AND (NOT IS_DEFINED(c.isCardIncluded) OR c.isCardIncluded = false)",
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
                        if (isInvestmentTransfer && !investmentTargetCategory) {
                            skippedCount += 1;
                            continue;
                        }
                        const duplicateQuery = {
                            query: "SELECT TOP 1 c.id FROM c WHERE c.userId = @userId AND c.type = 'Expense' AND c.entrySource = 'auto_settlement' AND c.sourceExpenseId = @sourceExpenseId AND c.settledMonth = @settledMonth",
                            parameters: [
                                { name: "@userId", value: userId },
                                { name: "@sourceExpenseId", value: template.id },
                                { name: "@settledMonth", value: targetMonth }
                            ]
                        };
                        const duplicate = await container.items.query(duplicateQuery).fetchAll();
                        if ((duplicate.resources ?? []).length > 0) {
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
                            expenseType: "일회성",
                            name: (0, validators_1.ensureString)(template.name ?? "정기지출", "name"),
                            amount,
                            cycle: "일회성",
                            billingDay,
                            occurredAt,
                            reflectToLiquidAsset: true,
                            isInvestmentTransfer,
                            investmentTargetCategory,
                            investmentTargetAssetId: "",
                            transferredAmount: 0,
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
                const cycle = normalizeBillingCycle((0, validators_1.ensureEnum)(body.cycle, "cycle", billingCycles));
                const expenseType = normalizeExpenseType((0, validators_1.ensureEnum)(body.type, "type", expenseTypes));
                const billingDay = (0, validators_1.ensureOptionalNumberInRange)(body.billingDay, "billingDay", 1, 31) ?? null;
                const isInvestmentTransfer = (0, validators_1.ensureOptionalBoolean)(body.isInvestmentTransfer, "isInvestmentTransfer") ?? false;
                const investmentTargetCategory = (0, validators_1.ensureOptionalString)(body.investmentTargetCategory, "investmentTargetCategory") ?? "";
                if ((expenseType === "구독" || expenseType === "고정") && billingDay === null) {
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
                    isCardIncluded: (0, validators_1.ensureOptionalBoolean)(body.isCardIncluded, "isCardIncluded") ?? false,
                    reflectedAmount: 0,
                    reflectedAssetId: "",
                    reflectedAt: "",
                    entrySource: "manual",
                    sourceExpenseId: "",
                    settledMonth: "",
                    category: (0, validators_1.ensureOptionalString)(body.category, "category") ?? "",
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                const { resource } = await container.items.create(expense);
                if (!resource) {
                    return (0, responses_1.fail)("SERVER_ERROR", "Failed to create expense", 500);
                }
                if (!shouldReflectNow(reflectToLiquidAsset, occurredAt)) {
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
                const nextExpenseType = normalizeExpenseType(String((0, validators_1.ensureOptionalEnum)(body.type, "type", expenseTypes) ??
                    existing.expenseType ??
                    "고정"));
                const nextCycle = normalizeBillingCycle(String((0, validators_1.ensureOptionalEnum)(body.cycle, "cycle", billingCycles) ??
                    existing.cycle ??
                    "매월"));
                const existingBillingDay = Number(existing.billingDay ?? 0);
                const nextBillingDay = (0, validators_1.ensureOptionalNumberInRange)(body.billingDay, "billingDay", 1, 31) ??
                    (existingBillingDay >= 1 && existingBillingDay <= 31 ? existingBillingDay : null);
                if ((nextExpenseType === "구독" || nextExpenseType === "고정") && nextBillingDay === null) {
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
                    cycle: nextCycle,
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
