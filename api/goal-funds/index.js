"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.goalFundsHandler = goalFundsHandler;
const crypto_1 = require("crypto");
const auth_1 = require("../shared/auth");
const cosmosClient_1 = require("../shared/cosmosClient");
const responses_1 = require("../shared/responses");
const validators_1 = require("../shared/validators");
const request_body_1 = require("../shared/request-body");
const horizonTypes = ["short", "mid", "long"];
const vehicleTypes = ["savings", "deposit", "etf", "stock", "fund", "crypto", "cash", "other"];
const statusTypes = ["active", "paused", "completed", "cancelled"];
async function goalFundsHandler(req, context) {
    try {
        const authContext = (0, auth_1.getAuthContext)(req);
        const userId = authContext.userId;
        (0, validators_1.requireUserId)(userId);
        const container = (0, cosmosClient_1.getContainer)("goalFunds");
        const method = req.method.toUpperCase();
        const fundId = req.params.fundId;
        // GET - list all or single
        if (method === "GET") {
            if (fundId) {
                const { resource } = await container.item(fundId, userId).read();
                if (!resource || resource.userId !== userId) {
                    return (0, responses_1.fail)("Goal fund not found", 404);
                }
                return (0, responses_1.ok)(resource);
            }
            const query = {
                query: "SELECT * FROM c WHERE c.userId = @userId AND c.type = 'GoalFund' ORDER BY c.createdAt DESC",
                parameters: [{ name: "@userId", value: userId }]
            };
            const { resources } = await container.items.query(query).fetchAll();
            return (0, responses_1.ok)(resources);
        }
        // POST - create
        if (method === "POST") {
            const body = await (0, request_body_1.parseJsonBody)(req);
            const name = (0, validators_1.ensureString)(body.name, "name");
            const horizon = (0, validators_1.ensureEnum)(body.horizon, horizonTypes, "horizon");
            const vehicle = (0, validators_1.ensureEnum)(body.vehicle, vehicleTypes, "vehicle");
            const targetAmount = (0, validators_1.ensureNumber)(body.targetAmount, "targetAmount");
            const currentAmount = body.currentAmount != null ? (0, validators_1.ensureNumber)(body.currentAmount, "currentAmount") : 0;
            const monthlyContribution = body.monthlyContribution != null ? (0, validators_1.ensureNumber)(body.monthlyContribution, "monthlyContribution") : 0;
            const targetDate = (0, validators_1.ensureOptionalString)(body.targetDate, "targetDate");
            const note = (0, validators_1.ensureOptionalString)(body.note, "note");
            const status = body.status ? (0, validators_1.ensureEnum)(body.status, statusTypes, "status") : "active";
            const now = new Date().toISOString();
            const item = {
                id: (0, crypto_1.randomUUID)(),
                userId,
                type: "GoalFund",
                name,
                horizon,
                vehicle,
                targetAmount,
                currentAmount,
                monthlyContribution,
                targetDate: targetDate ?? null,
                note: note ?? null,
                status,
                monthlyLogs: [],
                createdAt: now,
                updatedAt: now
            };
            await container.items.create(item);
            return (0, responses_1.ok)(item, 201);
        }
        // PUT - update
        if (method === "PUT") {
            if (!fundId)
                return (0, responses_1.fail)("Fund ID required", 400);
            const { resource: existing } = await container.item(fundId, userId).read();
            if (!existing || existing.userId !== userId) {
                return (0, responses_1.fail)("Goal fund not found", 404);
            }
            const body = await (0, request_body_1.parseJsonBody)(req);
            // Allow updating monthlyLogs via special action
            if (body.action === "add-log") {
                const month = (0, validators_1.ensureString)(body.month, "month");
                const amount = (0, validators_1.ensureNumber)(body.amount, "amount");
                const logNote = (0, validators_1.ensureOptionalString)(body.note, "note");
                const logs = existing.monthlyLogs || [];
                const existingLogIdx = logs.findIndex((l) => l.month === month);
                if (existingLogIdx >= 0) {
                    logs[existingLogIdx] = { month, amount, note: logNote };
                }
                else {
                    logs.push({ month, amount, note: logNote });
                    logs.sort((a, b) => a.month.localeCompare(b.month));
                }
                // Recalculate currentAmount from logs
                const totalFromLogs = logs.reduce((s, l) => s + l.amount, 0);
                const updated = {
                    ...existing,
                    monthlyLogs: logs,
                    currentAmount: totalFromLogs,
                    updatedAt: new Date().toISOString()
                };
                await container.item(fundId, userId).replace(updated);
                return (0, responses_1.ok)(updated);
            }
            if (body.action === "remove-log") {
                const month = (0, validators_1.ensureString)(body.month, "month");
                const logs = (existing.monthlyLogs || []).filter((l) => l.month !== month);
                const totalFromLogs = logs.reduce((s, l) => s + l.amount, 0);
                const updated = {
                    ...existing,
                    monthlyLogs: logs,
                    currentAmount: totalFromLogs,
                    updatedAt: new Date().toISOString()
                };
                await container.item(fundId, userId).replace(updated);
                return (0, responses_1.ok)(updated);
            }
            // General update
            const updated = {
                ...existing,
                name: body.name != null ? (0, validators_1.ensureString)(body.name, "name") : existing.name,
                horizon: body.horizon != null ? (0, validators_1.ensureEnum)(body.horizon, horizonTypes, "horizon") : existing.horizon,
                vehicle: body.vehicle != null ? (0, validators_1.ensureEnum)(body.vehicle, vehicleTypes, "vehicle") : existing.vehicle,
                targetAmount: body.targetAmount != null ? (0, validators_1.ensureNumber)(body.targetAmount, "targetAmount") : existing.targetAmount,
                currentAmount: body.currentAmount != null ? (0, validators_1.ensureNumber)(body.currentAmount, "currentAmount") : existing.currentAmount,
                monthlyContribution: body.monthlyContribution != null ? (0, validators_1.ensureNumber)(body.monthlyContribution, "monthlyContribution") : existing.monthlyContribution,
                targetDate: body.targetDate !== undefined ? ((0, validators_1.ensureOptionalString)(body.targetDate, "targetDate") ?? null) : existing.targetDate,
                note: body.note !== undefined ? ((0, validators_1.ensureOptionalString)(body.note, "note") ?? null) : existing.note,
                status: body.status != null ? (0, validators_1.ensureEnum)(body.status, statusTypes, "status") : existing.status,
                updatedAt: new Date().toISOString()
            };
            await container.item(fundId, userId).replace(updated);
            return (0, responses_1.ok)(updated);
        }
        // DELETE
        if (method === "DELETE") {
            if (!fundId)
                return (0, responses_1.fail)("Fund ID required", 400);
            const { resource: existing } = await container.item(fundId, userId).read();
            if (!existing || existing.userId !== userId) {
                return (0, responses_1.fail)("Goal fund not found", 404);
            }
            await container.item(fundId, userId).delete();
            return (0, responses_1.ok)({ deleted: true });
        }
        return (0, responses_1.fail)("Method not allowed", 405);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        if (message === "UNAUTHORIZED")
            return (0, responses_1.fail)("Unauthorized", 401);
        context.log("GoalFunds error:", message);
        return (0, responses_1.fail)(message, 400);
    }
}
