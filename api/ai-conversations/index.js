"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiConversationsHandler = aiConversationsHandler;
const crypto_1 = require("crypto");
const auth_1 = require("../shared/auth");
const cosmosClient_1 = require("../shared/cosmosClient");
const responses_1 = require("../shared/responses");
const validators_1 = require("../shared/validators");
async function aiConversationsHandler(req, context) {
    const { userId } = (0, auth_1.getAuthContext)(req.headers);
    try {
        (0, validators_1.requireUserId)(userId);
    }
    catch {
        return (0, responses_1.fail)("UNAUTHORIZED", "Authentication required", 401);
    }
    let container;
    try {
        container = (0, cosmosClient_1.getContainer)("aiConversations");
    }
    catch (error) {
        context.log(error);
        return (0, responses_1.fail)("SERVER_ERROR", "Cosmos DB configuration error", 500);
    }
    const conversationId = req.params.conversationId;
    switch (req.method.toUpperCase()) {
        case "GET": {
            if (conversationId) {
                try {
                    const { resource } = await container.item(conversationId, userId).read();
                    if (!resource) {
                        return (0, responses_1.fail)("NOT_FOUND", "Conversation not found", 404);
                    }
                    return (0, responses_1.ok)(resource);
                }
                catch (error) {
                    const status = error.statusCode;
                    if (status === 404) {
                        return (0, responses_1.fail)("NOT_FOUND", "Conversation not found", 404);
                    }
                    context.log(error);
                    return (0, responses_1.fail)("SERVER_ERROR", "Failed to fetch conversation", 500);
                }
            }
            try {
                const query = {
                    query: "SELECT * FROM c WHERE c.userId = @userId AND c.type = 'AiConversation'",
                    parameters: [{ name: "@userId", value: userId }]
                };
                const { resources } = await container.items.query(query).fetchAll();
                return (0, responses_1.ok)(resources);
            }
            catch (error) {
                context.log(error);
                return (0, responses_1.fail)("SERVER_ERROR", "Failed to list conversations", 500);
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
                const now = new Date().toISOString();
                const conversation = {
                    id: (0, crypto_1.randomUUID)(),
                    userId,
                    type: "AiConversation",
                    title: (0, validators_1.ensureOptionalString)(body.title, "title") ?? "",
                    createdAt: now,
                    updatedAt: now
                };
                const { resource } = await container.items.create(conversation);
                return (0, responses_1.ok)(resource, 201);
            }
            catch (error) {
                if (error instanceof Error && error.message.startsWith("Invalid")) {
                    return (0, responses_1.fail)("VALIDATION_ERROR", error.message, 400);
                }
                context.log(error);
                return (0, responses_1.fail)("SERVER_ERROR", "Failed to create conversation", 500);
            }
        }
        default:
            context.log(`Unsupported method: ${req.method}`);
            return (0, responses_1.fail)("METHOD_NOT_ALLOWED", "Method not allowed", 405);
    }
}
