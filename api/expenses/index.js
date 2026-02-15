"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.expensesHandler = expensesHandler;
const crypto_1 = require("crypto");
const auth_1 = require("../shared/auth");
const cosmosClient_1 = require("../shared/cosmosClient");
const responses_1 = require("../shared/responses");
const validators_1 = require("../shared/validators");
const request_body_1 = require("../shared/request-body");
const expenseTypes = ["fixed", "subscription"];
const billingCycles = ["monthly", "yearly"];
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
            try {
                const amount = (0, validators_1.ensureNumberInRange)(body.amount, "amount", 0, Number.MAX_SAFE_INTEGER);
                const reflectToLiquidAsset = (0, validators_1.ensureOptionalBoolean)(body.reflectToLiquidAsset, "reflectToLiquidAsset") ?? false;
                const occurredAt = resolveOccurredAt(body.occurredAt);
                const expense = {
                    id: (0, crypto_1.randomUUID)(),
                    userId,
                    type: "Expense",
                    expenseType: (0, validators_1.ensureEnum)(body.type, "type", expenseTypes),
                    name: (0, validators_1.ensureString)(body.name, "name"),
                    amount,
                    cycle: (0, validators_1.ensureEnum)(body.cycle, "cycle", billingCycles),
                    billingDay: (0, validators_1.ensureOptionalNumberInRange)(body.billingDay, "billingDay", 1, 31) ?? null,
                    occurredAt,
                    reflectToLiquidAsset,
                    reflectedAmount: 0,
                    reflectedAssetId: "",
                    reflectedAt: "",
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
                const nowIso = new Date().toISOString();
                const updatedExpense = {
                    ...resource,
                    reflectedAmount: reflected ? amount : 0,
                    reflectedAssetId: reflected?.assetId ?? "",
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
                const updated = {
                    ...existing,
                    expenseType: (0, validators_1.ensureOptionalEnum)(body.type, "type", expenseTypes) ?? existing.expenseType,
                    name: (0, validators_1.ensureOptionalString)(body.name, "name") ?? existing.name,
                    amount: nextAmount,
                    cycle: (0, validators_1.ensureOptionalEnum)(body.cycle, "cycle", billingCycles) ?? existing.cycle,
                    billingDay: (0, validators_1.ensureOptionalNumberInRange)(body.billingDay, "billingDay", 1, 31) ??
                        existing.billingDay,
                    occurredAt: nextOccurredAt,
                    reflectToLiquidAsset: nextReflectSetting,
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
