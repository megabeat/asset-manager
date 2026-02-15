"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assetsHandler = assetsHandler;
const crypto_1 = require("crypto");
const auth_1 = require("../shared/auth");
const cosmosClient_1 = require("../shared/cosmosClient");
const responses_1 = require("../shared/responses");
const validators_1 = require("../shared/validators");
const request_body_1 = require("../shared/request-body");
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
async function assetsHandler(context, req) {
    const { userId } = (0, auth_1.getAuthContext)(req.headers);
    try {
        (0, validators_1.requireUserId)(userId);
    }
    catch {
        return (0, responses_1.fail)("UNAUTHORIZED", "Authentication required", 401);
    }
    let container;
    try {
        container = (0, cosmosClient_1.getContainer)("assets");
    }
    catch (error) {
        context.log(error);
        return (0, responses_1.fail)("SERVER_ERROR", "Cosmos DB configuration error", 500);
    }
    const assetId = req.params.assetId;
    switch (req.method.toUpperCase()) {
        case "GET": {
            if (assetId) {
                try {
                    const { resource } = await container.item(assetId, userId).read();
                    if (!resource) {
                        return (0, responses_1.fail)("NOT_FOUND", "Asset not found", 404);
                    }
                    return (0, responses_1.ok)(resource);
                }
                catch (error) {
                    const status = error.statusCode;
                    if (status === 404) {
                        return (0, responses_1.fail)("NOT_FOUND", "Asset not found", 404);
                    }
                    context.log(error);
                    return (0, responses_1.fail)("SERVER_ERROR", "Failed to fetch asset", 500);
                }
            }
            try {
                const category = getQueryValue(req, "category");
                const query = category
                    ? {
                        query: "SELECT * FROM c WHERE c.userId = @userId AND c.type = 'Asset' AND c.category = @category",
                        parameters: [
                            { name: "@userId", value: userId },
                            { name: "@category", value: category }
                        ]
                    }
                    : {
                        query: "SELECT * FROM c WHERE c.userId = @userId AND c.type = 'Asset'",
                        parameters: [{ name: "@userId", value: userId }]
                    };
                const { resources } = await container.items.query(query).fetchAll();
                return (0, responses_1.ok)(resources);
            }
            catch (error) {
                context.log(error);
                return (0, responses_1.fail)("SERVER_ERROR", "Failed to list assets", 500);
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
                const asset = {
                    id: (0, crypto_1.randomUUID)(),
                    userId,
                    type: "Asset",
                    category: (0, validators_1.ensureString)(body.category, "category"),
                    name: (0, validators_1.ensureString)(body.name, "name"),
                    currentValue: (0, validators_1.ensureNumber)(body.currentValue, "currentValue"),
                    acquiredValue: (0, validators_1.ensureOptionalNumber)(body.acquiredValue, "acquiredValue") ?? null,
                    quantity: (0, validators_1.ensureOptionalNumber)(body.quantity, "quantity") ?? null,
                    valuationDate: (0, validators_1.ensureString)(body.valuationDate, "valuationDate"),
                    symbol: (0, validators_1.ensureOptionalString)(body.symbol, "symbol") ?? "",
                    exchangeRate: (0, validators_1.ensureOptionalNumber)(body.exchangeRate, "exchangeRate") ?? null,
                    usdAmount: (0, validators_1.ensureOptionalNumber)(body.usdAmount, "usdAmount") ?? null,
                    pensionMonthlyContribution: (0, validators_1.ensureOptionalNumber)(body.pensionMonthlyContribution, "pensionMonthlyContribution") ?? null,
                    pensionReceiveStart: (0, validators_1.ensureOptionalString)(body.pensionReceiveStart, "pensionReceiveStart") ?? "",
                    pensionReceiveAge: (0, validators_1.ensureOptionalNumber)(body.pensionReceiveAge, "pensionReceiveAge") ?? null,
                    exchange: (0, validators_1.ensureOptionalString)(body.exchange, "exchange") ?? "",
                    priceSource: (0, validators_1.ensureOptionalString)(body.priceSource, "priceSource") ?? "",
                    autoUpdate: (0, validators_1.ensureOptionalBoolean)(body.autoUpdate, "autoUpdate") ?? false,
                    note: (0, validators_1.ensureOptionalString)(body.note, "note") ?? "",
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                const { resource } = await container.items.create(asset);
                return (0, responses_1.ok)(resource, 201);
            }
            catch (error) {
                if (error instanceof Error && error.message.startsWith("Invalid")) {
                    return (0, responses_1.fail)("VALIDATION_ERROR", error.message, 400);
                }
                context.log(error);
                return (0, responses_1.fail)("SERVER_ERROR", "Failed to create asset", 500);
            }
        }
        case "PUT": {
            if (!assetId) {
                return (0, responses_1.fail)("VALIDATION_ERROR", "Missing assetId", 400);
            }
            let body;
            try {
                body = await (0, request_body_1.parseJsonBody)(req);
            }
            catch {
                return (0, responses_1.fail)("INVALID_JSON", "Invalid JSON body", 400);
            }
            try {
                const { resource } = await container.item(assetId, userId).read();
                if (!resource) {
                    return (0, responses_1.fail)("NOT_FOUND", "Asset not found", 404);
                }
                const updated = {
                    ...resource,
                    category: (0, validators_1.ensureOptionalString)(body.category, "category") ?? resource.category,
                    name: (0, validators_1.ensureOptionalString)(body.name, "name") ?? resource.name,
                    currentValue: (0, validators_1.ensureOptionalNumber)(body.currentValue, "currentValue") ?? resource.currentValue,
                    acquiredValue: (0, validators_1.ensureOptionalNumber)(body.acquiredValue, "acquiredValue") ?? resource.acquiredValue,
                    quantity: (0, validators_1.ensureOptionalNumber)(body.quantity, "quantity") ?? resource.quantity,
                    valuationDate: (0, validators_1.ensureOptionalString)(body.valuationDate, "valuationDate") ?? resource.valuationDate,
                    symbol: (0, validators_1.ensureOptionalString)(body.symbol, "symbol") ?? resource.symbol,
                    exchangeRate: (0, validators_1.ensureOptionalNumber)(body.exchangeRate, "exchangeRate") ?? resource.exchangeRate,
                    usdAmount: (0, validators_1.ensureOptionalNumber)(body.usdAmount, "usdAmount") ?? resource.usdAmount,
                    pensionMonthlyContribution: (0, validators_1.ensureOptionalNumber)(body.pensionMonthlyContribution, "pensionMonthlyContribution") ??
                        resource.pensionMonthlyContribution,
                    pensionReceiveStart: (0, validators_1.ensureOptionalString)(body.pensionReceiveStart, "pensionReceiveStart") ??
                        resource.pensionReceiveStart,
                    pensionReceiveAge: (0, validators_1.ensureOptionalNumber)(body.pensionReceiveAge, "pensionReceiveAge") ?? resource.pensionReceiveAge,
                    exchange: (0, validators_1.ensureOptionalString)(body.exchange, "exchange") ?? resource.exchange,
                    priceSource: (0, validators_1.ensureOptionalString)(body.priceSource, "priceSource") ?? resource.priceSource,
                    autoUpdate: (0, validators_1.ensureOptionalBoolean)(body.autoUpdate, "autoUpdate") ?? resource.autoUpdate,
                    note: (0, validators_1.ensureOptionalString)(body.note, "note") ?? resource.note,
                    updatedAt: new Date().toISOString()
                };
                const { resource: saved } = await container.item(assetId, userId).replace(updated);
                return (0, responses_1.ok)(saved);
            }
            catch (error) {
                const status = error.statusCode;
                if (status === 404) {
                    return (0, responses_1.fail)("NOT_FOUND", "Asset not found", 404);
                }
                if (error instanceof Error && error.message.startsWith("Invalid")) {
                    return (0, responses_1.fail)("VALIDATION_ERROR", error.message, 400);
                }
                context.log(error);
                return (0, responses_1.fail)("SERVER_ERROR", "Failed to update asset", 500);
            }
        }
        case "DELETE": {
            if (!assetId) {
                return (0, responses_1.fail)("VALIDATION_ERROR", "Missing assetId", 400);
            }
            try {
                await container.item(assetId, userId).delete();
                return (0, responses_1.ok)({ id: assetId });
            }
            catch (error) {
                const status = error.statusCode;
                if (status === 404) {
                    return (0, responses_1.fail)("NOT_FOUND", "Asset not found", 404);
                }
                context.log(error);
                return (0, responses_1.fail)("SERVER_ERROR", "Failed to delete asset", 500);
            }
        }
        default:
            context.log(`Unsupported method: ${req.method}`);
            return (0, responses_1.fail)("METHOD_NOT_ALLOWED", "Method not allowed", 405);
    }
}
