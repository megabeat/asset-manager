"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiMessagesHandler = aiMessagesHandler;
const crypto_1 = require("crypto");
const auth_1 = require("../shared/auth");
const context_builder_1 = require("../shared/context-builder");
const cosmosClient_1 = require("../shared/cosmosClient");
const openai_1 = require("../shared/openai");
const responses_1 = require("../shared/responses");
const validators_1 = require("../shared/validators");
async function aiMessagesHandler(req, context) {
    const { userId } = (0, auth_1.getAuthContext)(req.headers);
    try {
        (0, validators_1.requireUserId)(userId);
    }
    catch {
        return (0, responses_1.fail)("UNAUTHORIZED", "Authentication required", 401);
    }
    const conversationId = req.params.conversationId;
    if (!conversationId) {
        return (0, responses_1.fail)("VALIDATION_ERROR", "Missing conversationId", 400);
    }
    const messagesContainer = (0, cosmosClient_1.getContainer)("aiMessages");
    const conversationsContainer = (0, cosmosClient_1.getContainer)("aiConversations");
    const partitionKey = [userId, conversationId];
    switch (req.method.toUpperCase()) {
        case "GET": {
            try {
                const query = {
                    query: "SELECT * FROM c WHERE c.userId = @userId AND c.conversationId = @conversationId AND c.type = 'AiMessage' ORDER BY c.createdAt ASC",
                    parameters: [
                        { name: "@userId", value: userId },
                        { name: "@conversationId", value: conversationId }
                    ]
                };
                const { resources } = await messagesContainer.items
                    .query(query, { partitionKey })
                    .fetchAll();
                return (0, responses_1.ok)(resources);
            }
            catch (error) {
                context.log(error);
                return (0, responses_1.fail)("SERVER_ERROR", "Failed to list messages", 500);
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
            let content;
            try {
                content = (0, validators_1.ensureString)(body.message, "message");
            }
            catch (error) {
                return (0, responses_1.fail)("VALIDATION_ERROR", error.message, 400);
            }
            try {
                const { resource: conversation } = await conversationsContainer
                    .item(conversationId, userId)
                    .read();
                if (!conversation) {
                    return (0, responses_1.fail)("NOT_FOUND", "Conversation not found", 404);
                }
                const now = new Date().toISOString();
                const userMessage = {
                    id: (0, crypto_1.randomUUID)(),
                    userId,
                    conversationId,
                    type: "AiMessage",
                    role: "user",
                    content,
                    createdAt: now
                };
                await messagesContainer.items.create(userMessage);
                // Fetch user context
                const assetsContainer = (0, cosmosClient_1.getContainer)("assets");
                const liabilitiesContainer = (0, cosmosClient_1.getContainer)("liabilities");
                const expensesContainer = (0, cosmosClient_1.getContainer)("expenses");
                const incomesContainer = (0, cosmosClient_1.getContainer)("incomes");
                const userContext = await (0, context_builder_1.buildUserContext)(userId, assetsContainer, liabilitiesContainer, expensesContainer, incomesContainer);
                // Build system prompt with context
                const systemPrompt = `당신은 개인 자산관리 전문 AI 상담사입니다. 사용자의 재무 상황을 분석하고 실용적인 조언을 제공하세요.

현재 사용자 재무 상황:
- 총 자산: ${userContext.totalAssets.toLocaleString()}원
- 총 부채: ${userContext.totalLiabilities.toLocaleString()}원
- 순자산: ${userContext.netWorth.toLocaleString()}원
- 월 고정지출: ${userContext.monthlyExpenses.toLocaleString()}원
- 월 수입: ${userContext.monthlyIncome.toLocaleString()}원

자산 구성:
${userContext.assetBreakdown.map((a) => `- ${a.category}: ${a.value.toLocaleString()}원`).join("\n")}

주요 지출:
${userContext.topExpenses.map((e) => `- ${e.name}: ${e.amount.toLocaleString()}원`).join("\n")}

사용자 질문에 대해 구체적이고 실용적인 조언을 한국어로 제공하세요.`;
                // Fetch conversation history
                const historyQuery = await messagesContainer.items
                    .query({
                    query: "SELECT TOP 10 c.role, c.content FROM c WHERE c.userId = @userId AND c.conversationId = @conversationId AND c.type = 'AiMessage' ORDER BY c.createdAt DESC",
                    parameters: [
                        { name: "@userId", value: userId },
                        { name: "@conversationId", value: conversationId }
                    ]
                }, { partitionKey })
                    .fetchAll();
                const history = historyQuery.resources.reverse();
                // Call Azure OpenAI
                let assistantContent = "죄송합니다. 현재 AI 서비스를 이용할 수 없습니다.";
                try {
                    const client = (0, openai_1.getOpenAIClient)();
                    const deploymentName = (0, openai_1.getDeploymentName)();
                    const messages = [
                        { role: "system", content: systemPrompt },
                        ...history.map((h) => ({ role: h.role, content: h.content })),
                        { role: "user", content }
                    ];
                    const completion = await client.getChatCompletions(deploymentName, messages, {
                        maxTokens: 800,
                        temperature: 0.7
                    });
                    assistantContent = completion.choices[0]?.message?.content ?? assistantContent;
                }
                catch (aiError) {
                    context.log("OpenAI error:", aiError);
                    assistantContent = "AI 응답 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
                }
                const assistantMessage = {
                    id: (0, crypto_1.randomUUID)(),
                    userId,
                    conversationId,
                    type: "AiMessage",
                    role: "assistant",
                    content: assistantContent,
                    createdAt: new Date().toISOString()
                };
                await messagesContainer.items.create(assistantMessage);
                return (0, responses_1.ok)({ userMessage, assistantMessage }, 201);
            }
            catch (error) {
                context.log(error);
                return (0, responses_1.fail)("SERVER_ERROR", "Failed to create message", 500);
            }
        }
        default:
            context.log(`Unsupported method: ${req.method}`);
            return (0, responses_1.fail)("METHOD_NOT_ALLOWED", "Method not allowed", 405);
    }
}
