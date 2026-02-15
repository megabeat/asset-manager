"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.profileHandler = profileHandler;
const auth_1 = require("../shared/auth");
const cosmosClient_1 = require("../shared/cosmosClient");
const responses_1 = require("../shared/responses");
const validators_1 = require("../shared/validators");
async function profileHandler(req, context) {
    const { userId } = (0, auth_1.getAuthContext)(req.headers);
    try {
        (0, validators_1.requireUserId)(userId);
    }
    catch {
        return (0, responses_1.fail)("UNAUTHORIZED", "Authentication required", 401);
    }
    const container = (0, cosmosClient_1.getContainer)("users");
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
                body = (await req.json());
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
                    householdSize: (0, validators_1.ensureNumber)(body.householdSize, "householdSize"),
                    currency: (0, validators_1.ensureString)(body.currency, "currency"),
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                const { resource } = await container.items.create(profile);
                return (0, responses_1.ok)(resource, 201);
            }
            catch (error) {
                const status = error.statusCode;
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
                body = (await req.json());
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
                    householdSize: (0, validators_1.ensureOptionalNumber)(body.householdSize, "householdSize") ?? resource.householdSize,
                    currency: (0, validators_1.ensureOptionalString)(body.currency, "currency") ?? resource.currency,
                    updatedAt: new Date().toISOString()
                };
                const { resource: saved } = await container.item(userId, userId).replace(updated);
                return (0, responses_1.ok)(saved);
            }
            catch (error) {
                const status = error.statusCode;
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
