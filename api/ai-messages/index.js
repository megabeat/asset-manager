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
function getAgeFromBirthDate(birthDate) {
    if (!birthDate)
        return null;
    const birth = new Date(birthDate);
    if (Number.isNaN(birth.getTime()))
        return null;
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    const dayDiff = today.getDate() - birth.getDate();
    if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
        age -= 1;
    }
    return age >= 0 ? age : null;
}
function toErrorDetails(error) {
    if (error instanceof Error) {
        return `${error.name}: ${error.message}`;
    }
    return String(error);
}
function clampText(text, maxChars) {
    if (!text)
        return "";
    if (text.length <= maxChars)
        return text;
    return `${text.slice(0, Math.max(0, maxChars - 3))}...`;
}
function normalizeHistory(rows, maxItems, maxCharsPerItem, maxTotalChars) {
    const trimmed = rows
        .filter((row) => row.role === "user" || row.role === "assistant")
        .slice(-maxItems)
        .map((row) => ({
        role: row.role,
        content: clampText(String(row.content ?? ""), maxCharsPerItem)
    }));
    let total = 0;
    const bounded = [];
    for (let index = trimmed.length - 1; index >= 0; index -= 1) {
        const item = trimmed[index];
        const nextTotal = total + item.content.length;
        if (nextTotal > maxTotalChars) {
            break;
        }
        bounded.push(item);
        total = nextTotal;
    }
    return bounded.reverse();
}
function buildFallbackAdvice(question, userContext, profileContextText, diagnostic) {
    const monthlySurplus = userContext.monthlyIncome - userContext.monthlyExpenses;
    const topAssetCategory = userContext.assetBreakdown.sort((a, b) => b.value - a.value)[0]?.category ?? "미확인";
    const netWorth = userContext.netWorth;
    const lines = [
        "현재 AI 모델 응답이 지연되어, 보유 데이터 기준으로 먼저 핵심 가이드를 드립니다.",
        "",
        "1) 현재 상태 요약",
        `- 순자산: ${netWorth.toLocaleString()}원`,
        `- 월 수입/지출: ${userContext.monthlyIncome.toLocaleString()}원 / ${userContext.monthlyExpenses.toLocaleString()}원`,
        `- 월 잉여자금: ${monthlySurplus.toLocaleString()}원`,
        `- 최대 자산 비중 카테고리: ${topAssetCategory}`,
        "",
        "2) 바로 실행할 액션",
        "- 잉여자금의 최소 20~30%는 비상금(입출금 가능 자산)으로 먼저 확보",
        "- 고정/구독 지출 결제일을 점검해 월초/월말 현금흐름 변동을 완화",
        "- 자산 비중이 한 카테고리에 쏠려 있다면 분산 비중(현금/채권/주식)을 재조정",
        "",
        "3) 다음 질문 추천",
        `- 방금 질문("${clampText(question, 80)}")을 기준으로, 목표 기간(예: 3년/10년)과 위험 성향(보수/중립/공격)을 알려주시면 구체 시나리오로 이어서 제안드릴게요.`,
        "",
        "(참고) 일시적인 AI 응답 지연 상황에서도 상담이 끊기지 않도록 기본 가이드로 우선 응답했습니다."
    ];
    if (profileContextText && profileContextText !== "프로필 정보 없음") {
        lines.splice(8, 0, "", "프로필 반영 메모", "- 설정한 가족/은퇴/소득 정보는 다음 상세 시나리오 계산에 계속 반영됩니다.");
    }
    if (diagnostic) {
        lines.push("", `진단코드: ${clampText(diagnostic, 180)}`);
    }
    return lines.join("\n");
}
function serializeUnknownError(value) {
    try {
        return JSON.stringify(value);
    }
    catch {
        return String(value);
    }
}
function extractObjectMessage(errorObject) {
    const directMessage = errorObject.message;
    if (typeof directMessage === "string" && directMessage.trim().length > 0) {
        return directMessage;
    }
    const nestedError = errorObject.error;
    if (nestedError && typeof nestedError === "object") {
        const nestedMessage = nestedError.message;
        if (typeof nestedMessage === "string" && nestedMessage.trim().length > 0) {
            return nestedMessage;
        }
    }
    const details = errorObject.details;
    if (typeof details === "string" && details.trim().length > 0) {
        return details;
    }
    const name = typeof errorObject.name === "string" ? errorObject.name : "ObjectError";
    const code = errorObject.code ?? "NA";
    return `${name} code=${String(code)} payload=${serializeUnknownError(errorObject)}`;
}
function extractErrorInfo(error) {
    if (!error) {
        return { message: "Unknown error" };
    }
    const errorObject = typeof error === "object" && error !== null ? error : null;
    const statusCode = Number(errorObject?.statusCode ??
        errorObject?.code);
    if (error instanceof Error) {
        return {
            statusCode: Number.isFinite(statusCode) ? statusCode : undefined,
            message: error.message
        };
    }
    if (errorObject) {
        return {
            statusCode: Number.isFinite(statusCode) ? statusCode : undefined,
            message: extractObjectMessage(errorObject)
        };
    }
    return {
        statusCode: Number.isFinite(statusCode) ? statusCode : undefined,
        message: String(error)
    };
}
function compactDiagnosticMessage(message) {
    if (!message)
        return "unknown";
    const sanitized = message
        .replace(/\s+/g, " ")
        .replace(/https?:\/\/\S+/gi, "[url]")
        .trim();
    return clampText(sanitized, 80);
}
async function withTimeout(promise, ms, timeoutMessage) {
    let timeoutId = null;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            reject(new Error(timeoutMessage));
        }, ms);
    });
    try {
        return await Promise.race([promise, timeoutPromise]);
    }
    finally {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
    }
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
                let userContext = {
                    totalAssets: 0,
                    totalLiabilities: 0,
                    netWorth: 0,
                    monthlyExpenses: 0,
                    monthlyIncome: 0,
                    assetBreakdown: [],
                    topExpenses: []
                };
                try {
                    const assetsContainer = (0, cosmosClient_1.getContainer)("assets");
                    const liabilitiesContainer = (0, cosmosClient_1.getContainer)("liabilities");
                    const expensesContainer = (0, cosmosClient_1.getContainer)("expenses");
                    const incomesContainer = (0, cosmosClient_1.getContainer)("incomes");
                    const usersContainer = (0, cosmosClient_1.getContainer)("users");
                    userContext = await withTimeout((0, context_builder_1.buildUserContext)(userId, assetsContainer, liabilitiesContainer, expensesContainer, incomesContainer, usersContainer), 5000, "User context timeout");
                }
                catch (contextError) {
                    context.log("User context build error:", contextError);
                }
                let profileContextText = "프로필 정보 없음";
                try {
                    const usersContainer = (0, cosmosClient_1.getContainer)("users");
                    const { resource } = await usersContainer.item(userId, userId).read();
                    const profile = resource ?? undefined;
                    if (profile) {
                        const currentAge = getAgeFromBirthDate(profile.birthDate);
                        const child1Age = getAgeFromBirthDate(profile.child1BirthDate);
                        const child2Age = getAgeFromBirthDate(profile.child2BirthDate);
                        const annualBase = Number(profile.baseSalaryAnnual ?? 0);
                        const annualFixedExtra = Number(profile.annualFixedExtra ?? 0);
                        const annualBonus = Number(profile.annualBonus ?? 0);
                        const annualRsu = Number(profile.annualRsu ?? 0);
                        const rsuShares = Number(profile.rsuShares ?? 0);
                        const rsuVestingPriceUsd = Number(profile.rsuVestingPriceUsd ?? 0);
                        const totalAnnualComp = annualBase + annualFixedExtra + annualBonus + annualRsu;
                        const annualRaiseRate = Number(profile.annualRaiseRatePct ?? 0);
                        const projectedBaseNextYear = annualBase > 0 ? Math.round(annualBase * (1 + annualRaiseRate / 100)) : 0;
                        const projectedCompNextYear = projectedBaseNextYear > 0 || annualFixedExtra > 0 || annualBonus > 0 || annualRsu > 0
                            ? projectedBaseNextYear + annualFixedExtra + annualBonus + annualRsu
                            : 0;
                        const yearsToRetirement = typeof profile.retirementTargetAge === "number" && typeof currentAge === "number"
                            ? profile.retirementTargetAge - currentAge
                            : null;
                        const lines = [
                            `- 사용자 이름: ${profile.fullName ?? "미설정"}`,
                            `- 사용자 나이: ${typeof currentAge === "number" ? `${currentAge}세` : "미설정"}`,
                            `- 직장: ${profile.employerName ?? "미설정"}`,
                            `- 직무/직급: ${profile.jobTitle ?? "미설정"}`,
                            `- 연 기본급: ${annualBase > 0 ? `${annualBase.toLocaleString()}원` : "미설정"}`,
                            `- 추가지급-고정(연): ${annualFixedExtra > 0 ? `${annualFixedExtra.toLocaleString()}원` : "미설정"}`,
                            `- 연간 보너스: ${annualBonus > 0 ? `${annualBonus.toLocaleString()}원` : "미설정"}`,
                            `- 연간 RSU: ${annualRsu > 0 ? `${annualRsu.toLocaleString()}원` : "미설정"}`,
                            `- RSU 주식수: ${rsuShares > 0 ? `${rsuShares.toLocaleString()}주` : "미설정"}`,
                            `- RSU 베스팅 시가(USD): ${rsuVestingPriceUsd > 0 ? `${rsuVestingPriceUsd.toLocaleString()} USD` : "미설정"}`,
                            `- RSU 베스팅 주기: ${profile.rsuVestingCycle ?? "미설정"}`,
                            `- 연봉 상승률(기본급 기준): ${profile.annualRaiseRatePct !== undefined ? `${annualRaiseRate}%` : "미설정"}`,
                            `- 연 총보상(기본급+고정추가지급+보너스+RSU): ${totalAnnualComp > 0 ? `${totalAnnualComp.toLocaleString()}원` : "미설정"}`,
                            `- 내년 예상 기본급(상승률 반영): ${projectedBaseNextYear > 0 ? `${projectedBaseNextYear.toLocaleString()}원` : "미설정"}`,
                            `- 내년 예상 총보상: ${projectedCompNextYear > 0 ? `${projectedCompNextYear.toLocaleString()}원` : "미설정"}`,
                            `- 은퇴 목표 연령: ${typeof profile.retirementTargetAge === "number" ? `${profile.retirementTargetAge}세` : "미설정"}`,
                            `- 은퇴까지 남은 기간: ${typeof yearsToRetirement === "number" ? `${yearsToRetirement}년` : "미설정"}`,
                            `- 자녀1: ${profile.child1Name ?? "미설정"} / ${typeof child1Age === "number" ? `${child1Age}세` : "나이 미설정"} / 예상 대학 진학년도: ${typeof profile.child1TargetUniversityYear === "number" ? `${profile.child1TargetUniversityYear}년` : "미설정"}`,
                            `- 자녀2: ${profile.child2Name ?? "미설정"} / ${typeof child2Age === "number" ? `${child2Age}세` : "나이 미설정"} / 예상 대학 진학년도: ${typeof profile.child2TargetUniversityYear === "number" ? `${profile.child2TargetUniversityYear}년` : "미설정"}`
                        ];
                        profileContextText = lines.join("\n");
                    }
                }
                catch (profileError) {
                    context.log("Profile context read error:", profileError);
                }
                profileContextText = clampText(profileContextText, 2200);
                let webSearchContext = "웹 검색 결과 없음";
                try {
                    const webResults = await withTimeout((0, webSearch_1.searchWeb)(content, 4), 5000, "Web search timeout");
                    if (webResults.length > 0) {
                        webSearchContext = webResults
                            .map((item, index) => `${index + 1}. ${item.title}\n- 요약: ${item.snippet}\n- URL: ${item.url}`)
                            .join("\n\n");
                    }
                }
                catch (searchError) {
                    context.log("Web search error:", searchError);
                }
                webSearchContext = clampText(webSearchContext, 2000);
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

사용자 프로필/가족/은퇴 정보:
${profileContextText}

웹 검색 결과(최신 정보 참고용):
${webSearchContext}

사용자 질문에 대해 구체적이고 실용적인 조언을 제공하세요.`;
                // Fetch conversation history
                let history = [];
                try {
                    const historyQuery = await withTimeout(messagesContainer.items
                        .query({
                        query: "SELECT TOP 6 c.role, c.content FROM c WHERE c.userId = @userId AND c.conversationId = @conversationId AND c.type = 'AiMessage' ORDER BY c.createdAt DESC",
                        parameters: [
                            { name: "@userId", value: userId },
                            { name: "@conversationId", value: conversationId }
                        ]
                    }, { partitionKey })
                        .fetchAll(), 4000, "History query timeout");
                    history = historyQuery.resources.reverse();
                }
                catch (historyError) {
                    context.log("History query error:", historyError);
                }
                // Call Azure OpenAI
                let assistantContent = "죄송합니다. 현재 AI 서비스를 이용할 수 없습니다.";
                try {
                    const client = (0, openai_1.getOpenAIClient)();
                    const deploymentName = (0, openai_1.getDeploymentName)();
                    const boundedHistory = normalizeHistory(history, 6, 1200, 5000);
                    const messages = [
                        { role: "system", content: systemPrompt },
                        ...boundedHistory
                    ];
                    const completion = await withTimeout(client.getChatCompletions(deploymentName, messages), 45000, "OpenAI completion timeout");
                    assistantContent = completion.choices[0]?.message?.content ?? assistantContent;
                }
                catch (aiError) {
                    const primaryError = extractErrorInfo(aiError);
                    context.log("OpenAI primary error:", primaryError.statusCode, primaryError.message);
                    try {
                        const client = (0, openai_1.getOpenAIClient)();
                        const deploymentName = (0, openai_1.getDeploymentName)();
                        const compactMessages = [
                            {
                                role: "system",
                                content: "당신은 한국어 금융 상담 도우미입니다. 답변은 간결하고 실행 가능한 항목 중심으로 작성하세요."
                            },
                            { role: "user", content: clampText(content, 1200) }
                        ];
                        const retryCompletion = await withTimeout(client.getChatCompletions(deploymentName, compactMessages), 20000, "OpenAI compact retry timeout");
                        assistantContent =
                            retryCompletion.choices[0]?.message?.content ??
                                buildFallbackAdvice(content, userContext, profileContextText);
                        context.log("OpenAI compact retry succeeded after primary failure");
                    }
                    catch (retryError) {
                        const retryErrorInfo = extractErrorInfo(retryError);
                        context.log("OpenAI compact retry error:", retryErrorInfo.statusCode, retryErrorInfo.message);
                        const primaryCode = primaryError.statusCode ?? "NA";
                        const retryCode = retryErrorInfo.statusCode ?? "NA";
                        const primaryDiag = primaryError.statusCode === undefined
                            ? ` msg=${compactDiagnosticMessage(primaryError.message)}`
                            : "";
                        const retryDiag = retryErrorInfo.statusCode === undefined
                            ? ` msg=${compactDiagnosticMessage(retryErrorInfo.message)}`
                            : "";
                        assistantContent = buildFallbackAdvice(content, userContext, profileContextText, `OPENAI_FAIL primary=${primaryCode}${primaryDiag} retry=${retryCode}${retryDiag}`);
                    }
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
