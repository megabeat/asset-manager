"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dashboardHandler = dashboardHandler;
const auth_1 = require("../shared/auth");
const cosmosClient_1 = require("../shared/cosmosClient");
const responses_1 = require("../shared/responses");
const validators_1 = require("../shared/validators");
function toHourBucket(isoString) {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) {
        return null;
    }
    date.setMinutes(0, 0, 0);
    return date.toISOString();
}
function resolveRange(range) {
    const now = new Date();
    const to = now.toISOString();
    const fromDate = new Date(now);
    switch (range) {
        case "24h":
            fromDate.setHours(fromDate.getHours() - 24);
            break;
        case "7d":
            fromDate.setDate(fromDate.getDate() - 7);
            break;
        case "30d":
            fromDate.setDate(fromDate.getDate() - 30);
            break;
        default:
            return null;
    }
    return { from: fromDate.toISOString(), to };
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
async function listUserAssetIds(userId) {
    const assetsContainer = (0, cosmosClient_1.getContainer)("assets");
    const query = {
        query: "SELECT c.id FROM c WHERE c.userId = @userId AND c.type = 'Asset'",
        parameters: [{ name: "@userId", value: userId }]
    };
    const { resources } = await assetsContainer.items.query(query).fetchAll();
    return resources
        .map((item) => item.id)
        .filter((id) => typeof id === "string" && id.length > 0);
}
async function queryAssetHistoryRows(container, userId, querySpec) {
    const partitionCandidates = [[userId], userId, undefined];
    let lastError = null;
    for (const partitionKey of partitionCandidates) {
        try {
            const options = partitionKey === undefined ? undefined : { partitionKey };
            const { resources } = await container.items.query(querySpec, options).fetchAll();
            return resources;
        }
        catch (error) {
            lastError = error;
        }
    }
    throw lastError ?? new Error("Failed to query asset history");
}
async function dashboardHandler(context, req) {
    const { userId } = (0, auth_1.getAuthContext)(req.headers);
    try {
        (0, validators_1.requireUserId)(userId);
    }
    catch {
        return (0, responses_1.fail)("UNAUTHORIZED", "Authentication required", 401);
    }
    const action = req.params.action?.toLowerCase();
    switch (action) {
        case "summary":
            try {
                let assetsContainer;
                let expensesContainer;
                let liabilitiesContainer;
                try {
                    assetsContainer = (0, cosmosClient_1.getContainer)("assets");
                    expensesContainer = (0, cosmosClient_1.getContainer)("expenses");
                    liabilitiesContainer = (0, cosmosClient_1.getContainer)("liabilities");
                }
                catch (error) {
                    context.log(error);
                    return (0, responses_1.fail)("SERVER_ERROR", "Cosmos DB configuration error", 500);
                }
                const assetsQuery = {
                    query: "SELECT VALUE SUM(c.currentValue) FROM c WHERE c.userId = @userId AND c.type = 'Asset' AND NOT (c.category = 'pension' OR c.category = 'pension_national' OR c.category = 'pension_personal' OR c.category = 'pension_retirement')",
                    parameters: [{ name: "@userId", value: userId }]
                };
                const expensesQuery = {
                    query: "SELECT VALUE SUM(c.amount) FROM c WHERE c.userId = @userId AND c.type = 'Expense' AND (c.expenseType = '고정' OR c.expenseType = 'fixed') AND (c.cycle = '매월' OR c.cycle = 'monthly') AND (NOT IS_DEFINED(c.isInvestmentTransfer) OR c.isInvestmentTransfer = false)",
                    parameters: [{ name: "@userId", value: userId }]
                };
                const liabilitiesQuery = {
                    query: "SELECT VALUE SUM(c.amount) FROM c WHERE c.userId = @userId AND c.type = 'Liability'",
                    parameters: [{ name: "@userId", value: userId }]
                };
                const [assetsResult, expensesResult, liabilitiesResult] = await Promise.all([
                    assetsContainer.items.query(assetsQuery).fetchAll(),
                    expensesContainer.items.query(expensesQuery).fetchAll(),
                    liabilitiesContainer.items.query(liabilitiesQuery).fetchAll()
                ]);
                const totalAssets = assetsResult.resources[0] ?? 0;
                const monthlyFixedExpense = expensesResult.resources[0] ?? 0;
                const totalLiabilities = liabilitiesResult.resources[0] ?? 0;
                const netWorth = totalAssets - totalLiabilities;
                return (0, responses_1.ok)({ totalAssets, totalLiabilities, netWorth, monthlyFixedExpense });
            }
            catch (error) {
                context.log(error);
                return (0, responses_1.fail)("SERVER_ERROR", "Failed to build summary", 500);
            }
        case "asset-trend": {
            const range = resolveRange(getQueryValue(req, "range") ?? null);
            if (!range) {
                return (0, responses_1.fail)("VALIDATION_ERROR", "Invalid range", 400);
            }
            try {
                let container;
                try {
                    container = (0, cosmosClient_1.getContainer)("assetHistory");
                }
                catch (error) {
                    context.log(error);
                    return (0, responses_1.fail)("SERVER_ERROR", "Cosmos DB configuration error", 500);
                }
                const assetIds = await listUserAssetIds(userId);
                if (assetIds.length === 0) {
                    return (0, responses_1.ok)([]);
                }
                const query = {
                    query: "SELECT c.recordedAt, c.value, c.assetId FROM c WHERE c.userId = @userId AND c.type = 'AssetHistory' AND c.recordedAt >= @from AND c.recordedAt <= @to AND (NOT IS_DEFINED(c.isWindowRecord) OR c.isWindowRecord = false) AND ARRAY_CONTAINS(@assetIds, c.assetId)",
                    parameters: [
                        { name: "@userId", value: userId },
                        { name: "@from", value: range.from },
                        { name: "@to", value: range.to },
                        { name: "@assetIds", value: assetIds }
                    ]
                };
                const resources = await queryAssetHistoryRows(container, userId, query);
                const buckets = new Map();
                for (const entry of resources) {
                    const recordedAt = typeof entry.recordedAt === "string" ? entry.recordedAt : "";
                    const bucket = toHourBucket(recordedAt);
                    if (!bucket) {
                        continue;
                    }
                    const current = buckets.get(bucket) ?? 0;
                    buckets.set(bucket, current + (typeof entry.value === "number" ? entry.value : 0));
                }
                const points = Array.from(buckets.entries())
                    .map(([time, value]) => ({ time, value }))
                    .sort((a, b) => a.time.localeCompare(b.time));
                return (0, responses_1.ok)(points);
            }
            catch (error) {
                context.log(error);
                return (0, responses_1.fail)("SERVER_ERROR", "Failed to build asset trend", 500);
            }
        }
        case "monthly-change": {
            try {
                let container;
                try {
                    container = (0, cosmosClient_1.getContainer)("assetHistory");
                }
                catch (error) {
                    context.log(error);
                    return (0, responses_1.fail)("SERVER_ERROR", "Cosmos DB configuration error", 500);
                }
                const assetIds = await listUserAssetIds(userId);
                if (assetIds.length === 0) {
                    return (0, responses_1.ok)([]);
                }
                const query = {
                    query: "SELECT c.assetId, c.windowMonth, c.value, c.monthlyDelta, c.recordedAt FROM c WHERE c.userId = @userId AND c.type = 'AssetHistory' AND c.isWindowRecord = true AND ARRAY_CONTAINS(@assetIds, c.assetId)",
                    parameters: [
                        { name: "@userId", value: userId },
                        { name: "@assetIds", value: assetIds }
                    ]
                };
                const resources = (await queryAssetHistoryRows(container, userId, query))
                    .sort((a, b) => String(a.recordedAt ?? "").localeCompare(String(b.recordedAt ?? "")));
                const latestByMonthAndAsset = new Map();
                for (const row of resources) {
                    if (!row.assetId || !row.windowMonth) {
                        continue;
                    }
                    const mapKey = `${row.windowMonth}|${row.assetId}`;
                    latestByMonthAndAsset.set(mapKey, {
                        month: row.windowMonth,
                        value: Number(row.value ?? 0),
                        delta: Number(row.monthlyDelta ?? 0)
                    });
                }
                const aggregateByMonth = new Map();
                for (const entry of latestByMonthAndAsset.values()) {
                    const existing = aggregateByMonth.get(entry.month) ?? {
                        month: entry.month,
                        totalValue: 0,
                        delta: 0
                    };
                    existing.totalValue += entry.value;
                    existing.delta += entry.delta;
                    aggregateByMonth.set(entry.month, existing);
                }
                const monthlyChanges = Array.from(aggregateByMonth.values()).sort((a, b) => a.month.localeCompare(b.month));
                return (0, responses_1.ok)(monthlyChanges);
            }
            catch (error) {
                context.log(error);
                return (0, responses_1.fail)("SERVER_ERROR", "Failed to build monthly changes", 500);
            }
        }
        default:
            context.log(`Unsupported dashboard action: ${action}`);
            return (0, responses_1.fail)("NOT_FOUND", "Unknown dashboard action", 404);
    }
}
