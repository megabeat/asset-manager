"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiConversationsHandler = aiConversationsHandler;
const crypto_1 = require("crypto");
const auth_1 = require("../shared/auth");
const cosmosClient_1 = require("../shared/cosmosClient");
const responses_1 = require("../shared/responses");
const validators_1 = require("../shared/validators");
const request_body_1 = require("../shared/request-body");
async function aiConversationsHandler(context, req) {
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
                body = await (0, request_body_1.parseJsonBody)(req);
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
                const messagesContainer = (0, cosmosClient_1.getContainer)("aiMessages");
                const greetingMessage = {
                    id: (0, crypto_1.randomUUID)(),
                    userId,
                    conversationId: conversation.id,
                    type: "AiMessage",
                    role: "assistant",
                    content: "Kevin님, 안녕하세요! 저는 Mr. Money입니다. 현재 자산/지출 데이터를 바탕으로 실행 가능한 전략을 같이 정리해드릴게요. 우선 가장 고민되는 목표(예: 투자 비중, 은퇴 준비, 현금흐름 개선)를 한 가지만 알려주세요.",
                    createdAt: now
                };
                await messagesContainer.items.create(greetingMessage);
                const listQuery = {
                    query: "SELECT c.id, c.createdAt FROM c WHERE c.userId = @userId AND c.type = 'AiConversation' ORDER BY c.createdAt ASC",
                    parameters: [{ name: "@userId", value: userId }]
                };
                const { resources: allConversations } = await container.items.query(listQuery).fetchAll();
                const maxConversations = 8;
                const overflowCount = Math.max(0, allConversations.length - maxConversations);
                if (overflowCount > 0) {
                    const toDelete = allConversations.slice(0, overflowCount);
                    for (const oldConversation of toDelete) {
                        const oldConversationId = oldConversation.id;
                        if (!oldConversationId || oldConversationId === conversation.id) {
                            continue;
                        }
                        const messagesQuery = {
                            query: "SELECT c.id FROM c WHERE c.userId = @userId AND c.conversationId = @conversationId AND c.type = 'AiMessage'",
                            parameters: [
                                { name: "@userId", value: userId },
                                { name: "@conversationId", value: oldConversationId }
                            ]
                        };
                        const oldPartitionKey = [userId, oldConversationId];
                        const { resources: oldMessages } = await messagesContainer.items
                            .query(messagesQuery, { partitionKey: oldPartitionKey })
                            .fetchAll();
                        for (const message of oldMessages) {
                            if (!message.id) {
                                continue;
                            }
                            await messagesContainer.item(message.id, oldPartitionKey).delete();
                        }
                        await container.item(oldConversationId, userId).delete();
                    }
                }
                return (0, responses_1.ok)({
                    ...(resource ?? {}),
                    greetingMessage
                }, 201);
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
