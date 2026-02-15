"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.liabilitiesHandler = liabilitiesHandler;
const crypto_1 = require("crypto");
const auth_1 = require("../shared/auth");
const cosmosClient_1 = require("../shared/cosmosClient");
const responses_1 = require("../shared/responses");
const validators_1 = require("../shared/validators");
const request_body_1 = require("../shared/request-body");
async function liabilitiesHandler(context, req) {
    const { userId } = (0, auth_1.getAuthContext)(req.headers);
    try {
        (0, validators_1.requireUserId)(userId);
    }
    catch {
        return (0, responses_1.fail)("UNAUTHORIZED", "Authentication required", 401);
    }
    const container = (0, cosmosClient_1.getContainer)("liabilities");
    const liabilityId = req.params.liabilityId;
    switch (req.method.toUpperCase()) {
        case "GET": {
            if (liabilityId) {
                try {
                    const { resource } = await container.item(liabilityId, userId).read();
                    if (!resource) {
                        return (0, responses_1.fail)("NOT_FOUND", "Liability not found", 404);
                    }
                    return (0, responses_1.ok)(resource);
                }
                catch (error) {
                    const status = error.statusCode;
                    if (status === 404) {
                        return (0, responses_1.fail)("NOT_FOUND", "Liability not found", 404);
                    }
                    context.log(error);
                    return (0, responses_1.fail)("SERVER_ERROR", "Failed to fetch liability", 500);
                }
            }
            try {
                const query = {
                    query: "SELECT * FROM c WHERE c.userId = @userId AND c.type = 'Liability'",
                    parameters: [{ name: "@userId", value: userId }]
                };
                const { resources } = await container.items.query(query).fetchAll();
                return (0, responses_1.ok)(resources);
            }
            catch (error) {
                context.log(error);
                return (0, responses_1.fail)("SERVER_ERROR", "Failed to list liabilities", 500);
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
                const liability = {
                    id: (0, crypto_1.randomUUID)(),
                    userId,
                    type: "Liability",
                    name: (0, validators_1.ensureString)(body.name, "name"),
                    amount: (0, validators_1.ensureNumberInRange)(body.amount, "amount", 0, Number.MAX_SAFE_INTEGER),
                    category: (0, validators_1.ensureOptionalString)(body.category, "category") ?? "",
                    note: (0, validators_1.ensureOptionalString)(body.note, "note") ?? "",
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                const { resource } = await container.items.create(liability);
                return (0, responses_1.ok)(resource, 201);
            }
            catch (error) {
                if (error instanceof Error && error.message.startsWith("Invalid")) {
                    return (0, responses_1.fail)("VALIDATION_ERROR", error.message, 400);
                }
                context.log(error);
                return (0, responses_1.fail)("SERVER_ERROR", "Failed to create liability", 500);
            }
        }
        case "PUT": {
            if (!liabilityId) {
                return (0, responses_1.fail)("VALIDATION_ERROR", "Missing liabilityId", 400);
            }
            let body;
            try {
                body = await (0, request_body_1.parseJsonBody)(req);
            }
            catch {
                return (0, responses_1.fail)("INVALID_JSON", "Invalid JSON body", 400);
            }
            try {
                const { resource } = await container.item(liabilityId, userId).read();
                if (!resource) {
                    return (0, responses_1.fail)("NOT_FOUND", "Liability not found", 404);
                }
                const updated = {
                    ...resource,
                    name: (0, validators_1.ensureOptionalString)(body.name, "name") ?? resource.name,
                    amount: (0, validators_1.ensureOptionalNumberInRange)(body.amount, "amount", 0, Number.MAX_SAFE_INTEGER) ??
                        resource.amount,
                    category: (0, validators_1.ensureOptionalString)(body.category, "category") ?? resource.category,
                    note: (0, validators_1.ensureOptionalString)(body.note, "note") ?? resource.note,
                    updatedAt: new Date().toISOString()
                };
                const { resource: saved } = await container.item(liabilityId, userId).replace(updated);
                return (0, responses_1.ok)(saved);
            }
            catch (error) {
                const status = error.statusCode;
                if (status === 404) {
                    return (0, responses_1.fail)("NOT_FOUND", "Liability not found", 404);
                }
                if (error instanceof Error && error.message.startsWith("Invalid")) {
                    return (0, responses_1.fail)("VALIDATION_ERROR", error.message, 400);
                }
                context.log(error);
                return (0, responses_1.fail)("SERVER_ERROR", "Failed to update liability", 500);
            }
        }
        case "DELETE": {
            if (!liabilityId) {
                return (0, responses_1.fail)("VALIDATION_ERROR", "Missing liabilityId", 400);
            }
            try {
                await container.item(liabilityId, userId).delete();
                return (0, responses_1.ok)({ id: liabilityId });
            }
            catch (error) {
                const status = error.statusCode;
                if (status === 404) {
                    return (0, responses_1.fail)("NOT_FOUND", "Liability not found", 404);
                }
                context.log(error);
                return (0, responses_1.fail)("SERVER_ERROR", "Failed to delete liability", 500);
            }
        }
        default:
            context.log(`Unsupported method: ${req.method}`);
            return (0, responses_1.fail)("METHOD_NOT_ALLOWED", "Method not allowed", 405);
    }
}
