"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.profileHandler = profileHandler;
const auth_1 = require("../shared/auth");
const cosmosClient_1 = require("../shared/cosmosClient");
const responses_1 = require("../shared/responses");
const validators_1 = require("../shared/validators");
const request_body_1 = require("../shared/request-body");
function getStatusCode(error) {
    const candidate = error;
    const raw = candidate.statusCode ?? candidate.code;
    if (typeof raw === "number")
        return raw;
    if (typeof raw === "string") {
        const parsed = Number(raw);
        return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
}
async function profileHandler(context, req) {
    const { userId } = (0, auth_1.getAuthContext)(req.headers);
    try {
        (0, validators_1.requireUserId)(userId);
    }
    catch {
        return (0, responses_1.fail)("UNAUTHORIZED", "Authentication required", 401);
    }
    let container;
    try {
        container = (0, cosmosClient_1.getContainer)("users");
    }
    catch (error) {
        context.log(error);
        return (0, responses_1.fail)("SERVER_ERROR", "Cosmos DB configuration error", 500);
    }
    switch (req.method.toUpperCase()) {
        case "GET": {
            try {
                const { resource } = await container.item(userId, userId).read();
                if (!resource) {
                    return (0, responses_1.fail)("NOT_FOUND", "Profile not found", 404);
                }
                return (0, responses_1.ok)(resource);
            }
            catch (error) {
                const status = error.statusCode;
                if (status === 404) {
                    return (0, responses_1.fail)("NOT_FOUND", "Profile not found", 404);
                }
                context.log(error);
                return (0, responses_1.fail)("SERVER_ERROR", "Failed to fetch profile", 500);
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
                const profile = {
                    id: userId,
                    userId,
                    type: "Profile",
                    fullName: (0, validators_1.ensureString)(body.fullName, "fullName"),
                    birthDate: (0, validators_1.ensureString)(body.birthDate, "birthDate"),
                    child1Name: (0, validators_1.ensureOptionalString)(body.child1Name, "child1Name"),
                    child1BirthDate: (0, validators_1.ensureOptionalString)(body.child1BirthDate, "child1BirthDate"),
                    child2Name: (0, validators_1.ensureOptionalString)(body.child2Name, "child2Name"),
                    child2BirthDate: (0, validators_1.ensureOptionalString)(body.child2BirthDate, "child2BirthDate"),
                    retirementTargetAge: (0, validators_1.ensureOptionalNumberInRange)(body.retirementTargetAge, "retirementTargetAge", 45, 90),
                    householdSize: (0, validators_1.ensureNumber)(body.householdSize, "householdSize"),
                    currency: (0, validators_1.ensureString)(body.currency, "currency"),
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                const { resource } = await container.items.create(profile);
                return (0, responses_1.ok)(resource, 201);
            }
            catch (error) {
                const status = getStatusCode(error);
                if (status === 409) {
                    return (0, responses_1.fail)("CONFLICT", "Profile already exists", 409);
                }
                if (error instanceof Error && error.message.startsWith("Invalid")) {
                    return (0, responses_1.fail)("VALIDATION_ERROR", error.message, 400);
                }
                context.log(error);
                return (0, responses_1.fail)("SERVER_ERROR", "Failed to create profile", 500);
            }
        }
        case "PUT": {
            let body;
            try {
                body = await (0, request_body_1.parseJsonBody)(req);
            }
            catch {
                return (0, responses_1.fail)("INVALID_JSON", "Invalid JSON body", 400);
            }
            try {
                const { resource } = await container.item(userId, userId).read();
                if (!resource) {
                    return (0, responses_1.fail)("NOT_FOUND", "Profile not found", 404);
                }
                const updated = {
                    ...resource,
                    fullName: (0, validators_1.ensureOptionalString)(body.fullName, "fullName") ?? resource.fullName,
                    birthDate: (0, validators_1.ensureOptionalString)(body.birthDate, "birthDate") ?? resource.birthDate,
                    child1Name: (0, validators_1.ensureOptionalString)(body.child1Name, "child1Name") ?? resource.child1Name,
                    child1BirthDate: (0, validators_1.ensureOptionalString)(body.child1BirthDate, "child1BirthDate") ?? resource.child1BirthDate,
                    child2Name: (0, validators_1.ensureOptionalString)(body.child2Name, "child2Name") ?? resource.child2Name,
                    child2BirthDate: (0, validators_1.ensureOptionalString)(body.child2BirthDate, "child2BirthDate") ?? resource.child2BirthDate,
                    retirementTargetAge: (0, validators_1.ensureOptionalNumberInRange)(body.retirementTargetAge, "retirementTargetAge", 45, 90) ??
                        resource.retirementTargetAge,
                    householdSize: (0, validators_1.ensureOptionalNumber)(body.householdSize, "householdSize") ?? resource.householdSize,
                    currency: (0, validators_1.ensureOptionalString)(body.currency, "currency") ?? resource.currency,
                    updatedAt: new Date().toISOString()
                };
                const { resource: saved } = await container.item(userId, userId).replace(updated);
                return (0, responses_1.ok)(saved);
            }
            catch (error) {
                const status = getStatusCode(error);
                if (status === 404) {
                    return (0, responses_1.fail)("NOT_FOUND", "Profile not found", 404);
                }
                if (error instanceof Error && error.message.startsWith("Invalid")) {
                    return (0, responses_1.fail)("VALIDATION_ERROR", error.message, 400);
                }
                context.log(error);
                return (0, responses_1.fail)("SERVER_ERROR", "Failed to update profile", 500);
            }
        }
        default:
            context.log(`Unsupported method: ${req.method}`);
            return (0, responses_1.fail)("METHOD_NOT_ALLOWED", "Method not allowed", 405);
    }
}
