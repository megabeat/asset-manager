"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.incomesHandler = incomesHandler;
const crypto_1 = require("crypto");
const auth_1 = require("../shared/auth");
const cosmosClient_1 = require("../shared/cosmosClient");
const responses_1 = require("../shared/responses");
const validators_1 = require("../shared/validators");
const request_body_1 = require("../shared/request-body");
const labels_1 = require("../shared/labels");
const incomeCycles = ["monthly", "yearly", "one_time"];
const REFLECTABLE_CYCLES = new Set(["yearly", "one_time"]);
function isReflectableCycle(cycle) {
    return REFLECTABLE_CYCLES.has(cycle);
}
function resolveOccurredAt(value) {
    const candidate = (0, validators_1.ensureOptionalString)(value, "occurredAt") ?? new Date().toISOString().slice(0, 10);
    const date = new Date(candidate);
    if (Number.isNaN(date.getTime())) {
        throw new Error("Invalid occurredAt");
    }
    return date.toISOString().slice(0, 10);
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
function shouldReflectNow(cycle, reflectToLiquidAsset, occurredAt) {
    if (!reflectToLiquidAsset || !isReflectableCycle(cycle)) {
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
        note: "수입 반영용 자동 생성",
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
async function incomesHandler(context, req) {
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
        container = (0, cosmosClient_1.getContainer)("incomes");
        assetsContainer = (0, cosmosClient_1.getContainer)("assets");
    }
    catch (error) {
        context.log(error);
        return (0, responses_1.fail)("SERVER_ERROR", "Cosmos DB configuration error", 500);
    }
    const incomeId = req.params.incomeId;
    switch (req.method.toUpperCase()) {
        case "GET": {
            if (incomeId) {
                try {
                    const { resource } = await container.item(incomeId, userId).read();
                    if (!resource) {
                        return (0, responses_1.fail)("NOT_FOUND", "Income not found", 404);
                    }
                    return (0, responses_1.ok)((0, labels_1.attachIncomeLabels)(resource));
                }
                catch (error) {
                    const status = error.statusCode;
                    if (status === 404) {
                        return (0, responses_1.fail)("NOT_FOUND", "Income not found", 404);
                    }
                    context.log(error);
                    return (0, responses_1.fail)("SERVER_ERROR", "Failed to fetch income", 500);
                }
            }
            try {
                const query = {
                    query: "SELECT * FROM c WHERE c.userId = @userId AND c.type = 'Income'",
                    parameters: [{ name: "@userId", value: userId }]
                };
                const { resources } = await container.items.query(query).fetchAll();
                return (0, responses_1.ok)(resources.map(labels_1.attachIncomeLabels));
            }
            catch (error) {
                context.log(error);
                return (0, responses_1.fail)("SERVER_ERROR", "Failed to list incomes", 500);
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
            if (incomeId === "rollback-month") {
                try {
                    const targetMonth = resolveTargetMonth(body.targetMonth);
                    const autoQuery = {
                        query: "SELECT * FROM c WHERE c.userId = @userId AND c.type = 'Income' AND c.entrySource = 'auto_settlement' AND c.settledMonth = @settledMonth",
                        parameters: [
                            { name: "@userId", value: userId },
                            { name: "@settledMonth", value: targetMonth }
                        ]
                    };
                    const { resources } = await container.items.query(autoQuery).fetchAll();
                    const autoIncomes = resources;
                    if (autoIncomes.length === 0) {
                        return (0, responses_1.fail)("NOT_FOUND", `${targetMonth} 정산 내역이 없습니다.`, 404);
                    }
                    let deletedCount = 0;
                    let reversedAmount = 0;
                    for (const income of autoIncomes) {
                        const reflectedAmount = Number(income.reflectedAmount ?? 0);
                        if (reflectedAmount > 0) {
                            await applyLiquidAssetDelta(assetsContainer, userId, -reflectedAmount, income.reflectedAssetId || undefined);
                        }
                        await container.item(String(income.id), userId).delete();
                        deletedCount += 1;
                        reversedAmount += Number(income.amount ?? 0);
                    }
                    return (0, responses_1.ok)({ targetMonth, deletedCount, reversedAmount });
                }
                catch (error) {
                    if (error instanceof Error && error.message.startsWith("Invalid")) {
                        return (0, responses_1.fail)("VALIDATION_ERROR", error.message, 400);
                    }
                    context.log(error);
                    return (0, responses_1.fail)("SERVER_ERROR", "Failed to rollback income settlement", 500);
                }
            }
            if (incomeId === "check-settled") {
                try {
                    const targetMonth = resolveTargetMonth(body.targetMonth);
                    const checkQuery = {
                        query: "SELECT TOP 1 c.id FROM c WHERE c.userId = @userId AND c.type = 'Income' AND c.entrySource = 'auto_settlement' AND c.settledMonth = @settledMonth",
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
            if (incomeId === "settle-month") {
                try {
                    const targetMonth = resolveTargetMonth(body.targetMonth);
                    const alreadySettledQuery = {
                        query: "SELECT TOP 1 c.id FROM c WHERE c.userId = @userId AND c.type = 'Income' AND c.entrySource = 'auto_settlement' AND c.settledMonth = @settledMonth",
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
                        query: "SELECT * FROM c WHERE c.userId = @userId AND c.type = 'Income' AND c.cycle = 'monthly' AND c.isFixedIncome = true",
                        parameters: [{ name: "@userId", value: userId }]
                    };
                    const { resources } = await container.items.query(recurringQuery).fetchAll();
                    const templates = resources;
                    let createdCount = 0;
                    let skippedCount = 0;
                    let reflectedCount = 0;
                    let totalSettledAmount = 0;
                    for (const template of templates) {
                        const billingDay = Number(template.billingDay ?? 0);
                        if (!Number.isFinite(billingDay) || billingDay < 1 || billingDay > 31) {
                            skippedCount += 1;
                            continue;
                        }
                        const occurredAt = resolveDateByMonthAndBillingDay(targetMonth, billingDay);
                        const amount = Number(template.amount ?? 0);
                        const nowIso = new Date().toISOString();
                        const autoIncome = {
                            id: (0, crypto_1.randomUUID)(),
                            userId,
                            type: "Income",
                            name: (0, validators_1.ensureString)(template.name ?? "고정수입", "name"),
                            amount,
                            cycle: "one_time",
                            billingDay,
                            isFixedIncome: false,
                            entrySource: "auto_settlement",
                            sourceIncomeId: template.id,
                            settledMonth: targetMonth,
                            occurredAt,
                            reflectToLiquidAsset: true,
                            reflectedAmount: 0,
                            reflectedAssetId: "",
                            reflectedAt: "",
                            category: (0, validators_1.ensureOptionalString)(template.category ?? "", "category") ?? "",
                            note: (0, validators_1.ensureOptionalString)(template.note ?? "", "note") ?? "",
                            createdAt: nowIso,
                            updatedAt: nowIso
                        };
                        const { resource: created } = await container.items.create(autoIncome);
                        if (!created) {
                            skippedCount += 1;
                            continue;
                        }
                        createdCount += 1;
                        totalSettledAmount += amount;
                        if (shouldReflectNow("one_time", true, occurredAt)) {
                            const reflected = await applyLiquidAssetDelta(assetsContainer, userId, amount);
                            if (reflected) {
                                reflectedCount += 1;
                                const updatedIncome = {
                                    ...created,
                                    reflectedAmount: reflected.appliedDelta,
                                    reflectedAssetId: reflected.assetId,
                                    reflectedAt: new Date().toISOString(),
                                    updatedAt: new Date().toISOString()
                                };
                                await container.item(String(created.id), userId).replace(updatedIncome);
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
                    return (0, responses_1.fail)("SERVER_ERROR", "Failed to settle recurring incomes", 500);
                }
            }
            try {
                const cycle = (0, validators_1.ensureEnum)(body.cycle, "cycle", incomeCycles);
                const amount = (0, validators_1.ensureNumberInRange)(body.amount, "amount", 0, Number.MAX_SAFE_INTEGER);
                const occurredAt = resolveOccurredAt(body.occurredAt);
                const isFixedIncome = (0, validators_1.ensureOptionalBoolean)(body.isFixedIncome, "isFixedIncome") ?? false;
                const billingDay = (0, validators_1.ensureOptionalNumberInRange)(body.billingDay, "billingDay", 1, 31) ?? null;
                if (isFixedIncome && cycle !== "monthly") {
                    return (0, responses_1.fail)("VALIDATION_ERROR", "isFixedIncome is only allowed for monthly cycle", 400);
                }
                if (isFixedIncome && billingDay === null) {
                    return (0, responses_1.fail)("VALIDATION_ERROR", "billingDay is required for fixed monthly incomes", 400);
                }
                const reflectToLiquidAsset = (0, validators_1.ensureOptionalBoolean)(body.reflectToLiquidAsset, "reflectToLiquidAsset") ?? (cycle !== "monthly");
                const income = {
                    id: (0, crypto_1.randomUUID)(),
                    userId,
                    type: "Income",
                    name: (0, validators_1.ensureString)(body.name, "name"),
                    amount,
                    cycle,
                    billingDay: isFixedIncome ? billingDay : null,
                    isFixedIncome,
                    entrySource: "manual",
                    sourceIncomeId: "",
                    settledMonth: "",
                    occurredAt,
                    reflectToLiquidAsset,
                    reflectedAmount: 0,
                    reflectedAssetId: "",
                    reflectedAt: "",
                    category: (0, validators_1.ensureOptionalString)(body.category, "category") ?? "",
                    note: (0, validators_1.ensureOptionalString)(body.note, "note") ?? "",
                    owner: (0, validators_1.ensureOptionalString)(body.owner, "owner") ?? "본인",
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                const { resource } = await container.items.create(income);
                if (!resource) {
                    return (0, responses_1.fail)("SERVER_ERROR", "Failed to create income", 500);
                }
                const shouldReflect = shouldReflectNow(cycle, reflectToLiquidAsset, occurredAt);
                if (!shouldReflect) {
                    return (0, responses_1.ok)(resource, 201);
                }
                const reflected = await applyLiquidAssetDelta(assetsContainer, userId, amount);
                const nowIso = new Date().toISOString();
                const updatedIncome = {
                    ...resource,
                    reflectedAmount: reflected?.appliedDelta ?? 0,
                    reflectedAssetId: reflected?.assetId ?? "",
                    reflectedAt: reflected ? nowIso : "",
                    updatedAt: nowIso
                };
                const { resource: savedIncome } = await container.item(updatedIncome.id, userId).replace(updatedIncome);
                return (0, responses_1.ok)(savedIncome ?? updatedIncome, 201);
            }
            catch (error) {
                if (error instanceof Error && error.message.startsWith("Invalid")) {
                    return (0, responses_1.fail)("VALIDATION_ERROR", error.message, 400);
                }
                context.log(error);
                return (0, responses_1.fail)("SERVER_ERROR", "Failed to create income", 500);
            }
        }
        case "PUT": {
            if (!incomeId) {
                return (0, responses_1.fail)("VALIDATION_ERROR", "Missing incomeId", 400);
            }
            let body;
            try {
                body = await (0, request_body_1.parseJsonBody)(req);
            }
            catch {
                return (0, responses_1.fail)("INVALID_JSON", "Invalid JSON body", 400);
            }
            try {
                const { resource } = await container.item(incomeId, userId).read();
                if (!resource) {
                    return (0, responses_1.fail)("NOT_FOUND", "Income not found", 404);
                }
                const existing = resource;
                const nextCycle = (0, validators_1.ensureOptionalEnum)(body.cycle, "cycle", incomeCycles) ??
                    existing.cycle;
                const nextAmount = (0, validators_1.ensureOptionalNumberInRange)(body.amount, "amount", 0, Number.MAX_SAFE_INTEGER) ??
                    Number(existing.amount ?? 0);
                const nextOccurredAt = resolveOccurredAt(body.occurredAt ?? existing.occurredAt);
                const nextIsFixedIncome = (0, validators_1.ensureOptionalBoolean)(body.isFixedIncome, "isFixedIncome") ??
                    Boolean(existing.isFixedIncome ?? false);
                const existingBillingDay = Number(existing.billingDay ?? 0);
                const nextBillingDay = (0, validators_1.ensureOptionalNumberInRange)(body.billingDay, "billingDay", 1, 31) ??
                    (existingBillingDay >= 1 && existingBillingDay <= 31 ? existingBillingDay : null);
                if (nextIsFixedIncome && nextCycle !== "monthly") {
                    return (0, responses_1.fail)("VALIDATION_ERROR", "isFixedIncome is only allowed for monthly cycle", 400);
                }
                if (nextIsFixedIncome && nextBillingDay === null) {
                    return (0, responses_1.fail)("VALIDATION_ERROR", "billingDay is required for fixed monthly incomes", 400);
                }
                const nextReflectSetting = (0, validators_1.ensureOptionalBoolean)(body.reflectToLiquidAsset, "reflectToLiquidAsset") ??
                    (existing.reflectToLiquidAsset ?? existing.cycle !== "monthly");
                const prevReflectedAmount = Number(existing.reflectedAmount ?? 0);
                const nextReflectedAmount = shouldReflectNow(nextCycle, nextReflectSetting, nextOccurredAt) ? nextAmount : 0;
                const reflectDelta = nextReflectedAmount - prevReflectedAmount;
                let reflectedAssetId = (existing.reflectedAssetId ?? "");
                let reflectedAt = (existing.reflectedAt ?? "");
                if (reflectDelta !== 0) {
                    const reflected = await applyLiquidAssetDelta(assetsContainer, userId, reflectDelta, reflectedAssetId || undefined);
                    reflectedAssetId = reflected?.assetId ?? reflectedAssetId;
                    reflectedAt = reflected ? new Date().toISOString() : reflectedAt;
                }
                if (nextReflectedAmount === 0) {
                    reflectedAt = "";
                }
                const updated = {
                    ...existing,
                    name: (0, validators_1.ensureOptionalString)(body.name, "name") ?? existing.name,
                    amount: nextAmount,
                    cycle: nextCycle,
                    billingDay: nextIsFixedIncome ? nextBillingDay : null,
                    isFixedIncome: nextIsFixedIncome,
                    occurredAt: nextOccurredAt,
                    reflectToLiquidAsset: nextReflectSetting,
                    reflectedAmount: nextReflectedAmount,
                    reflectedAssetId,
                    reflectedAt,
                    category: (0, validators_1.ensureOptionalString)(body.category, "category") ?? existing.category,
                    note: (0, validators_1.ensureOptionalString)(body.note, "note") ?? existing.note,
                    owner: (0, validators_1.ensureOptionalString)(body.owner, "owner") ?? existing.owner ?? "본인",
                    updatedAt: new Date().toISOString()
                };
                const { resource: saved } = await container.item(incomeId, userId).replace(updated);
                return (0, responses_1.ok)(saved);
            }
            catch (error) {
                const status = error.statusCode;
                if (status === 404) {
                    return (0, responses_1.fail)("NOT_FOUND", "Income not found", 404);
                }
                if (error instanceof Error && error.message.startsWith("Invalid")) {
                    return (0, responses_1.fail)("VALIDATION_ERROR", error.message, 400);
                }
                context.log(error);
                return (0, responses_1.fail)("SERVER_ERROR", "Failed to update income", 500);
            }
        }
        case "DELETE": {
            if (!incomeId) {
                return (0, responses_1.fail)("VALIDATION_ERROR", "Missing incomeId", 400);
            }
            try {
                const { resource } = await container.item(incomeId, userId).read();
                if (!resource) {
                    return (0, responses_1.fail)("NOT_FOUND", "Income not found", 404);
                }
                const income = resource;
                const reflectedAmount = Number(income.reflectedAmount ?? 0);
                if (reflectedAmount > 0) {
                    await applyLiquidAssetDelta(assetsContainer, userId, -reflectedAmount, income.reflectedAssetId || undefined);
                }
                await container.item(incomeId, userId).delete();
                return (0, responses_1.ok)({ id: incomeId });
            }
            catch (error) {
                const status = error.statusCode;
                if (status === 404) {
                    return (0, responses_1.fail)("NOT_FOUND", "Income not found", 404);
                }
                context.log(error);
                return (0, responses_1.fail)("SERVER_ERROR", "Failed to delete income", 500);
            }
        }
        default:
            context.log(`Unsupported method: ${req.method}`);
            return (0, responses_1.fail)("METHOD_NOT_ALLOWED", "Method not allowed", 405);
    }
}
