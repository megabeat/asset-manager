"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.incomesHandler = incomesHandler;
const crypto_1 = require("crypto");
const auth_1 = require("../shared/auth");
const cosmosClient_1 = require("../shared/cosmosClient");
const responses_1 = require("../shared/responses");
const validators_1 = require("../shared/validators");
const request_body_1 = require("../shared/request-body");
const incomeCycles = ["monthly", "yearly", "one_time"];
async function incomesHandler(context, req) {
    const { userId } = (0, auth_1.getAuthContext)(req.headers);
    try {
        (0, validators_1.requireUserId)(userId);
    }
    catch {
        return (0, responses_1.fail)("UNAUTHORIZED", "Authentication required", 401);
    }
    let container;
    try {
        container = (0, cosmosClient_1.getContainer)("incomes");
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
                    return (0, responses_1.ok)(resource);
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
                return (0, responses_1.ok)(resources);
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
            try {
                const income = {
                    id: (0, crypto_1.randomUUID)(),
                    userId,
                    type: "Income",
                    name: (0, validators_1.ensureString)(body.name, "name"),
                    amount: (0, validators_1.ensureNumberInRange)(body.amount, "amount", 0, Number.MAX_SAFE_INTEGER),
                    cycle: (0, validators_1.ensureEnum)(body.cycle, "cycle", incomeCycles),
                    category: (0, validators_1.ensureOptionalString)(body.category, "category") ?? "",
                    note: (0, validators_1.ensureOptionalString)(body.note, "note") ?? "",
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                const { resource } = await container.items.create(income);
                return (0, responses_1.ok)(resource, 201);
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
                const updated = {
                    ...resource,
                    name: (0, validators_1.ensureOptionalString)(body.name, "name") ?? resource.name,
                    amount: (0, validators_1.ensureOptionalNumberInRange)(body.amount, "amount", 0, Number.MAX_SAFE_INTEGER) ??
                        resource.amount,
                    cycle: (0, validators_1.ensureOptionalEnum)(body.cycle, "cycle", incomeCycles) ?? resource.cycle,
                    category: (0, validators_1.ensureOptionalString)(body.category, "category") ?? resource.category,
                    note: (0, validators_1.ensureOptionalString)(body.note, "note") ?? resource.note,
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
