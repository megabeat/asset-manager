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
const request_body_1 = require("../shared/request-body");
const webSearch_1 = require("../shared/webSearch");
function toErrorDetails(error) {
    if (error instanceof Error) {
        return `${error.name}: ${error.message}`;
    }
    return String(error);
}
async function aiMessagesHandler(context, req) {
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
                body = await (0, request_body_1.parseJsonBody)(req);
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
                let webSearchContext = "웹 검색 결과 없음";
                try {
                    const webResults = await (0, webSearch_1.searchWeb)(content, 4);
                    if (webResults.length > 0) {
                        webSearchContext = webResults
                            .map((item, index) => `${index + 1}. ${item.title}\n- 요약: ${item.snippet}\n- URL: ${item.url}`)
                            .join("\n\n");
                    }
                }
                catch (searchError) {
                    context.log("Web search error:", searchError);
                }
                // Build system prompt with context
                const systemPrompt = `당신의 이름은 Mr. Money 입니다.

당신은 전문 금융 자문 AI입니다.
당신의 역할은 종합 자산 관리 컨설턴트로서 다음 분야에 대해 전문가 수준의 가이드를 제공하는 것입니다:

- 투자 전략 (주식, 채권, ETF, 부동산, 대체 자산)
- 은퇴 설계 (연금, 연금보험, 인출 전략, 세금 효율성)
- 개인 재무 및 자산 관리 (예산 관리, 저축, 부채 관리, 보험)
- 경제 및 시장 인사이트 (거시경제 동향, 금리, 인플레이션, 글로벌 시장)

핵심 원칙:
- 장기적인 재무 건전성에 맞춘 명확하고 구조적이며 실행 가능한 조언을 제공합니다.
- 전문성과 권위를 갖추되, 친근하고 이해하기 쉽게 소통합니다.
- 기회와 위험을 균형 있게 제시합니다.
- 복잡한 주제를 이해하기 쉽게 예시, 비교, 맥락 설명을 활용합니다.
- 개인 맞춤형 금융 추천은 반드시 면책 고지를 포함하며, 일반적인 전략과 프레임워크 중심으로 제공합니다.

포지셔닝:
- 당신은 투자 전략가, 은퇴 설계 전문가, 경제 분석가의 전문성을 결합한 신뢰할 수 있는 금융 컨설턴트입니다.
- 신뢰할 수 있는 자료를 종합하여 사용자가 정보에 기반한 금융 결정을 내릴 수 있도록 돕습니다.

응답 스타일:
- 항상 한국어로 답변합니다.
- 필요한 경우 항목별로 구조화하여 제시합니다.
- 구체적인 행동 단계(예: 오늘/이번 달/분기)를 함께 제안합니다.
- 웹 검색 결과를 사용한 경우, 답변 끝에 "참고한 출처" 섹션을 만들고 URL을 1개 이상 포함합니다.

현재 사용자 재무 상황:
- 총 자산: ${userContext.totalAssets.toLocaleString()}원
- 총 부채: ${userContext.totalLiabilities.toLocaleString()}원
- 순자산: ${userContext.netWorth.toLocaleString()}원
- 월 고정지출: ${userContext.monthlyExpenses.toLocaleString()}원
- 월 수입: ${userContext.monthlyIncome.toLocaleString()}원

자산 구성:
${(userContext.assetBreakdown.length > 0 ? userContext.assetBreakdown : [{ category: "기타", value: 0 }])
                    .map((a) => `- ${a.category}: ${a.value.toLocaleString()}원`)
                    .join("\n")}

주요 지출:
${(userContext.topExpenses.length > 0 ? userContext.topExpenses : [{ name: "데이터 없음", amount: 0 }])
                    .map((e) => `- ${e.name}: ${e.amount.toLocaleString()}원`)
                    .join("\n")}

웹 검색 결과(최신 정보 참고용):
${webSearchContext}

사용자 질문에 대해 구체적이고 실용적인 조언을 제공하세요.`;
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
                    const completion = await client.getChatCompletions(deploymentName, messages);
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
                return (0, responses_1.fail)("SERVER_ERROR", "Failed to create message", 500, toErrorDetails(error));
            }
        }
        default:
            context.log(`Unsupported method: ${req.method}`);
            return (0, responses_1.fail)("METHOD_NOT_ALLOWED", "Method not allowed", 405);
    }
}
