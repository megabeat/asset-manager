"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.expensesHandler = expensesHandler;
const crypto_1 = require("crypto");
const auth_1 = require("../shared/auth");
const cosmosClient_1 = require("../shared/cosmosClient");
const responses_1 = require("../shared/responses");
const validators_1 = require("../shared/validators");
const expenseTypes = ["fixed", "subscription"];
const billingCycles = ["monthly", "yearly"];
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
    try {
        container = (0, cosmosClient_1.getContainer)("expenses");
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
                body = (await req.json());
            }
            catch {
                return (0, responses_1.fail)("INVALID_JSON", "Invalid JSON body", 400);
            }
            try {
                const expense = {
                    id: (0, crypto_1.randomUUID)(),
                    userId,
                    type: "Expense",
                    expenseType: (0, validators_1.ensureEnum)(body.type, "type", expenseTypes),
                    name: (0, validators_1.ensureString)(body.name, "name"),
                    amount: (0, validators_1.ensureNumberInRange)(body.amount, "amount", 0, Number.MAX_SAFE_INTEGER),
                    cycle: (0, validators_1.ensureEnum)(body.cycle, "cycle", billingCycles),
                    billingDay: (0, validators_1.ensureOptionalNumberInRange)(body.billingDay, "billingDay", 1, 31) ?? null,
                    category: (0, validators_1.ensureOptionalString)(body.category, "category") ?? "",
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                const { resource } = await container.items.create(expense);
                return (0, responses_1.ok)(resource, 201);
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
                body = (await req.json());
            }
            catch {
                return (0, responses_1.fail)("INVALID_JSON", "Invalid JSON body", 400);
            }
            try {
                const { resource } = await container.item(expenseId, userId).read();
                if (!resource) {
                    return (0, responses_1.fail)("NOT_FOUND", "Expense not found", 404);
                }
                const updated = {
                    ...resource,
                    expenseType: (0, validators_1.ensureOptionalEnum)(body.type, "type", expenseTypes) ?? resource.expenseType,
                    name: (0, validators_1.ensureOptionalString)(body.name, "name") ?? resource.name,
                    amount: (0, validators_1.ensureOptionalNumberInRange)(body.amount, "amount", 0, Number.MAX_SAFE_INTEGER) ??
                        resource.amount,
                    cycle: (0, validators_1.ensureOptionalEnum)(body.cycle, "cycle", billingCycles) ?? resource.cycle,
                    billingDay: (0, validators_1.ensureOptionalNumberInRange)(body.billingDay, "billingDay", 1, 31) ??
                        resource.billingDay,
                    category: (0, validators_1.ensureOptionalString)(body.category, "category") ?? resource.category,
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
