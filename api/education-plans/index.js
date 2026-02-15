"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.educationPlansHandler = educationPlansHandler;
const crypto_1 = require("crypto");
const auth_1 = require("../shared/auth");
const cosmosClient_1 = require("../shared/cosmosClient");
const responses_1 = require("../shared/responses");
const validators_1 = require("../shared/validators");
async function educationPlansHandler(req, context) {
    const { userId } = (0, auth_1.getAuthContext)(req.headers);
    try {
        (0, validators_1.requireUserId)(userId);
    }
    catch {
        return (0, responses_1.fail)("UNAUTHORIZED", "Authentication required", 401);
    }
    const action = req.params.action?.toLowerCase();
    const container = (0, cosmosClient_1.getContainer)("educationPlans");
    const planId = req.params.planId;
    switch (req.method.toUpperCase()) {
        case "GET": {
            if (planId) {
                try {
                    const { resource } = await container.item(planId, userId).read();
                    if (!resource) {
                        return (0, responses_1.fail)("NOT_FOUND", "Education plan not found", 404);
                    }
                    return (0, responses_1.ok)(resource);
                }
                catch (error) {
                    const status = error.statusCode;
                    if (status === 404) {
                        return (0, responses_1.fail)("NOT_FOUND", "Education plan not found", 404);
                    }
                    context.log(error);
                    return (0, responses_1.fail)("SERVER_ERROR", "Failed to fetch education plan", 500);
                }
            }
            try {
                const query = {
                    query: "SELECT * FROM c WHERE c.userId = @userId AND c.type = 'EducationPlan'",
                    parameters: [{ name: "@userId", value: userId }]
                };
                const { resources } = await container.items.query(query).fetchAll();
                return (0, responses_1.ok)(resources);
            }
            catch (error) {
                context.log(error);
                return (0, responses_1.fail)("SERVER_ERROR", "Failed to list education plans", 500);
            }
        }
        case "POST": {
            if (action === "simulate") {
                let body;
                try {
                    body = (await req.json());
                }
                catch {
                    return (0, responses_1.fail)("INVALID_JSON", "Invalid JSON body", 400);
                }
                try {
                    const inflationRate = (0, validators_1.ensureNumberInRange)(body.inflationRate, "inflationRate", 0, 1);
                    const startYear = (0, validators_1.ensureNumber)(body.startYear, "startYear");
                    const endYear = (0, validators_1.ensureNumber)(body.endYear, "endYear");
                    const annualCost = (0, validators_1.ensureNumber)(body.annualCost, "annualCost");
                    if (endYear < startYear) {
                        return (0, responses_1.fail)("VALIDATION_ERROR", "endYear must be >= startYear", 400);
                    }
                    const yearly = [];
                    let totalCost = 0;
                    for (let year = startYear; year <= endYear; year += 1) {
                        const yearsFromStart = year - startYear;
                        const cost = Math.round(annualCost * Math.pow(1 + inflationRate, yearsFromStart));
                        yearly.push({ year, cost });
                        totalCost += cost;
                    }
                    return (0, responses_1.ok)({ totalCost, yearly });
                }
                catch (error) {
                    if (error instanceof Error && error.message.startsWith("Invalid")) {
                        return (0, responses_1.fail)("VALIDATION_ERROR", error.message, 400);
                    }
                    context.log(error);
                    return (0, responses_1.fail)("SERVER_ERROR", "Failed to simulate education plan", 500);
                }
            }
            let body;
            try {
                body = (await req.json());
            }
            catch {
                return (0, responses_1.fail)("INVALID_JSON", "Invalid JSON body", 400);
            }
            try {
                const startYear = (0, validators_1.ensureNumber)(body.startYear, "startYear");
                const endYear = (0, validators_1.ensureNumber)(body.endYear, "endYear");
                if (endYear < startYear) {
                    return (0, responses_1.fail)("VALIDATION_ERROR", "endYear must be >= startYear", 400);
                }
                const plan = {
                    id: (0, crypto_1.randomUUID)(),
                    userId,
                    type: "EducationPlan",
                    childId: (0, validators_1.ensureString)(body.childId, "childId"),
                    annualCost: (0, validators_1.ensureNumber)(body.annualCost, "annualCost"),
                    inflationRate: (0, validators_1.ensureNumberInRange)(body.inflationRate, "inflationRate", 0, 1),
                    startYear,
                    endYear,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                const { resource } = await container.items.create(plan);
                return (0, responses_1.ok)(resource, 201);
            }
            catch (error) {
                if (error instanceof Error && error.message.startsWith("Invalid")) {
                    return (0, responses_1.fail)("VALIDATION_ERROR", error.message, 400);
                }
                context.log(error);
                return (0, responses_1.fail)("SERVER_ERROR", "Failed to create education plan", 500);
            }
        }
        case "PUT": {
            if (!planId) {
                return (0, responses_1.fail)("VALIDATION_ERROR", "Missing planId", 400);
            }
            let body;
            try {
                body = (await req.json());
            }
            catch {
                return (0, responses_1.fail)("INVALID_JSON", "Invalid JSON body", 400);
            }
            try {
                const { resource } = await container.item(planId, userId).read();
                if (!resource) {
                    return (0, responses_1.fail)("NOT_FOUND", "Education plan not found", 404);
                }
                const updated = {
                    ...resource,
                    childId: (0, validators_1.ensureOptionalString)(body.childId, "childId") ?? resource.childId,
                    annualCost: (0, validators_1.ensureOptionalNumber)(body.annualCost, "annualCost") ?? resource.annualCost,
                    inflationRate: (0, validators_1.ensureOptionalNumber)(body.inflationRate, "inflationRate") ?? resource.inflationRate,
                    startYear: (0, validators_1.ensureOptionalNumber)(body.startYear, "startYear") ?? resource.startYear,
                    endYear: (0, validators_1.ensureOptionalNumber)(body.endYear, "endYear") ?? resource.endYear,
                    updatedAt: new Date().toISOString()
                };
                if (updated.inflationRate < 0 || updated.inflationRate > 1) {
                    return (0, responses_1.fail)("VALIDATION_ERROR", "Invalid inflationRate", 400);
                }
                if (updated.endYear < updated.startYear) {
                    return (0, responses_1.fail)("VALIDATION_ERROR", "endYear must be >= startYear", 400);
                }
                const { resource: saved } = await container.item(planId, userId).replace(updated);
                return (0, responses_1.ok)(saved);
            }
            catch (error) {
                const status = error.statusCode;
                if (status === 404) {
                    return (0, responses_1.fail)("NOT_FOUND", "Education plan not found", 404);
                }
                if (error instanceof Error && error.message.startsWith("Invalid")) {
                    return (0, responses_1.fail)("VALIDATION_ERROR", error.message, 400);
                }
                context.log(error);
                return (0, responses_1.fail)("SERVER_ERROR", "Failed to update education plan", 500);
            }
        }
        case "DELETE": {
            if (!planId) {
                return (0, responses_1.fail)("VALIDATION_ERROR", "Missing planId", 400);
            }
            try {
                await container.item(planId, userId).delete();
                return (0, responses_1.ok)({ id: planId });
            }
            catch (error) {
                const status = error.statusCode;
                if (status === 404) {
                    return (0, responses_1.fail)("NOT_FOUND", "Education plan not found", 404);
                }
                context.log(error);
                return (0, responses_1.fail)("SERVER_ERROR", "Failed to delete education plan", 500);
            }
        }
        default:
            context.log(`Unsupported method: ${req.method}`);
            return (0, responses_1.fail)("METHOD_NOT_ALLOWED", "Method not allowed", 405);
    }
}
