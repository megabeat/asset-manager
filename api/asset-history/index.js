"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assetHistoryHandler = assetHistoryHandler;
const crypto_1 = require("crypto");
const auth_1 = require("../shared/auth");
const cosmosClient_1 = require("../shared/cosmosClient");
const responses_1 = require("../shared/responses");
const validators_1 = require("../shared/validators");
async function assetHistoryHandler(context, req) {
    const { userId } = (0, auth_1.getAuthContext)(req.headers);
    try {
        (0, validators_1.requireUserId)(userId);
    }
    catch {
        return (0, responses_1.fail)("UNAUTHORIZED", "Authentication required", 401);
    }
    const container = (0, cosmosClient_1.getContainer)("assetHistory");
    const assetId = req.params.assetId;
    const historyId = req.params.historyId;
    const partitionKey = [userId, assetId];
    switch (req.method.toUpperCase()) {
        case "GET": {
            if (!assetId) {
                return (0, responses_1.fail)("VALIDATION_ERROR", "Missing assetId", 400);
            }
            if (historyId) {
                try {
                    const { resource } = await container.item(historyId, partitionKey).read();
                    if (!resource) {
                        return (0, responses_1.fail)("NOT_FOUND", "History item not found", 404);
                    }
                    return (0, responses_1.ok)(resource);
                }
                catch (error) {
                    const status = error.statusCode;
                    if (status === 404) {
                        return (0, responses_1.fail)("NOT_FOUND", "History item not found", 404);
                    }
                    context.log(error);
                    return (0, responses_1.fail)("SERVER_ERROR", "Failed to fetch history item", 500);
                }
            }
            const from = req.query.get("from");
            const to = req.query.get("to");
            const parameters = [
                { name: "@userId", value: userId },
                { name: "@assetId", value: assetId }
            ];
            let queryText = "SELECT * FROM c WHERE c.userId = @userId AND c.assetId = @assetId";
            if (from) {
                queryText += " AND c.recordedAt >= @from";
                parameters.push({ name: "@from", value: from });
            }
            if (to) {
                queryText += " AND c.recordedAt <= @to";
                parameters.push({ name: "@to", value: to });
            }
            queryText += " ORDER BY c.recordedAt ASC";
            try {
                const { resources } = await container.items
                    .query({ query: queryText, parameters }, { partitionKey })
                    .fetchAll();
                return (0, responses_1.ok)(resources);
            }
            catch (error) {
                context.log(error);
                return (0, responses_1.fail)("SERVER_ERROR", "Failed to list asset history", 500);
            }
        }
        case "POST": {
            if (!assetId) {
                return (0, responses_1.fail)("VALIDATION_ERROR", "Missing assetId", 400);
            }
            let body;
            try {
                body = (await req.json());
            }
            catch {
                return (0, responses_1.fail)("INVALID_JSON", "Invalid JSON body", 400);
            }
            try {
                const historyItem = {
                    id: (0, crypto_1.randomUUID)(),
                    userId,
                    assetId,
                    type: "AssetHistory",
                    value: (0, validators_1.ensureNumber)(body.value, "value"),
                    quantity: (0, validators_1.ensureOptionalNumber)(body.quantity, "quantity") ?? null,
                    recordedAt: (0, validators_1.ensureOptionalString)(body.recordedAt, "recordedAt") ?? new Date().toISOString(),
                    note: (0, validators_1.ensureOptionalString)(body.note, "note") ?? "",
                    createdAt: new Date().toISOString()
                };
                const { resource } = await container.items.create(historyItem);
                return (0, responses_1.ok)(resource, 201);
            }
            catch (error) {
                if (error instanceof Error && error.message.startsWith("Invalid")) {
                    return (0, responses_1.fail)("VALIDATION_ERROR", error.message, 400);
                }
                context.log(error);
                return (0, responses_1.fail)("SERVER_ERROR", "Failed to create history item", 500);
            }
        }
        case "DELETE": {
            if (!assetId || !historyId) {
                return (0, responses_1.fail)("VALIDATION_ERROR", "Missing assetId or historyId", 400);
            }
            try {
                await container.item(historyId, partitionKey).delete();
                return (0, responses_1.ok)({ id: historyId });
            }
            catch (error) {
                const status = error.statusCode;
                if (status === 404) {
                    return (0, responses_1.fail)("NOT_FOUND", "History item not found", 404);
                }
                context.log(error);
                return (0, responses_1.fail)("SERVER_ERROR", "Failed to delete history item", 500);
            }
        }
        default:
            context.log(`Unsupported method: ${req.method}`);
            return (0, responses_1.fail)("METHOD_NOT_ALLOWED", "Method not allowed", 405);
    }
}
