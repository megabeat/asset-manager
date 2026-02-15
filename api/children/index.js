"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.childrenHandler = childrenHandler;
const crypto_1 = require("crypto");
const auth_1 = require("../shared/auth");
const cosmosClient_1 = require("../shared/cosmosClient");
const responses_1 = require("../shared/responses");
const validators_1 = require("../shared/validators");
async function childrenHandler(context, req) {
    const { userId } = (0, auth_1.getAuthContext)(req.headers);
    try {
        (0, validators_1.requireUserId)(userId);
    }
    catch {
        return (0, responses_1.fail)("UNAUTHORIZED", "Authentication required", 401);
    }
    const container = (0, cosmosClient_1.getContainer)("children");
    const childId = req.params.childId;
    switch (req.method.toUpperCase()) {
        case "GET": {
            if (childId) {
                try {
                    const { resource } = await container.item(childId, userId).read();
                    if (!resource) {
                        return (0, responses_1.fail)("NOT_FOUND", "Child not found", 404);
                    }
                    return (0, responses_1.ok)(resource);
                }
                catch (error) {
                    const status = error.statusCode;
                    if (status === 404) {
                        return (0, responses_1.fail)("NOT_FOUND", "Child not found", 404);
                    }
                    context.log(error);
                    return (0, responses_1.fail)("SERVER_ERROR", "Failed to fetch child", 500);
                }
            }
            try {
                const query = {
                    query: "SELECT * FROM c WHERE c.userId = @userId AND c.type = 'Child'",
                    parameters: [{ name: "@userId", value: userId }]
                };
                const { resources } = await container.items.query(query).fetchAll();
                return (0, responses_1.ok)(resources);
            }
            catch (error) {
                context.log(error);
                return (0, responses_1.fail)("SERVER_ERROR", "Failed to list children", 500);
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
                const child = {
                    id: (0, crypto_1.randomUUID)(),
                    userId,
                    type: "Child",
                    name: (0, validators_1.ensureString)(body.name, "name"),
                    birthYear: (0, validators_1.ensureNumber)(body.birthYear, "birthYear"),
                    grade: (0, validators_1.ensureString)(body.grade, "grade"),
                    targetUniversityYear: (0, validators_1.ensureNumber)(body.targetUniversityYear, "targetUniversityYear"),
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                const { resource } = await container.items.create(child);
                return (0, responses_1.ok)(resource, 201);
            }
            catch (error) {
                if (error instanceof Error && error.message.startsWith("Invalid")) {
                    return (0, responses_1.fail)("VALIDATION_ERROR", error.message, 400);
                }
                context.log(error);
                return (0, responses_1.fail)("SERVER_ERROR", "Failed to create child", 500);
            }
        }
        case "PUT": {
            if (!childId) {
                return (0, responses_1.fail)("VALIDATION_ERROR", "Missing childId", 400);
            }
            let body;
            try {
                body = (await req.json());
            }
            catch {
                return (0, responses_1.fail)("INVALID_JSON", "Invalid JSON body", 400);
            }
            try {
                const { resource } = await container.item(childId, userId).read();
                if (!resource) {
                    return (0, responses_1.fail)("NOT_FOUND", "Child not found", 404);
                }
                const updated = {
                    ...resource,
                    name: (0, validators_1.ensureOptionalString)(body.name, "name") ?? resource.name,
                    birthYear: (0, validators_1.ensureOptionalNumber)(body.birthYear, "birthYear") ?? resource.birthYear,
                    grade: (0, validators_1.ensureOptionalString)(body.grade, "grade") ?? resource.grade,
                    targetUniversityYear: (0, validators_1.ensureOptionalNumber)(body.targetUniversityYear, "targetUniversityYear") ??
                        resource.targetUniversityYear,
                    updatedAt: new Date().toISOString()
                };
                const { resource: saved } = await container.item(childId, userId).replace(updated);
                return (0, responses_1.ok)(saved);
            }
            catch (error) {
                const status = error.statusCode;
                if (status === 404) {
                    return (0, responses_1.fail)("NOT_FOUND", "Child not found", 404);
                }
                if (error instanceof Error && error.message.startsWith("Invalid")) {
                    return (0, responses_1.fail)("VALIDATION_ERROR", error.message, 400);
                }
                context.log(error);
                return (0, responses_1.fail)("SERVER_ERROR", "Failed to update child", 500);
            }
        }
        case "DELETE": {
            if (!childId) {
                return (0, responses_1.fail)("VALIDATION_ERROR", "Missing childId", 400);
            }
            try {
                await container.item(childId, userId).delete();
                return (0, responses_1.ok)({ id: childId });
            }
            catch (error) {
                const status = error.statusCode;
                if (status === 404) {
                    return (0, responses_1.fail)("NOT_FOUND", "Child not found", 404);
                }
                context.log(error);
                return (0, responses_1.fail)("SERVER_ERROR", "Failed to delete child", 500);
            }
        }
        default:
            context.log(`Unsupported method: ${req.method}`);
            return (0, responses_1.fail)("METHOD_NOT_ALLOWED", "Method not allowed", 405);
    }
}
