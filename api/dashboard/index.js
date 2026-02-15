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
                    query: "SELECT VALUE SUM(c.currentValue) FROM c WHERE c.userId = @userId AND c.type = 'Asset'",
                    parameters: [{ name: "@userId", value: userId }]
                };
                const expensesQuery = {
                    query: "SELECT VALUE SUM(c.amount) FROM c WHERE c.userId = @userId AND c.type = 'Expense' AND c.expenseType = 'fixed' AND c.cycle = 'monthly'",
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
            const range = resolveRange(req.query.get("range"));
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
                const query = {
                    query: "SELECT c.recordedAt, c.value FROM c WHERE c.userId = @userId AND c.recordedAt >= @from AND c.recordedAt <= @to",
                    parameters: [
                        { name: "@userId", value: userId },
                        { name: "@from", value: range.from },
                        { name: "@to", value: range.to }
                    ]
                };
                const { resources } = await container.items.query(query).fetchAll();
                const buckets = new Map();
                for (const entry of resources) {
                    const bucket = toHourBucket(entry.recordedAt);
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
        default:
            context.log(`Unsupported dashboard action: ${action}`);
            return (0, responses_1.fail)("NOT_FOUND", "Unknown dashboard action", 404);
    }
}
